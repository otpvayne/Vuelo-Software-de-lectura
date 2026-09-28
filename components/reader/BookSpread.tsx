'use client';

import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import HTMLFlipBook from 'react-pageflip';
import type { Highlight } from '@/lib/db';
import type { HighlightBook } from '@/lib/highlightStore';
import type { PageCache, ReaderSignal } from '@/lib/pageCache';
import PdfPage from './PdfPage';

export type Orientation = 'portrait' | 'landscape';

export interface BookSpreadHandle {
  next(): void;
  prev(): void;
  /** 1-based. Sin animación: para saltos (ir a página, barra de progreso, salir del zoom). */
  jump(page: number): void;
}

interface BookSpreadProps {
  cache: PageCache;
  signal: ReaderSignal;
  numPages: number;
  /** Tamaño de UNA página en px CSS. */
  width: number;
  height: number;
  /** 1-based */
  startPage: number;
  highlights: HighlightBook;
  onOpenHighlight(h: Highlight, anchor: HTMLElement): void;
  /** Con movimiento reducido: sin animación de hoja ni sombras. */
  reduceMotion: boolean;
  /**
   * false mientras se muestra la vista estática (zoom o Subrayar). page-flip escucha
   * mousemove/mouseup en window: aunque el libro esté oculto, soltar cerca de una esquina
   * pasaría la hoja. Se desconectan sus manejadores y se reconectan al volver.
   */
  interactive: boolean;
  /** `page`: página izquierda/actual. `readTo`: última página visible (define el progreso). */
  onPageChange(page: number, readTo: number, orientation: Orientation): void;
  /** Empieza a pasar una hoja (animada): para el sonido. */
  onFlipStart?(): void;
}

interface PageFlipUI {
  setHandlers(): void;
  removeHandlers(): void;
}

interface PageFlipApi {
  getUI(): PageFlipUI;
  /** isSwipe=true: termina el gesto sin pasar página. */
  userStop(pos: { x: number; y: number }, isSwipe?: boolean): void;
  flipNext(): void;
  flipPrev(): void;
  turnToPage(page: number): void;
  getCurrentPageIndex(): number;
  getOrientation(): Orientation;
}

const FLIP_MS = 650;

