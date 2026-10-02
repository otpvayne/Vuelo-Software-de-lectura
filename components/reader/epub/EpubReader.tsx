'use client';

/*
 * Lector de EPUB: segundo motor de lectura de Vuelo. Es texto que se reajusta (epub.ts, fork mantenido
 * de epub.js, en modo paginado), no páginas fijas: por eso no usa la caché de canvas ni los rects del PDF.
 * Lo que sí comparte con el lector de PDF (Toolbar, ProgressScrubber, NotesPanel, sesiones, enfoque,
 * sonido, atajos) se reutiliza tal cual; las "páginas" son las estimadas de lib/epub.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Book as EpubBook, Contents, Rendition } from '@likecoin/epub-ts';
import { useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import FinishCelebration from '@/components/reader/FinishCelebration';
import HighlightMenu from '@/components/reader/HighlightMenu';
import HighlighterPalette from '@/components/reader/HighlighterPalette';
import NotesPanel, { type PanelTab } from '@/components/reader/NotesPanel';
import ProgressScrubber from '@/components/reader/ProgressScrubber';
import ShortcutsHelp from '@/components/reader/ShortcutsHelp';
import Toolbar from '@/components/reader/Toolbar';
import UndoToast from '@/components/reader/UndoToast';
import EmptyState from '@/components/ui/EmptyState';
import { copyText } from '@/lib/clipboard';
import { HIGHLIGHT_META, type HighlightColor, type Theme } from '@/lib/constants';
import { getStore, type Book, type Bookmark, type Highlight, type HighlightPatch, type Note } from '@/lib/db';
import {
  EPUB_CHARS_PER_PAGE,
  EPUB_FONT_STEP,
  EPUB_SPREAD_MIN_WIDTH,
  clampEpubFont,
  closeEpub,
  epubContentCss,
  epubPalette,
  openEpub,
  startOfCfi,
  type EpubFont,
} from '@/lib/epub';
import { markCelebrated, wasCelebrated } from '@/lib/goals';
import { HighlightBook } from '@/lib/highlightStore';
import type { Chapter } from '@/lib/outline';
import { playPageTurn, unlockPageSound } from '@/lib/pageSound';
import { ReadingSessionTracker } from '@/lib/readingSessions';
import {
  getEpubFont,
  getEpubFontSize,
  getHighlightColor,
  getPaperMode,
  getSoundEnabled,
  paperModesFor,
  setEpubFont,
  setEpubFontSize,
  setHighlightColor,
  setPaperMode,
  setSoundEnabled,
  type PaperMode,
} from '@/lib/readerPrefs';
import { isTauri } from '@/lib/platform';
import { getCurrentTheme } from '@/lib/theme';

interface Loaded {
  epub: EpubBook;
  highlights: HighlightBook;
  /** Páginas estimadas del libro (ubicaciones). */
  total: number;
  chapters: Chapter[];
}

const FRESH_MS = 1500;
const CLOSE_SAVE_TIMEOUT_MS = 1500;
const FOCUS_IDLE_MS = 2500;
const EDGE_PX = 96;
const SWIPE_PX = 48;
const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Máximo de paradas en el camino: un libro con cientos de capítulos lo volvería un código de barras. */
const MAX_STOPS = 60;
function spaceOut(chapters: Chapter[], total: number): Chapter[] {
  if (chapters.length <= MAX_STOPS) return chapters;
  const gap = total / MAX_STOPS;
  const kept: Chapter[] = [];
  for (const c of chapters) {
    const last = kept[kept.length - 1];
    if (!last || c.page - last.page >= gap) kept.push(c);
  }
  return kept;
}

