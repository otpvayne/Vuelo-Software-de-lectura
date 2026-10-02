'use client';

/*
 * Visor. Con `output: 'export'` no existen rutas dinámicas en runtime (los id viven
 * en la base local), así que el libro llega por query: /lector/?id=<uuid>.
 */
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useReducedMotion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import FinishCelebration from '@/components/reader/FinishCelebration';
import GestureHint from '@/components/reader/GestureHint';
import HighlightMenu from '@/components/reader/HighlightMenu';
import HighlighterPalette from '@/components/reader/HighlighterPalette';
import NotesPanel, { type PanelTab } from '@/components/reader/NotesPanel';
import { RENDER_WINDOW } from '@/components/reader/PdfPage';
import ProgressScrubber from '@/components/reader/ProgressScrubber';
import ReaderStage, { ZOOM_STEPS, clampZoom, type ReaderStageHandle } from '@/components/reader/ReaderStage';
import ShortcutsHelp from '@/components/reader/ShortcutsHelp';
import Toolbar from '@/components/reader/Toolbar';
import UndoToast from '@/components/reader/UndoToast';
import EmptyState from '@/components/ui/EmptyState';
import { copyText } from '@/lib/clipboard';
import { HIGHLIGHT_META, type HighlightColor, type Theme } from '@/lib/constants';
import EpubReader from '@/components/reader/epub/EpubReader';
import { getStore, type Book, type Bookmark, type Highlight, type HighlightPatch, type Note } from '@/lib/db';
import type { PageSelection } from '@/lib/highlightGeometry';
import { markCelebrated, wasCelebrated } from '@/lib/goals';
import { HighlightBook } from '@/lib/highlightStore';
import { getChapters, type Chapter } from '@/lib/outline';
import { ReadingSessionTracker } from '@/lib/readingSessions';
import { PageCache, ReaderSignal } from '@/lib/pageCache';
import { playPageTurn, unlockPageSound } from '@/lib/pageSound';
import { closePdf, openPdf } from '@/lib/pdf';
import {
  getHighlightColor,
  getPaperMode,
  getSoundEnabled,
  paperModesFor,
  setHighlightColor,
  setPaperMode,
  setSoundEnabled,
  type PaperMode,
} from '@/lib/readerPrefs';
import { isTauri } from '@/lib/platform';
import { getCurrentTheme } from '@/lib/theme';

interface Loaded {
  book: Book;
  doc: PDFDocumentProxy;
  cache: PageCache;
  signal: ReaderSignal;
  highlights: HighlightBook;
  aspect: number;
}

/** Tiempo que un subrayado recién creado conserva su animación de "pintado". */
const FRESH_MS = 1500;

/** Espera máxima para guardar la sesión al cerrar la ventana (nunca bloquea el cierre). */
const CLOSE_SAVE_TIMEOUT_MS = 1500;

/** En modo enfoque, la interfaz se oculta tras este tiempo sin actividad en los bordes. */
const FOCUS_IDLE_MS = 2500;
/** Distancia al borde superior/inferior que hace reaparecer la barra en modo enfoque. */
const EDGE_PX = 96;

const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);

