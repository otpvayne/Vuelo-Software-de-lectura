'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import HTMLFlipBook from 'react-pageflip';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Highlight } from '@/lib/db';
import PdfPage from './PdfPage';

export interface BookSpreadHandle {
  next(): void;
  prev(): void;
  /** 1-based */
  goTo(page: number): void;
}

interface BookSpreadProps {
  doc: PDFDocumentProxy;
  /** alto / ancho de la primera página */
  aspect: number;
  /** 1-based */
  startPage: number;
  highlights: Highlight[];
  /** `page`: página izquierda/actual. `readTo`: última página visible (define el progreso). */
  onPageChange(page: number, readTo: number): void;
}

/** Cuántas páginas alrededor de la actual se rasterizan. */
const RENDER_WINDOW = 3;

interface PageFlipApi {
  flipNext(): void;
  flipPrev(): void;
  flip(page: number): void;
  getOrientation(): 'portrait' | 'landscape';
}

const BookSpread = forwardRef<BookSpreadHandle, BookSpreadProps>(function BookSpread(
  { doc, aspect, startPage, highlights, onPageChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<{ pageFlip(): PageFlipApi | undefined } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [current, setCurrent] = useState(startPage);

  useImperativeHandle(ref, () => ({
    next: () => flipRef.current?.pageFlip()?.flipNext(),
    prev: () => flipRef.current?.pageFlip()?.flipPrev(),
    goTo: (page) => flipRef.current?.pageFlip()?.flip(page - 1),
  }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setBox({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Tamaño de UNA página: doble página en pantallas anchas, una sola en estrechas.
  const size = useMemo(() => {
    if (!box) return null;
    const spread = box.w >= 900;
    const maxW = spread ? box.w / 2 : box.w;
    const w = Math.floor(Math.min(maxW, box.h / aspect));
    return { w, h: Math.floor(w * aspect) };
  }, [box, aspect]);

  // En doble página también se ve la página derecha: cuenta como leída.
  const report = (page: number, mode: 'portrait' | 'landscape') =>
    onPageChange(page, mode === 'landscape' ? Math.min(page + 1, doc.numPages) : page);

  const pages = useMemo(() => Array.from({ length: doc.numPages }, (_, i) => i + 1), [doc]);
  const byPage = useMemo(() => {
    const map = new Map<number, Highlight[]>();
    for (const h of highlights) map.set(h.page, [...(map.get(h.page) ?? []), h]);
    return map;
  }, [highlights]);

  return (
    <div ref={containerRef} className="grid size-full place-items-center">
      {size && size.w > 0 && (
        <HTMLFlipBook
          // Remontar al cambiar de tamaño: page-flip no recalcula dimensiones en caliente.
          key={`${size.w}x${size.h}`}
          ref={flipRef}
          className="shadow-libro"
          style={{}}
          width={size.w}
          height={size.h}
          size="fixed"
          minWidth={size.w}
          maxWidth={size.w}
          minHeight={size.h}
          maxHeight={size.h}
          startPage={current - 1}
          drawShadow
          maxShadowOpacity={0.35}
          flippingTime={700}
          usePortrait
          startZIndex={0}
          autoSize
          showCover={false}
          mobileScrollSupport
          clickEventForward
          useMouseEvents
          swipeDistance={30}
          showPageCorners
          disableFlipByClick={false}
          onInit={(e: { data: { page: number; mode: 'portrait' | 'landscape' } }) => {
            report(e.data.page + 1, e.data.mode);
          }}
          onFlip={(e: { data: number }) => {
            const page = e.data + 1;
            setCurrent(page);
            report(page, flipRef.current?.pageFlip()?.getOrientation() ?? 'portrait');
          }}
        >
          {pages.map((n) => (
            <PdfPage
              key={n}
              doc={doc}
              pageNumber={n}
              width={size.w}
              height={size.h}
              active={Math.abs(n - current) <= RENDER_WINDOW}
              highlights={byPage.get(n)}
            />
          ))}
        </HTMLFlipBook>
      )}
    </div>
  );
});

export default BookSpread;