export default function EpubReader({ book, requestedPage }: { book: Book; requestedPage: number }) {
  const reduce = useReducedMotion() ?? false;
  const hostRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState(book.currentPage);
  const [readTo, setReadTo] = useState(book.currentPage);
  const [navigated, setNavigated] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [highlighting, setHighlighting] = useState(false);
  const [hlColor, setHlColor] = useState<HighlightColor>('amarillo');
  const [panelTab, setPanelTab] = useState<PanelTab>('apuntes');
  const [menu, setMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string; onUndo?: () => void } | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [theme, setThemeState] = useState<Theme>('dia');
  const [paper, setPaper] = useState<PaperMode>('natural');
  const [sound, setSound] = useState(false);
  const [fontPct, setFontPct] = useState(100);
  const [font, setFont] = useState<EpubFont>('serif');
  const [focus, setFocus] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [goToRequest, setGoToRequest] = useState(0);

  // Referencias para los manejadores que viven dentro del iframe y no se re-crean en cada render.
  const created = useRef<string[]>([]);
  const trackerRef = useRef<ReadingSessionTracker | null>(null);
  const userNav = useRef(false);
  const baselineSet = useRef(false);
  const startPage = useRef(book.currentPage);
  const locatorRef = useRef<string | null>(book.locator);
  const initialProgress = useRef(book.progress);
  const totalRef = useRef(book.pageCount);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const highlightingRef = useRef(highlighting);
  highlightingRef.current = highlighting;
  const hlColorRef = useRef(hlColor);
  hlColorRef.current = hlColor;
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  const revealRef = useRef<(y: number) => void>(() => undefined);
  const pageRef = useRef(page);
  pageRef.current = page;
  const fontPctRef = useRef(fontPct);
  fontPctRef.current = fontPct;
  /** Último tamaño aplicado al libro: solo un cambio real del usuario reajusta y reposiciona. */
  const appliedFont = useRef<number | null>(null);

  // ── Carga del libro y de sus datos ──
  useEffect(() => {
    let cancelled = false;
    let epub: EpubBook | null = null;
    (async () => {
      const store = await getStore();
      epub = await openEpub(await store.readBookFile(book));
      await epub.locations.generate(EPUB_CHARS_PER_PAGE);
      const total = Math.max(1, epub.locations.length());
      const [n, h, b] = await Promise.all([
        store.listNotes(book.id),
        store.listHighlights(book.id),
        store.listBookmarks(book.id),
        // Marca "abierto" sin tocar progreso ni posición.
        store.updateReading(book.id, book.currentPage),
      ]);
      const chapters: Chapter[] = [];
      for (const item of epub.navigation?.toc ?? []) {
        const idx = epub.locations.locationFromHref(item.href);
        if (idx >= 0) chapters.push({ title: norm(item.label ?? ''), page: Math.min(total, idx + 1) });
      }
      chapters.sort((x, y) => x.page - y.page);
      if (cancelled) return;
      totalRef.current = total;
      setNotes(n);
      setBookmarks(b);
      setLoaded({ epub, highlights: new HighlightBook(h), total, chapters: spaceOut(chapters, total) });
    })().catch((err: unknown) => {
      console.error(err);
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
      if (epub) closeEpub(epub);
    };
  }, [book]);

  // ── Preferencias ──
  useEffect(() => {
    setThemeState(getCurrentTheme());
    setSound(getSoundEnabled());
    setFontPct(getEpubFontSize());
    setFont(getEpubFont());
    setHlColor(getHighlightColor());
    const onTheme = (e: Event) => setThemeState((e as CustomEvent<Theme>).detail);
    window.addEventListener('vuelo:tema', onTheme);
    return () => window.removeEventListener('vuelo:tema', onTheme);
  }, []);
  useEffect(() => setPaper(getPaperMode(theme)), [theme]);

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

  // ── Sesión de lectura (igual que en PDF) ──
  useEffect(() => {
    if (!loaded) return;
    const tracker = new ReadingSessionTracker(book.id, startPage.current, (s) =>
      getStore().then((store) => store.saveSession(s)),
    );
    tracker.start();
    trackerRef.current = tracker;
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
  }, [loaded, book.id]);

  // ── Tema y papel del contenido ──
  const applyContentCss = useCallback(
    (contents: Contents) => {
      contents.addStylesheetCss(epubContentCss(epubPalette(theme, paper), font), 'vuelo-tema');
    },
    [theme, paper, font],
  );
  const applyCssRef = useRef(applyContentCss);
  applyCssRef.current = applyContentCss;

  // Color de la «hoja» que rodea al texto (mismos tokens que el contenido).
  const sheet = typeof document === 'undefined' ? null : epubPalette(theme, paper);

  // ── Navegación ──
  const next = useCallback(() => {
    userNav.current = true;
    if (soundRef.current) playPageTurn();
    void renditionRef.current?.next();
  }, []);
  const prev = useCallback(() => {
    userNav.current = true;
    if (soundRef.current) playPageTurn();
    void renditionRef.current?.prev();
  }, []);
  const goTo = useCallback(
    (p: number) => {
      const r = renditionRef.current;
      if (!r || !loaded) return;
      const cfi = loaded.epub.locations.cfiFromLocation(Math.min(loaded.total, Math.max(1, p)) - 1);
      if (typeof cfi !== 'string') return;
      userNav.current = true;
      void r.display(startOfCfi(cfi));
    },
    [loaded],
  );

  // ── Rendición ──
  useEffect(() => {
    const host = hostRef.current;
    if (!loaded || !host) return;
    const { epub, highlights, total } = loaded;
    let disposed = false;
    const rendition = epub.renderTo(host, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: 'auto',
      minSpreadWidth: EPUB_SPREAD_MIN_WIDTH,
      allowScriptedContent: false,
    });
    renditionRef.current = rendition;
    rendition.themes.fontSize(`${fontPctRef.current}%`);
    appliedFont.current = fontPctRef.current;

    rendition.hooks.content.register((contents: Contents) => {
      applyCssRef.current(contents);
      const doc = contents.document;
      const frame = () => (contents.window.frameElement as HTMLElement | null)?.getBoundingClientRect();
      // El iframe es otro documento: sus eventos no llegan a la ventana. Se reenvían los útiles.
      doc.addEventListener('keydown', (e) => keyRef.current(e));
      const activity = (e: Event) => {
        window.dispatchEvent(new Event('pointermove')); // el reloj de sesión lo cuenta como actividad
        const y = (e as MouseEvent).clientY;
        if (typeof y === 'number') revealRef.current(y + (frame()?.top ?? 0));
      };
      for (const t of ['pointermove', 'pointerdown', 'wheel', 'touchstart']) {
        doc.addEventListener(t, activity, { passive: true });
      }
      let sx = 0;
      let sy = 0;
      doc.addEventListener(
        'touchstart',
        (e) => {
          sx = e.changedTouches[0]?.clientX ?? 0;
          sy = e.changedTouches[0]?.clientY ?? 0;
        },
        { passive: true },
      );
      doc.addEventListener(
        'touchend',
        (e) => {
          const dx = (e.changedTouches[0]?.clientX ?? 0) - sx;
          const dy = (e.changedTouches[0]?.clientY ?? 0) - sy;
          if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5 && !highlightingRef.current) {
            if (dx < 0) next();
            else prev();
          }
        },
        { passive: true },
      );
    });

    rendition.on('relocated', (loc) => {
      if (disposed) return;
      const idx = epub.locations.locationFromCfi(loc.start.cfi);
      const p = Math.min(total, Math.max(1, (idx >= 0 ? idx : pageRef.current - 1) + 1));
      const endPct = epub.locations.percentageFromCfi(loc.end.cfi);
      const r = loc.atEnd ? total : Math.min(total, Math.max(p, Math.ceil((endPct ?? p / total) * total)));
      locatorRef.current = loc.start.cfi;
      if (!baselineSet.current) {
        // La primera ubicación informada es la de partida real: no cuenta como navegar.
        baselineSet.current = true;
        startPage.current = p;
        trackerRef.current?.rebase(p);
      }
      setPage(p);
      setReadTo(r);
      trackerRef.current?.pageView(p);
      if (userNav.current) {
        userNav.current = false;
        setNavigated(true);
        if (r >= total && initialProgress.current < 1 && !wasCelebrated(book.id)) {
          markCelebrated(book.id);
          setCelebrate(true);
        }
      }
    });

    // epub.js informa la selección con retardo y mientras se arrastra: se guarda al soltar, como en PDF.
    let pointerDown = false;
    let pending: { cfiRange: string; contents: Contents } | null = null;
    const commit = () => {
      const sel = pending;
      pending = null;
      if (!sel || !highlightingRef.current) return;
      const { cfiRange, contents } = sel;
      void (async () => {
        try {
          const range = await epub.getRange(cfiRange);
          const text = norm(range.toString());
          if (!text) return;
          const idx = epub.locations.locationFromCfi(cfiRange);
          const store = await getStore();
          const h = await store.addHighlight({
            bookId: book.id,
            page: Math.min(total, Math.max(1, (idx >= 0 ? idx : pageRef.current - 1) + 1)),
            rects: [],
            color: hlColorRef.current,
            text,
            note: null,
            cfi: cfiRange,
            chapterHref: epub.spine.get(cfiRange)?.href ?? null,
          });
          highlights.upsert(h, true);
          created.current.push(h.id);
          setTimeout(() => {
            if (highlights.freshId === h.id) highlights.freshId = null;
          }, FRESH_MS);
          contents.window.getSelection()?.removeAllRanges();
        } catch (err) {
          console.error('Subrayado EPUB:', err);
        }
      })();
    };
    rendition.on('selected', (cfiRange: string, contents: Contents) => {
      pending = { cfiRange, contents };
      if (!pointerDown) commit();
    });
    rendition.hooks.content.register((contents: Contents) => {
      const doc = contents.document;
      doc.addEventListener('pointerdown', () => (pointerDown = true), { passive: true });
      const up = () => {
        pointerDown = false;
        // La selección final llega ~250 ms después de soltar.
        setTimeout(commit, 320);
      };
      doc.addEventListener('pointerup', up, { passive: true });
      doc.addEventListener('pointercancel', up, { passive: true });
    });

    // Posición de partida: la pedida desde el Cuaderno, o la guardada, o el principio.
    const startCfi =
      Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= total
        ? epub.locations.cfiFromLocation(requestedPage - 1)
        : locatorRef.current;
    void (async () => {
      try {
        await rendition.display(typeof startCfi === 'string' && startCfi ? startOfCfi(startCfi) : undefined);
      } catch (err) {
        console.warn('EPUB: posición guardada no válida, se abre al principio', err);
        await rendition.display().catch(() => setFailed(true));
      }
      if (!disposed) setReady(true);
    })();

    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __vueloEpub?: unknown }).__vueloEpub = { epub, rendition, highlights };
    }
    return () => {
      disposed = true;
      setReady(false);
      renditionRef.current = null;
      try {
        rendition.destroy();
      } catch {
        // ya destruida
      }
    };
    // La rendición vive mientras viva el libro cargado; lo demás entra por refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Tema, papel y tipo de letra: se reinyecta el CSS en los iframes abiertos.
  useEffect(() => {
    const r = renditionRef.current;
    if (!r || !ready) return;
    r.getContents().forEach((c) => applyContentCss(c));
  }, [ready, applyContentCss]);

  // Tamaño de letra: reajusta el texto y vuelve a la misma posición.
  useEffect(() => {
    const r = renditionRef.current;
    if (!r || !ready || appliedFont.current === fontPct) return;
    appliedFont.current = fontPct;
    const keep = locatorRef.current;
    r.themes.fontSize(`${fontPct}%`);
    if (keep) void r.display(keep).catch(() => undefined);
  }, [ready, fontPct]);

  // ── Progreso (solo tras navegar, con debounce) ──
  useEffect(() => {
    if (!loaded || !navigated) return;
    const t = setTimeout(() => {
      void getStore().then((s) => s.updateReading(book.id, page, readTo, locatorRef.current ?? undefined));
    }, 400);
    return () => clearTimeout(t);
  }, [loaded, navigated, page, readTo, book.id]);

  // ── Subrayados: la capa de epub.js sigue al HighlightBook ──
  useEffect(() => {
    const r = renditionRef.current;
    if (!loaded || !r || !ready) return;
    const { highlights } = loaded;
    const applied = new Map<string, { cfi: string; color: HighlightColor }>();
    const openMenu = (id: string) => (e: Event) => {
      const t = e.target;
      if (t instanceof Element) setMenu({ id, anchor: t as unknown as HTMLElement });
    };
    const sync = () => {
      const want = new Map(highlights.all().filter((h) => h.cfi).map((h) => [h.id, h]));
      for (const [id, a] of applied) {
        const w = want.get(id);
        if (!w || w.cfi !== a.cfi || w.color !== a.color) {
          r.annotations.remove(a.cfi, 'highlight');
          applied.delete(id);
        }
      }
      for (const [id, h] of want) {
        if (applied.has(id) || !h.cfi) continue;
        try {
          r.annotations.highlight(h.cfi, { id }, openMenu(id), `epub-hl-${h.color}`, {});
          applied.set(id, { cfi: h.cfi, color: h.color });
        } catch (err) {
          console.warn('Subrayado EPUB no aplicable', err);
        }
      }
    };
    sync();
    const off = highlights.subscribe(sync);
    return () => {
      off();
      for (const a of applied.values()) {
        try {
          r.annotations.remove(a.cfi, 'highlight');
        } catch {
          // la rendición ya se destruyó
        }
      }
    };
  }, [loaded, ready]);

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
            return [`Pág. ≈${h.page} · ${meta.label} (${meta.meaning.toLowerCase()})`, `«${h.text ?? ''}»`, h.note ? `Nota: ${h.note}` : null]
              .filter(Boolean)
              .join('\n');
          })
          .join('\n\n'),
      ),
    [],
  );

  useEffect(() => setMenu(null), [page]);

  const chooseColor = useCallback((c: HighlightColor) => {
    setHlColor(c);
    setHighlightColor(c);
  }, []);
  const toggleHighlighting = useCallback(() => {
    setMenu(null);
    setHighlighting((on) => !on);
  }, []);
  const toggleBookmark = useCallback(async () => {
    const store = await getStore();
    await store.toggleBookmark(book.id, page);
    setBookmarks(await store.listBookmarks(book.id));
  }, [book.id, page]);
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
  const changeFont = useCallback((delta: number | 'reset') => {
    setFontPct((p) => {
      const n = delta === 'reset' ? 100 : clampEpubFont(p + delta);
      setEpubFontSize(n);
      return n;
    });
  }, []);
  const chooseFont = useCallback((f: EpubFont) => {
    setFont(f);
    setEpubFont(f);
  }, []);

  // ── Teclado (ventana + iframe) ──
  keyRef.current = (e: KeyboardEvent) => {
    if (isTyping(e.target) || e.altKey || e.metaKey || (e.ctrlKey && !['+', '-', '=', '0', 'z', 'Z'].includes(e.key))) return;
    if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      undoLastHighlight();
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target?.getAttribute?.('role') === 'slider' && SLIDER_KEYS.has(e.key)) return;
    if ((e.key === ' ' || e.key === 'Enter') && target?.closest?.('button, a, [role="button"]')) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
        next();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        prev();
        break;
      case ' ':
        if (e.shiftKey) prev();
        else next();
        break;
      case 'Home':
        goTo(1);
        break;
      case 'End':
        goTo(loaded?.total ?? 1);
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
        changeFont(EPUB_FONT_STEP);
        break;
      case '-':
      case '_':
        changeFont(-EPUB_FONT_STEP);
        break;
      case '0':
        changeFont('reset');
        break;
      case '?':
        setHelpOpen((o) => !o);
        break;
      case 'Escape':
        if (helpOpen) setHelpOpen(false);
        else if (notesOpen) setNotesOpen(false);
        else if (highlighting) setHighlighting(false);
        else if (focus) setFocus(false);
        else return;
        break;
      default:
        return;
    }
    e.preventDefault();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Modo enfoque ──
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(hideTimer.current);
    if (!focus) {
      setChromeVisible(true);
      revealRef.current = () => undefined;
      return;
    }
    setChromeVisible(false);
    const reveal = (y: number) => {
      if (y > EDGE_PX && y < window.innerHeight - EDGE_PX) return;
      setChromeVisible(true);
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setChromeVisible(false), FOCUS_IDLE_MS);
    };
    revealRef.current = reveal;
    // Los eventos sintéticos que reenvía el iframe para el reloj de sesión no traen coordenadas.
    const onMove = (e: Event) => e instanceof PointerEvent && reveal(e.clientY);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onMove);
    return () => {
      revealRef.current = () => undefined;
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
          description="No pudimos abrir el EPUB. Puede que esté dañado o que se haya borrado de la biblioteca."
          action={
            <Link href="/" className="rounded-tarjeta bg-acento px-6 py-3 font-semibold text-tinta dark:text-fondo">
              Volver a la biblioteca
            </Link>
          }
        />
      </main>
    );
  }

  const chromeHidden = focus && !chromeVisible;
  const total = loaded?.total ?? book.pageCount;

  return (
    <div
      className={`papel-${paper} lapiz-${hlColor} h-dvh overflow-hidden bg-fondo`}
      data-enfoque={focus || undefined}
      data-subrayando={highlighting || undefined}
      data-formato="epub"
    >
      <Toolbar
        title={book.title}
        page={page}
        lastVisible={readTo}
        pageCount={total}
        bookmarked={bookmarks.some((b) => b.page === page)}
        notesOpen={notesOpen}
        highlighting={highlighting}
        zoom={1}
        paper={paper}
        paperModes={paperModesFor(theme)}
        sound={sound}
        hidden={chromeHidden}
        goToRequest={goToRequest}
        approxPages
        fontControls={{
          percent: fontPct,
          font,
          onSmaller: () => changeFont(-EPUB_FONT_STEP),
          onBigger: () => changeFont(EPUB_FONT_STEP),
          onReset: () => changeFont('reset'),
          onFont: chooseFont,
        }}
        onPrev={prev}
        onNext={next}
        onGoTo={goTo}
        onToggleBookmark={() => void toggleBookmark()}
        onToggleNotes={() => setNotesOpen((o) => !o)}
        onToggleHighlight={toggleHighlighting}
        onZoomIn={() => undefined}
        onZoomOut={() => undefined}
        onZoomReset={() => undefined}
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
        <div className="relative mx-auto h-full w-full max-w-[1400px]">
          <div
            ref={hostRef}
            className="epub-host h-full w-full overflow-hidden rounded-tarjeta shadow-flotante"
            style={sheet ? { background: sheet.paper } : undefined}
            aria-label={`Texto de ${book.title}`}
          />
          {!ready && (
            <div className="absolute inset-0 grid place-items-center" aria-busy>
              <Loader2 className="size-8 text-tinta-suave/50 motion-safe:animate-spin" aria-label="Abriendo libro" />
            </div>
          )}
          {/* Zonas de página a los lados: ratón y táctil sin depender de las flechas. */}
          <button
            type="button"
            onClick={prev}
            disabled={page <= 1}
            aria-label="Página anterior"
            className="epub-lado left-0 -translate-x-1/2 max-sm:translate-x-0"
          >
            <ChevronLeft className="size-5" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={next}
            disabled={readTo >= total}
            aria-label="Página siguiente"
            className="epub-lado right-0 translate-x-1/2 max-sm:translate-x-0"
          >
            <ChevronRight className="size-5" strokeWidth={1.8} />
          </button>
        </div>
      </main>

      {loaded && (
        <>
          <ProgressScrubber
            page={page}
            lastVisible={readTo}
            pageCount={total}
            hidden={chromeHidden || highlighting}
            onGoTo={goTo}
            bookmarks={bookmarks.map((b) => b.page)}
            notes={notes.map((n) => n.page)}
            highlights={loaded.highlights}
            chapters={loaded.chapters}
          />
          <NotesPanel
            open={notesOpen && !focus}
            tab={panelTab}
            onTab={setPanelTab}
            page={page}
            notes={notes}
            bookmarks={bookmarks}
            highlights={loaded.highlights}
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
          {menu && (
            <HighlightMenu
              key={menu.id}
              store={loaded.highlights}
              id={menu.id}
              anchor={menu.anchor}
              onUpdate={updateHighlight}
              onDelete={deleteHighlight}
              onCopy={copyText}
              onClose={() => setMenu(null)}
            />
          )}
        </>
      )}

      <HighlighterPalette
        open={highlighting && !chromeHidden}
        color={hlColor}
        onColor={chooseColor}
        onDone={() => setHighlighting(false)}
      />
      <UndoToast toast={toast} onClose={() => setToast(null)} />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} epub />
      <FinishCelebration title={book.title} open={celebrate} onClose={() => setCelebrate(false)} />
    </div>
  );
}