function PdfReader({ id, requestedPage }: { id: string | null; requestedPage: number }) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [celebrate, setCelebrate] = useState(false);
  const trackerRef = useRef<ReadingSessionTracker | null>(null);
  /** Progreso al abrir: el festejo solo sale si el libro no estaba ya terminado. */
  const initialProgress = useRef(0);
  const numPagesRef = useRef(0);
  /** El primer informe del flip fija la página de partida real (no cuenta como navegar). */
  const baselineSet = useRef(false);
  const reduce = useReducedMotion() ?? false;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [readTo, setReadTo] = useState(1);
  /**
   * Solo se guarda progreso tras un cambio real de página. Abrir un libro, tocarlo o girar la
   * pantalla (doble → simple página) no lo modifica: así un libro terminado no "baja".
   */
  const [navigated, setNavigated] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [highlighting, setHighlighting] = useState(false);
  const [hlColor, setHlColor] = useState<HighlightColor>('amarillo');
  const [panelTab, setPanelTab] = useState<PanelTab>('apuntes');
  const [menu, setMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string; onUndo?: () => void } | null>(null);
  /** Subrayados creados en esta sesión, para Ctrl+Z. */
  const created = useRef<string[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [theme, setThemeState] = useState<Theme>('dia');
  const [paper, setPaper] = useState<PaperMode>('natural');
  const [sound, setSound] = useState(false);
  const [focus, setFocus] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [goToRequest, setGoToRequest] = useState(0);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const stageRef = useRef<ReaderStageHandle>(null);
  const startPage = useRef(1);

  // ── Carga ──
  useEffect(() => {
    baselineSet.current = false;
    if (!id) {
      setFailed(true);
      return;
    }
    let doc: PDFDocumentProxy | null = null;
    let cache: PageCache | null = null;
    let cancelled = false;
    (async () => {
      const store = await getStore();
      const book = await store.getBook(id);
      if (!book) throw new Error('Libro no encontrado');
      doc = await openPdf(await store.readBookFile(book));
      cache = new PageCache(doc);
      const first = (await doc.getPage(1)).getViewport({ scale: 1 });
      const [n, h, b] = await Promise.all([
        store.listNotes(id),
        store.listHighlights(id),
        store.listBookmarks(id),
        // Marca "abierto" sin tocar el progreso.
        store.updateReading(id, book.currentPage),
      ]);
      if (cancelled) return;
      const start =
        Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= doc.numPages
          ? requestedPage
          : book.currentPage;
      const signal = new ReaderSignal();
      signal.set({ current: start });
      startPage.current = start;
      initialProgress.current = book.progress;
      numPagesRef.current = doc.numPages;
      setNotes(n);
      setBookmarks(b);
      setPage(start);
      setReadTo(start);
      // Índice del PDF (si lo trae) para las paradas del camino; no bloquea la apertura.
      void getChapters(doc).then((c) => !cancelled && setChapters(c));
      const highlights = new HighlightBook(h);
      setLoaded({ book, doc, cache, signal, highlights, aspect: first.height / first.width });
      if (process.env.NODE_ENV !== 'production') {
        (window as unknown as { __vuelo?: unknown }).__vuelo = { cache, signal, highlights, stage: stageRef };
      }
    })().catch((err: unknown) => {
      console.error(err);
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
      cache?.destroy();
      if (doc) void closePdf(doc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Sesión de lectura: empieza al abrir y termina al salir (quita sus listeners) ──
  useEffect(() => {
    if (!loaded) return;
    const tracker = new ReadingSessionTracker(loaded.book.id, startPage.current, (s) =>
      getStore().then((store) => store.saveSession(s)),
    );
    tracker.start();
    trackerRef.current = tracker;
    if (process.env.NODE_ENV !== 'production') {
      const w = window as unknown as { __vuelo?: Record<string, unknown> };
      if (w.__vuelo) w.__vuelo.session = tracker;
    }
    // Tauri: al pedir cerrar la ventana, guardar la sesión ANTES de destruirla.
    // Con un listener de close-requested, Tauri no cierra solo: onCloseRequested espera al
    // handler y luego llama a destroy() (permiso core:window:allow-destroy). El guardado tiene
    // un tope de tiempo para que nunca impida cerrar.
    let unlistenClose: (() => void) | null = null;
    let disposed = false;
    if (isTauri()) {
      void import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) =>
          getCurrentWindow().onCloseRequested(async () => {
            await Promise.race([tracker.flush(), new Promise((r) => setTimeout(r, CLOSE_SAVE_TIMEOUT_MS))]);
          }),
        )
        .then((un) => {
          if (disposed) un();
          else unlistenClose = un;
        })
        .catch((err: unknown) => console.error('Cierre de ventana:', err));
    }
    return () => {
      disposed = true;
      unlistenClose?.();
      trackerRef.current = null;
      void tracker.stop();
    };
  }, [loaded]);

  // ── Preferencias: tema → papel; sonido ──
  useEffect(() => {
    const t = getCurrentTheme();
    setThemeState(t);
    setSound(getSoundEnabled());
    const onTheme = (e: Event) => setThemeState((e as CustomEvent<Theme>).detail);
    window.addEventListener('vuelo:tema', onTheme);
    return () => window.removeEventListener('vuelo:tema', onTheme);
  }, []);
  useEffect(() => setPaper(getPaperMode(theme)), [theme]);
  useEffect(() => setHlColor(getHighlightColor()), []);

  // El audio solo arranca tras un gesto del usuario, y solo si el sonido está activado.
  useEffect(() => {
    const unlock = () => {
      if (soundRef.current) unlockPageSound();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // ── Progreso ──
  useEffect(() => {
    if (!loaded || !navigated) return;
    const t = setTimeout(() => {
      void getStore().then((s) => s.updateReading(loaded.book.id, page, readTo));
    }, 400);
    return () => clearTimeout(t);
  }, [loaded, navigated, page, readTo]);

  // ── Subrayados ──
  const onSelection = useCallback(
    async (parts: PageSelection[]) => {
      if (!loaded) return;
      const store = await getStore();
      for (const part of parts) {
        const h = await store.addHighlight({
          bookId: loaded.book.id,
          page: part.page,
          rects: part.rects,
          color: hlColor,
          text: part.text,
          note: null,
        });
        loaded.highlights.upsert(h, true);
        created.current.push(h.id);
        setTimeout(() => {
          if (loaded.highlights.freshId === h.id) loaded.highlights.freshId = null;
        }, FRESH_MS);
      }
    },
    [loaded, hlColor],
  );

  const updateHighlight = useCallback(
    (hid: string, patch: HighlightPatch) => {
      if (!loaded) return;
      loaded.highlights.update(hid, patch);
      void getStore().then((s) => s.updateHighlight(hid, patch));
    },
    [loaded],
  );

  const deleteHighlight = useCallback(
    (hid: string) => {
      if (!loaded) return;
      loaded.highlights.remove(hid);
      setMenu((m) => (m?.id === hid ? null : m));
      void getStore().then((s) => s.deleteHighlight(hid));
    },
    [loaded],
  );

  const restoreHighlight = useCallback(
    (h: Highlight) => {
      if (!loaded) return;
      loaded.highlights.upsert(h);
      created.current.push(h.id);
      void getStore().then((s) => s.restoreHighlight(h));
    },
    [loaded],
  );

  /** Ctrl+Z: quita el último subrayado creado en la sesión (con "Deshacer"). */
  const undoLastHighlight = useCallback(() => {
    if (!loaded) return;
    let h: Highlight | undefined;
    while (!h && created.current.length) h = loaded.highlights.get(created.current.pop() ?? '');
    if (!h) return;
    const removed = h;
    deleteHighlight(removed.id);
    setToast({ id: Date.now(), text: 'Subrayado quitado', onUndo: () => restoreHighlight(removed) });
  }, [loaded, deleteHighlight, restoreHighlight]);

  const copyAllHighlights = useCallback(
    (list: readonly Highlight[]) =>
      copyText(
        list
          .map((h) => {
            const meta = HIGHLIGHT_META[h.color];
            const head = `Pág. ${h.page} · ${meta.label} (${meta.meaning.toLowerCase()})`;
            return [head, `«${h.text ?? ''}»`, h.note ? `Nota: ${h.note}` : null].filter(Boolean).join('\n');
          })
          .join('\n\n'),
      ),
    [],
  );

  const chooseColor = useCallback((c: HighlightColor) => {
    setHlColor(c);
    setHighlightColor(c);
  }, []);

  const toggleHighlighting = useCallback(() => {
    setMenu(null);
    setHighlighting((on) => !on);
  }, []);

  // El menú de un subrayado se cierra al cambiar de página (su ancla deja de verse).
  useEffect(() => setMenu(null), [page]);

  // La caché conserva solo las páginas cercanas a la actual.
  useEffect(() => {
    loaded?.cache.retain(page, RENDER_WINDOW + 1);
  }, [loaded, page]);

  const onFlipStart = useCallback(() => {
    if (soundRef.current) playPageTurn();
  }, []);

  const onPageChange = useCallback(
    (p: number, r: number) => {
      if (!baselineSet.current) {
        baselineSet.current = true;
        startPage.current = p;
        trackerRef.current?.rebase(p);
      }
      setPage(p);
      setReadTo(r);
      trackerRef.current?.pageView(p);
      if (p !== startPage.current) setNavigated(true);
      // Llegó al final navegando, el libro no estaba terminado y aún no se festejó.
      const bookId = loaded?.book.id;
      if (
        bookId &&
        p !== startPage.current &&
        r >= numPagesRef.current &&
        initialProgress.current < 1 &&
        !wasCelebrated(bookId)
      ) {
        markCelebrated(bookId);
        setCelebrate(true);
      }
    },
    [loaded],
  );

  const goTo = useCallback((p: number) => stageRef.current?.jump(p), []);

  const zoomStep = useCallback(
    (dir: 1 | -1) =>
      setZoom((z) => {
        const next = dir > 0 ? ZOOM_STEPS.find((s) => s > z + 0.01) : [...ZOOM_STEPS].reverse().find((s) => s < z - 0.01);
        return clampZoom(next ?? z);
      }),
    [],
  );

  const toggleBookmark = useCallback(async () => {
    if (!loaded) return;
    const store = await getStore();
    await store.toggleBookmark(loaded.book.id, page);
    setBookmarks(await store.listBookmarks(loaded.book.id));
  }, [loaded, page]);

  const choosePaper = useCallback(
    (mode: PaperMode) => {
      setPaper(mode);
      setPaperMode(theme, mode);
    },
    [theme],
  );

  const toggleSound = useCallback(() => {
    unlockPageSound();
    setSound((on) => {
      setSoundEnabled(!on);
      return !on;
    });
  }, []);

  const toggleFocus = useCallback(() => {
    setFocus((f) => !f);
    setNotesOpen(false);
  }, []);

  // ── Teclado ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey || e.metaKey || (e.ctrlKey && !['+', '-', '=', '0', 'z', 'Z'].includes(e.key)))
        return;
      if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undoLastHighlight();
        return;
      }
      const target = e.target as HTMLElement | null;
      // La barra de progreso maneja sus propias teclas de navegación; el resto de atajos sigue activo.
      if (target?.getAttribute?.('role') === 'slider' && SLIDER_KEYS.has(e.key)) return;
      // Espacio/Enter sobre un botón o enlace: su acción normal, no pasar página.
      if ((e.key === ' ' || e.key === 'Enter') && target?.closest?.('button, a, [role="button"]')) return;
      const stage = stageRef.current;
      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
          stage?.next();
          break;
        case 'ArrowLeft':
        case 'PageUp':
          stage?.prev();
          break;
        case ' ':
          if (e.shiftKey) stage?.prev();
          else stage?.next();
          break;
        case 'Home':
          goTo(1);
          break;
        case 'End':
          goTo(loaded?.doc.numPages ?? 1);
          break;
        case 'g':
        case 'G':
          setGoToRequest((n) => n + 1);
          setChromeVisible(true);
          break;
        case 'f':
        case 'F':
          toggleFocus();
          break;
        case 'h':
        case 'H':
          toggleHighlighting();
          break;
        case '+':
        case '=':
          zoomStep(1);
          break;
        case '-':
        case '_':
          zoomStep(-1);
          break;
        case '0':
          setZoom(1);
          break;
        case '?':
          setHelpOpen((o) => !o);
          break;
        case 'Escape':
          if (helpOpen) setHelpOpen(false);
          else if (notesOpen) setNotesOpen(false);
          else if (highlighting) setHighlighting(false);
          else if (focus) setFocus(false);
          else if (zoom > 1) setZoom(1);
          else return;
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loaded, focus, helpOpen, notesOpen, highlighting, zoom, goTo, toggleFocus, toggleHighlighting, zoomStep, undoLastHighlight]);

  // ── Modo enfoque: la interfaz aparece al acercarse a los bordes y se oculta sola ──
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(hideTimer.current);
    if (!focus) {
      setChromeVisible(true);
      return;
    }
    setChromeVisible(false);
    const reveal = (y: number) => {
      if (y > EDGE_PX && y < window.innerHeight - EDGE_PX) return;
      setChromeVisible(true);
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setChromeVisible(false), FOCUS_IDLE_MS);
    };
    const onMove = (e: PointerEvent) => reveal(e.clientY);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
      clearTimeout(hideTimer.current);
    };
  }, [focus]);

  if (failed) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <EmptyState
          title="Este libro se ha perdido en el viaje"
          description="No encontramos el PDF. Puede que se haya borrado de la biblioteca."
          action={
            <Link href="/" className="rounded-tarjeta bg-acento px-6 py-3 font-semibold text-tinta dark:text-fondo">
              Volver a la biblioteca
            </Link>
          }
        />
      </main>
    );
  }

  if (!loaded) return <ReaderLoading />;

  const { book, doc, cache, signal, highlights, aspect } = loaded;
  const chromeHidden = focus && !chromeVisible;

  return (
    <div
      className={`papel-${paper} lapiz-${hlColor} h-dvh overflow-hidden bg-fondo`}
      data-enfoque={focus || undefined}
      data-subrayando={highlighting || undefined}
    >
      <Toolbar
        title={book.title}
        page={page}
        lastVisible={readTo}
        pageCount={doc.numPages}
        bookmarked={bookmarks.some((b) => b.page === page)}
        notesOpen={notesOpen}
        highlighting={highlighting}
        zoom={zoom}
        paper={paper}
        paperModes={paperModesFor(theme)}
        sound={sound}
        hidden={chromeHidden}
        goToRequest={goToRequest}
        onPrev={() => stageRef.current?.prev()}
        onNext={() => stageRef.current?.next()}
        onGoTo={goTo}
        onToggleBookmark={() => void toggleBookmark()}
        onToggleNotes={() => setNotesOpen((o) => !o)}
        onToggleHighlight={toggleHighlighting}
        onZoomIn={() => zoomStep(1)}
        onZoomOut={() => zoomStep(-1)}
        onZoomReset={() => setZoom(1)}
        onPaper={choosePaper}
        onToggleSound={toggleSound}
        onToggleFocus={toggleFocus}
        onHelp={() => setHelpOpen(true)}
        notebookHref={`/cuaderno/?id=${encodeURIComponent(book.id)}`}
      />

      <main
        className={`size-full transition-[padding] duration-300 ${
          focus ? 'px-2 py-3 sm:px-6 sm:py-5' : 'px-3 pb-20 pt-[4.5rem] sm:px-10 sm:pb-24 sm:pt-24'
        } ${reduce ? 'transition-none' : ''}`}
      >
        <ReaderStage
          ref={stageRef}
          cache={cache}
          signal={signal}
          numPages={doc.numPages}
          aspect={aspect}
          page={page}
          highlights={highlights}
          onOpenHighlight={(h, anchor) => setMenu({ id: h.id, anchor })}
          highlighting={highlighting}
          onSelection={(parts) => void onSelection(parts)}
          reduceMotion={reduce}
          zoom={zoom}
          onZoomChange={setZoom}
          onPageChange={onPageChange}
          onFlipStart={onFlipStart}
        />
      </main>

      <ProgressScrubber
        page={page}
        lastVisible={readTo}
        pageCount={doc.numPages}
        hidden={chromeHidden || highlighting}
        onGoTo={goTo}
        bookmarks={bookmarks.map((b) => b.page)}
        notes={notes.map((n) => n.page)}
        highlights={highlights}
        chapters={chapters}
      />

      <NotesPanel
        open={notesOpen && !focus}
        tab={panelTab}
        onTab={setPanelTab}
        page={page}
        notes={notes}
        bookmarks={bookmarks}
        highlights={highlights}
        onClose={() => setNotesOpen(false)}
        onRemoveBookmark={async (p) => {
          const store = await getStore();
          await store.toggleBookmark(book.id, p);
          setBookmarks(await store.listBookmarks(book.id));
        }}
        onUpdateHighlight={updateHighlight}
        onDeleteHighlight={deleteHighlight}
        onCopyAll={copyAllHighlights}
        onGoTo={goTo}
        onAdd={async (content) => {
          const store = await getStore();
          const note = await store.addNote(book.id, page, content);
          setNotes((prev) => [...prev, note].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt));
        }}
        onDelete={async (noteId) => {
          await (await getStore()).deleteNote(noteId);
          setNotes((prev) => prev.filter((n) => n.id !== noteId));
        }}
      />

      <HighlighterPalette
        open={highlighting && !(focus && !chromeVisible)}
        color={hlColor}
        onColor={chooseColor}
        onDone={() => setHighlighting(false)}
      />
      {menu && (
        <HighlightMenu
          key={menu.id}
          store={highlights}
          id={menu.id}
          anchor={menu.anchor}
          onUpdate={updateHighlight}
          onDelete={deleteHighlight}
          onCopy={copyText}
          onClose={() => setMenu(null)}
        />
      )}
      <UndoToast toast={toast} onClose={() => setToast(null)} />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <GestureHint />
      <FinishCelebration title={book.title} open={celebrate} onClose={() => setCelebrate(false)} />
    </div>
  );
}

