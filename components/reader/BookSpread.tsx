'use client';

import { forwardRef, memo, useImperativeHandle, useMemo, useRef } from 'react';
import HTMLFlipBook from 'react-pageflip';
import type { Highlight } from '@/lib/db';
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
  highlightsByPage: ReadonlyMap<number, Highlight[]>;
  /** Con movimiento reducido: sin animación de hoja ni sombras. */
  reduceMotion: boolean;
  /** `page`: página izquierda/actual. `readTo`: última página visible (define el progreso). */
  onPageChange(page: number, readTo: number, orientation: Orientation): void;
  /** Empieza a pasar una hoja (animada): para el sonido. */
  onFlipStart?(): void;
}

interface PageFlipApi {
  flipNext(): void;
  flipPrev(): void;
  turnToPage(page: number): void;
  getCurrentPageIndex(): number;
  getOrientation(): Orientation;
}

const FLIP_MS = 650;

const BookSpread = forwardRef<BookSpreadHandle, BookSpreadProps>(function BookSpread(
  { cache, signal, numPages, width, height, startPage, highlightsByPage, reduceMotion, onPageChange, onFlipStart },
  ref,
) {
  const flipRef = useRef<{ pageFlip(): PageFlipApi | undefined } | null>(null);
  const api = () => flipRef.current?.pageFlip();
  // Callbacks en refs: el flip se crea una vez y no debe re-registrarse en cada render.
  const cb = useRef({ onPageChange, onFlipStart });
  cb.current = { onPageChange, onFlipStart };

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
          highlights={highlightsByPage.get(i + 1)}
        />
      )),
    [cache, signal, numPages, width, height, highlightsByPage],
  );

  return (
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
      onInit={(e: { data: { page: number; mode: Orientation } }) => report(e.data.page + 1, e.data.mode)}
      onFlip={(e: { data: number }) => report(e.data + 1, api()?.getOrientation() ?? 'portrait')}
      onChangeState={(e: { data: string }) => {
        if (e.data === 'flipping') cb.current.onFlipStart?.();
      }}
    >
      {pages}
    </HTMLFlipBook>
  );
});

export default memo(BookSpread);
