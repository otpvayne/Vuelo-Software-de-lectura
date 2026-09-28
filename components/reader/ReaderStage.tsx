'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Highlight } from '@/lib/db';
import { splitSelectionByPage, type PageSelection } from '@/lib/highlightGeometry';
import type { HighlightBook } from '@/lib/highlightStore';
import type { PageCache, ReaderSignal } from '@/lib/pageCache';
import BookSpread, { type BookSpreadHandle, type Orientation } from './BookSpread';
import PdfPage from './PdfPage';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3, 4];
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

/** A partir de este ancho se lee a doble página (igual que decide page-flip). */
const SPREAD_MIN_WIDTH = 900;
const DOUBLE_TAP_MS = 300;
/** Táctil: la selección con manijas no emite "soltar"; se da por terminada tras esta pausa. */
const TOUCH_SELECTION_IDLE_MS = 800;

export interface ReaderStageHandle {
  next(): void;
  prev(): void;
  /** 1-based, sin animación. */
  jump(page: number): void;
  /** Zoom anclado a un punto de pantalla (o al centro). */
  zoomTo(z: number, clientX?: number, clientY?: number): void;
}

interface ReaderStageProps {
  cache: PageCache;
  signal: ReaderSignal;
  numPages: number;
  /** alto / ancho de la primera página */
  aspect: number;
  /** Página actual (izquierda en doble página), 1-based. */
  page: number;
  highlights: HighlightBook;
  onOpenHighlight(h: Highlight, anchor: HTMLElement): void;
  /** Herramienta Subrayar activa: vista estática con texto seleccionable. */
  highlighting: boolean;
  /** Selección terminada, ya dividida por página y en proporciones 0-1. */
  onSelection(parts: PageSelection[]): void;
  reduceMotion: boolean;
  zoom: number;
  onZoomChange(z: number): void;
  onPageChange(page: number, readTo: number, orientation: Orientation): void;
  onFlipStart(): void;
}

interface Anchor {
  /** Fracción del contenido (0-1) bajo el puntero. */
  fx: number;
  fy: number;
  /** Posición del puntero dentro del área visible. */
  px: number;
  py: number;
}