function ReaderLoading() {
  return (
    <main className="grid min-h-dvh place-items-center" aria-busy>
      <Loader2 className="size-8 text-tinta-suave/50 motion-safe:animate-spin" aria-label="Abriendo libro" />
    </main>
  );
}

/**
 * Elige el motor según el formato del libro: PDF (páginas fijas, lector de siempre) o EPUB (texto
 * que se reajusta). Cada motor carga y libera lo suyo; aquí solo se mira el formato.
 */
function Reader() {
  const params = useSearchParams();
  const id = params.get('id');
  /** Página pedida desde el Cuaderno (?p=N). Abrir ahí no cambia el progreso. */
  const requestedPage = Number(params.get('p'));
  const [epubBook, setEpubBook] = useState<Book | null>(null);
  const [kind, setKind] = useState<'pdf' | 'epub' | null>(null);

  useEffect(() => {
    let cancelled = false;
    setKind(null);
    if (!id) {
      setKind('pdf'); // sin id: el lector de PDF muestra «libro perdido»
      return;
    }
    getStore()
      .then((s) => s.getBook(id))
      .then((b) => {
        if (cancelled) return;
        setEpubBook(b?.format === 'epub' ? b : null);
        setKind(b?.format === 'epub' ? 'epub' : 'pdf');
      })
      .catch(() => !cancelled && setKind('pdf'));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (kind === null) return <ReaderLoading />;
  if (kind === 'epub' && epubBook) return <EpubReader key={epubBook.id} book={epubBook} requestedPage={requestedPage} />;
  return <PdfReader id={id} requestedPage={requestedPage} />;
}

export default function ReaderPage() {
  return (
    <Suspense fallback={<ReaderLoading />}>
      <Reader />
    </Suspense>
  );
}
