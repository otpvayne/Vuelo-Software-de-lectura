'use client';

/*
 * Visor. Con `output: 'export'` no existen rutas dinámicas en runtime (los id viven
 * en la base local), así que el libro llega por query: /lector/?id=<uuid>.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useReducedMotion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import GestureHint from '@/components/reader/GestureHint';
import NotesPanel from '@/components/reader/NotesPanel';
import { RENDER_WINDOW } from '@/components/reader/PdfPage';
import ProgressScrubber from '@/components/reader/ProgressScrubber';
import ReaderStage, { ZOOM_STEPS, clampZoom, type ReaderStageHandle } from '@/components/reader/ReaderStage';
import ShortcutsHelp from '@/components/reader/ShortcutsHelp';
import Toolbar from '@/components/reader/Toolbar';
import EmptyState from '@/components/ui/EmptyState';
import type { Theme } from '@/lib/constants';
import { getStore, type Book, type Bookmark, type Highlight, type Note } from '@/lib/db';
import { PageCache, ReaderSignal } from '@/lib/pageCache';
import { playPageTurn, unlockPageSound } from '@/lib/pageSound';
import { closePdf, openPdf } from '@/lib/pdf';
import {
  getPaperMode,
  getSoundEnabled,
  paperModesFor,
  setPaperMode,
  setSoundEnabled,
  type PaperMode,
} from '@/lib/readerPrefs';
import { getCurrentTheme } from '@/lib/theme';

interface Loaded {
  book: Book;
  doc: PDFDocumentProxy;
  cache: PageCache;
  signal: ReaderSignal;
  aspect: number;
}

/** En modo enfoque, la interfaz se oculta tras este tiempo sin actividad en los bordes. */
const FOCUS_IDLE_MS = 2500;
/** Distancia al borde superior/inferior que hace reaparecer la barra en modo enfoque. */
const EDGE_PX = 96;

const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);

function Reader() {
  const id = useSearchParams().get('id');
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
  const [highlights, setHighlights] = useState<Highlight[]>([]);
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
      const signal = new ReaderSignal();
      signal.set({ current: book.currentPage });
      startPage.current = book.currentPage;
      setNotes(n);
      setHighlights(h);
      setBookmarks(b);
      setPage(book.currentPage);
      setReadTo(book.currentPage);
      setLoaded({ book, doc, cache, signal, aspect: first.height / first.width });
      if (process.env.NODE_ENV !== 'production') {
        (window as unknown as { __vuelo?: unknown }).__vuelo = { cache, signal, stage: stageRef };
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
  }, [id]);

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

  // La caché conserva solo las páginas cercanas a la actual.
  useEffect(() => {
    loaded?.cache.retain(page, RENDER_WINDOW + 1);
  }, [loaded, page]);

  const onFlipStart = useCallback(() => {
    if (soundRef.current) playPageTurn();
  }, []);

  const onPageChange = useCallback((p: number, r: number) => {
    setPage(p);
    setReadTo(r);
    if (p !== startPage.current) setNavigated(true);
  }, []);

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
      if (isTyping(e.target) || e.altKey || e.metaKey || (e.ctrlKey && !['+', '-', '=', '0'].includes(e.key))) return;
      const target = e.target as HTMLElement | null;
      // La barra de progreso maneja sus propias teclas de navegación; el resto de atajos sigue activo.
      if (target?.getAttribute?.('role') === 'slider' && SLIDER_KEYS.has(e.key)) return;
      // Espacio/Enter sobre un botón o enlace: su acción normal, no pasar página.
      if ((e.key === ' ' || e.key === 'Enter') && target?.closest?.('button, a')) return;
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
  }, [loaded, focus, helpOpen, notesOpen, zoom, goTo, toggleFocus, zoomStep]);

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

  const highlightsByPage = useMemo(() => {
    const map = new Map<number, Highlight[]>();
    for (const h of highlights) map.set(h.page, [...(map.get(h.page) ?? []), h]);
    return map;
  }, [highlights]);

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

  const { book, doc, cache, signal, aspect } = loaded;
  const chromeHidden = focus && !chromeVisible;

  return (
    <div className={`papel-${paper} h-dvh overflow-hidden bg-fondo`} data-enfoque={focus || undefined}>
      <Toolbar
        title={book.title}
        page={page}
        lastVisible={readTo}
        pageCount={doc.numPages}
        bookmarked={bookmarks.some((b) => b.page === page)}
        notesOpen={notesOpen}
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
        onZoomIn={() => zoomStep(1)}
        onZoomOut={() => zoomStep(-1)}
        onZoomReset={() => setZoom(1)}
        onPaper={choosePaper}
        onToggleSound={toggleSound}
        onToggleFocus={toggleFocus}
        onHelp={() => setHelpOpen(true)}
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
          highlightsByPage={highlightsByPage}
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
        hidden={chromeHidden}
        onGoTo={goTo}
      />

      <NotesPanel
        open={notesOpen && !focus}
        page={page}
        notes={notes}
        onClose={() => setNotesOpen(false)}
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

      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <GestureHint />
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

export default function ReaderPage() {
  return (
    <Suspense fallback={<ReaderLoading />}>
      <Reader />
    </Suspense>
  );
}