const ReaderStage = forwardRef<ReaderStageHandle, ReaderStageProps>(function ReaderStage(
  {
    cache,
    signal,
    numPages,
    aspect,
    page,
    highlights,
    onOpenHighlight,
    highlighting,
    onSelection,
    reduceMotion,
    zoom,
    onZoomChange,
    onPageChange,
    onFlipStart,
  },
  ref,
) {
  const stageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const spreadRef = useRef<BookSpreadHandle>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const zoomed = zoom > 1.001;
  // La vista estática (sin flip) se usa con zoom y con la herramienta Subrayar:
  // page-flip captura el ratón y no convive con la selección de texto.
  const staticView = zoomed || highlighting;

  // Valores "vivos" para manejadores registrados una sola vez.
  const live = useRef({ zoom, page, zoomed, staticView, highlighting });
  live.current = { zoom, page, zoomed, staticView, highlighting };
  const anchor = useRef<Anchor | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setBox({ w: Math.floor(entry.contentRect.width), h: Math.floor(entry.contentRect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Tamaño de UNA página: doble página en pantallas anchas, una sola en estrechas.
  const layout = useMemo(() => {
    if (!box) return null;
    const landscape = box.w >= SPREAD_MIN_WIDTH;
    const maxW = landscape ? box.w / 2 : box.w;
    const w = Math.floor(Math.min(maxW, box.h / aspect));
    return { w, h: Math.floor(w * aspect), landscape };
  }, [box, aspect]);

  const orientation: Orientation = layout?.landscape ? 'landscape' : 'portrait';
  const step = layout?.landscape ? 2 : 1;
  // En doble página, las hojas van en parejas (1-2, 3-4…): la vista de zoom empieza en impar.
  const spreadStart = layout?.landscape ? page - ((page - 1) % 2) : page;
  const zoomPages = layout?.landscape && spreadStart + 1 <= numPages ? [spreadStart, spreadStart + 1] : [spreadStart];

  // En la vista estática, los canvas los usa ella: el flip suelta los suyos.
  useEffect(() => {
    signal.set({ flipEnabled: !staticView });
    // Al volver al flip (oculto pero montado), salta a la página a la que se navegó.
    if (!staticView) spreadRef.current?.jump(live.current.page);
  }, [staticView, signal]);

  const report = useCallback(
    (p: number) => onPageChange(p, layout?.landscape ? Math.min(p + 1, numPages) : p, orientation),
    [onPageChange, layout?.landscape, numPages, orientation],
  );

  /** Calcula el ancla (qué punto del libro está bajo el puntero) antes de cambiar el zoom. */
  const zoomTo = useCallback(
    (z: number, clientX?: number, clientY?: number) => {
      const next = clampZoom(z);
      const stage = stageRef.current;
      if (!stage) return onZoomChange(next);
      const view = stage.getBoundingClientRect();
      const target = live.current.staticView
        ? contentRef.current?.getBoundingClientRect()
        : stage.querySelector('.stf__parent')?.getBoundingClientRect();
      const cx = clientX ?? view.left + view.width / 2;
      const cy = clientY ?? view.top + view.height / 2;
      anchor.current = target
        ? {
            fx: Math.min(1, Math.max(0, (cx - target.left) / target.width)),
            fy: Math.min(1, Math.max(0, (cy - target.top) / target.height)),
            px: cx - view.left,
            py: cy - view.top,
          }
        : null;
      onZoomChange(next);
    },
    [onZoomChange],
  );

  // Tras cambiar el zoom, desplazar para que el punto anclado siga bajo el puntero.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!staticView || !scroller || !content) return;
    const a = anchor.current ?? {
      fx: 0.5,
      fy: 0.5,
      px: scroller.clientWidth / 2,
      py: scroller.clientHeight / 2,
    };
    scroller.scrollLeft = content.offsetLeft + a.fx * content.offsetWidth - a.px;
    scroller.scrollTop = content.offsetTop + a.fy * content.offsetHeight - a.py;
    anchor.current = null;
  }, [zoom, staticView]);

  useImperativeHandle(
    ref,
    () => ({
      next: () => {
        if (!live.current.staticView) return spreadRef.current?.next();
        const p = Math.min(numPages, spreadStart + step);
        if (p !== spreadStart && p <= numPages) {
          onFlipStart();
          report(p);
        }
      },
      prev: () => {
        if (!live.current.staticView) return spreadRef.current?.prev();
        const p = Math.max(1, spreadStart - step);
        if (p !== spreadStart) {
          onFlipStart();
          report(p);
        }
      },
      jump: (p) => {
        const target = Math.min(numPages, Math.max(1, p));
        if (live.current.staticView) report(layout?.landscape ? target - ((target - 1) % 2) : target);
        else spreadRef.current?.jump(target);
      },
      zoomTo,
    }),
    [numPages, spreadStart, step, report, onFlipStart, zoomTo, layout?.landscape],
  );

  // Ctrl + rueda (y el pellizco del trackpad, que llega igual): zoom anclado al puntero.
  // En la ventana y no pasivo, para que WebView2 no amplíe toda la interfaz.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomTo(live.current.zoom * Math.exp(-e.deltaY * 0.0012), e.clientX, e.clientY);
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [zoomTo]);

  // ── Gestos de puntero: pellizco, desplazamiento con zoom y doble toque ──
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const downAt = useRef<{ t: number; x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const midpoint = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
  };

  const toggleZoomAt = (x: number, y: number) => {
    if (live.current.zoomed) onZoomChange(1);
    else zoomTo(2, x, y);
  };

  // ── Subrayar: al terminar la selección se crea el subrayado, sin pasos extra ──
  const commitSelection = useCallback(() => {
    if (!live.current.highlighting) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !contentRef.current) return;
    const range = sel.getRangeAt(0);
    if (!contentRef.current.contains(range.commonAncestorContainer)) return;
    const pages = Array.from(contentRef.current.querySelectorAll<HTMLElement>('.pagina-pdf'));
    const parts = splitSelectionByPage(range, pages);
    sel.removeAllRanges();
    if (parts.length) onSelection(parts);
  }, [onSelection]);

  useEffect(() => {
    if (!highlighting) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let touching = false;
    const onUp = (e: PointerEvent) => {
      touching = false;
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') commitSelection();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') touching = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') commitSelection();
    };
    // Táctil: manijas nativas; se crea al quedar la selección quieta un momento.
    const onSelectionChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!touching) commitSelection();
      }, TOUCH_SELECTION_IDLE_MS);
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('selectionchange', onSelectionChange);
      window.getSelection()?.removeAllRanges();
    };
  }, [highlighting, commitSelection]);

  const onPointerDownCapture = (e: ReactPointerEvent) => {
    // Con Subrayar, el arrastre selecciona texto: sin pan, pellizco ni doble toque propios.
    if (live.current.highlighting) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downAt.current = { t: performance.now(), x: e.clientX, y: e.clientY };
    if (pointers.current.size === 2) {
      pinch.current = { dist: distance(), zoom: live.current.zoom };
      pan.current = null;
      setPanning(false);
      return;
    }
    if (live.current.staticView && scrollRef.current && (e.pointerType !== 'mouse' || e.button === 0)) {
      pan.current = { x: e.clientX, y: e.clientY, left: scrollRef.current.scrollLeft, top: scrollRef.current.scrollTop };
      scrollRef.current.setPointerCapture(e.pointerId);
      setPanning(true);
    }
  };

  const onPointerMoveCapture = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      e.stopPropagation(); // que page-flip no lo tome como arrastre de hoja
      const m = midpoint();
      const d = distance();
      if (m && d > 0) zoomTo((pinch.current.zoom * d) / pinch.current.dist, m.x, m.y);
      return;
    }
    if (pan.current && scrollRef.current) {
      scrollRef.current.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
      scrollRef.current.scrollTop = pan.current.top - (e.clientY - pan.current.y);
    }
  };

  const onPointerUpCapture = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (!pointers.current.size) {
      pan.current = null;
      setPanning(false);
    }
    // Doble clic / doble toque: detector propio para ratón y táctil. No se usa `dblclick`:
    // page-flip lo impide en el flip y, en táctil, Chromium lo sintetiza además del gesto
    // (se aplicaría dos veces).
    if (downAt.current && (e.pointerType !== 'mouse' || e.button === 0)) {
      const quick = performance.now() - downAt.current.t < 250;
      const still = Math.hypot(e.clientX - downAt.current.x, e.clientY - downAt.current.y) < 12;
      if (quick && still) {
        const prev = lastTap.current;
        const now = performance.now();
        if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 40) {
          lastTap.current = null;
          toggleZoomAt(e.clientX, e.clientY);
          return;
        }
        lastTap.current = { t: now, x: e.clientX, y: e.clientY };
      }
    }
  };

  return (
    <div
      ref={stageRef}
      className={`relative size-full ${
        highlighting ? 'subrayando touch-pan-x touch-pan-y select-text' : 'touch-none select-none'
      }`}
      onPointerDownCapture={onPointerDownCapture}
      onPointerMoveCapture={onPointerMoveCapture}
      onPointerUpCapture={onPointerUpCapture}
      onPointerCancelCapture={onPointerUpCapture}
    >
      {/* Flip: siempre montado; oculto (sin perder su estado) mientras hay zoom. */}
      <div
        className={`absolute inset-0 grid place-items-center ${staticView ? 'pointer-events-none invisible' : ''}`}
        aria-hidden={staticView || undefined}
      >
        {layout && layout.w > 0 && (
          <BookSpread
            ref={spreadRef}
            cache={cache}
            signal={signal}
            numPages={numPages}
            width={layout.w}
            height={layout.h}
            startPage={page}
            highlights={highlights}
            onOpenHighlight={onOpenHighlight}
            reduceMotion={reduceMotion}
            interactive={!staticView}
            onPageChange={onPageChange}
            onFlipStart={onFlipStart}
          />
        )}
      </div>

      {/* Zoom: página(s) estáticas, más grandes, con desplazamiento por arrastre. */}
      {staticView && layout && (
        <div
          ref={scrollRef}
          className={`absolute inset-0 overflow-auto overscroll-contain [scrollbar-width:thin] ${
            highlighting ? 'cursor-text' : panning ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          {/* Sin relleno a 100 % (Subrayar): la página queda donde estaba en el flip, sin saltos ni barras. */}
          <div className={`flex min-h-full min-w-full ${zoomed ? 'p-6' : ''}`}>
            <div
              ref={contentRef}
              className="relative m-auto flex shrink-0 shadow-libro"
              style={{ width: layout.w * zoom * zoomPages.length, height: layout.h * zoom }}
            >
              {zoomPages.map((p) => (
                <PdfPage
                  key={p}
                  cache={cache}
                  pageNumber={p}
                  width={Math.round(layout.w * zoom)}
                  height={Math.round(layout.h * zoom)}
                  highlights={highlights}
                  onOpenHighlight={onOpenHighlight}
                  selectable={highlighting}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default ReaderStage;