const BookSpread = forwardRef<BookSpreadHandle, BookSpreadProps>(function BookSpread(
  {
    cache,
    signal,
    numPages,
    width,
    height,
    startPage,
    highlights,
    onOpenHighlight,
    reduceMotion,
    interactive,
    onPageChange,
    onFlipStart,
  },
  ref,
) {
  const flipRef = useRef<{ pageFlip(): PageFlipApi | undefined } | null>(null);
  const api = () => flipRef.current?.pageFlip();
  // Callbacks en refs: el flip se crea una vez y no debe re-registrarse en cada render.
  const cb = useRef({ onPageChange, onFlipStart, onOpenHighlight });
  cb.current = { onPageChange, onFlipStart, onOpenHighlight };

  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  // Métodos protegidos de page-flip (existen en runtime): no hay otra forma de pausar su ratón.
  const applyInteractive = () => {
    const ui = api()?.getUI();
    if (!ui) return;
    if (interactiveRef.current) ui.setHandlers();
    else ui.removeHandlers();
  };
  useEffect(applyInteractive, [interactive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tocar un subrayado abre su menú, pero page-flip trata cualquier "soltar sin arrastrar"
  // dentro de la zona de esquina (radio = diagonal/5, ~170 px) como clic para pasar hoja.
  // Si es un toque quieto sobre un subrayado, el mouseup/touchend no llega a page-flip y se
  // cierra su gesto como un deslizamiento (userStop con isSwipe), que no pasa página.
  // Los arrastres que empiezan sobre un subrayado siguen pasando la hoja con normalidad.
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let start: { x: number; y: number; onHl: boolean } | null = null;
    const isHl = (t: EventTarget | null) => t instanceof Element && !!t.closest('.hl-rect, .hl-nota');
    const point = (e: MouseEvent | TouchEvent) =>
      'changedTouches' in e ? e.changedTouches[0] : (e as MouseEvent);
    const down = (e: MouseEvent | TouchEvent) => {
      const p = point(e);
      start = p ? { x: p.clientX, y: p.clientY, onHl: isHl(e.target) } : null;
    };
    const up = (e: MouseEvent | TouchEvent) => {
      const p = point(e);
      if (!start?.onHl || !p) return;
      if (Math.hypot(p.clientX - start.x, p.clientY - start.y) > 6) return;
      e.stopPropagation();
      api()?.userStop({ x: 0, y: 0 }, true);
      start = null;
    };
    el.addEventListener('mousedown', down, true);
    el.addEventListener('touchstart', down, { capture: true, passive: true });
    el.addEventListener('mouseup', up, true);
    el.addEventListener('touchend', up, true);
    return () => {
      el.removeEventListener('mousedown', down, true);
      el.removeEventListener('touchstart', down, true);
      el.removeEventListener('mouseup', up, true);
      el.removeEventListener('touchend', up, true);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const report = (page: number, orientation: Orientation) => {
    signal.set({ current: page });
    cb.current.onPageChange(page, orientation === 'landscape' ? Math.min(page + 1, numPages) : page, orientation);
  };

  useImperativeHandle(ref, () => ({
    next: () => {
      const f = api();
      if (!f) return;
      if (reduceMotion) {
        const step = f.getOrientation() === 'landscape' ? 2 : 1;
        f.turnToPage(Math.min(numPages - 1, f.getCurrentPageIndex() + step));
      } else f.flipNext();
    },
    prev: () => {
      const f = api();
      if (!f) return;
      if (reduceMotion) {
        const step = f.getOrientation() === 'landscape' ? 2 : 1;
        f.turnToPage(Math.max(0, f.getCurrentPageIndex() - step));
      } else f.flipPrev();
    },
    jump: (page) => api()?.turnToPage(Math.min(numPages, Math.max(1, page)) - 1),
  }));

  // Hijos estables: react-pageflip solo los reprocesa si cambia su número
  // (renderOnlyPageLengthChange). Qué páginas se pintan lo decide la señal compartida.
  const pages = useMemo(
    () =>
      Array.from({ length: numPages }, (_, i) => (
        <PdfPage
          key={i + 1}
          cache={cache}
          signal={signal}
          pageNumber={i + 1}
          width={width}
          height={height}
          highlights={highlights}
          onOpenHighlight={(h, el) => cb.current.onOpenHighlight(h, el)}
        />
      )),
    [cache, signal, numPages, width, height, highlights],
  );

  return (
    <div ref={wrapRef} className="contents">
      <HTMLFlipBook
        // Remontar al cambiar de tamaño: page-flip no recalcula dimensiones en caliente.
        // Los canvas ya pintados sobreviven en la caché.
        key={`${width}x${height}-${reduceMotion ? 'r' : 'a'}`}
        ref={flipRef}
        className="shadow-libro"
        style={{}}
        width={width}
        height={height}
        size="fixed"
        minWidth={width}
        maxWidth={width}
        minHeight={height}
        maxHeight={height}
        startPage={Math.max(0, startPage - 1)}
        drawShadow={!reduceMotion}
        maxShadowOpacity={0.35}
        flippingTime={reduceMotion ? 1 : FLIP_MS}
        usePortrait
        startZIndex={0}
        autoSize
        showCover={false}
        mobileScrollSupport={false}
        clickEventForward
        useMouseEvents
        swipeDistance={30}
        showPageCorners={!reduceMotion}
        // El clic simple no pasa página (solo esquinas y arrastre): así el doble clic es zoom.
        disableFlipByClick
        renderOnlyPageLengthChange
        onInit={(e: { data: { page: number; mode: Orientation } }) => {
          applyInteractive();
          // e.data.page es la página pedida; en doble página el flip muestra la pareja que la
          // contiene (13-14 para 14): se informa la izquierda real.
          report((api()?.getCurrentPageIndex() ?? e.data.page) + 1, e.data.mode);
        }}
        onFlip={(e: { data: number }) => report(e.data + 1, api()?.getOrientation() ?? 'portrait')}
        onChangeState={(e: { data: string }) => {
          if (e.data === 'flipping') cb.current.onFlipStart?.();
        }}
      >
        {pages}
      </HTMLFlipBook>
    </div>
  );
});

export default memo(BookSpread);
