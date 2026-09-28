'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Highlight } from '@/lib/db';
import { renderPage } from '@/lib/pdf';

interface PdfPageProps {
  doc: PDFDocumentProxy;
  /** 1-based */
  pageNumber: number;
  width: number;
  height: number;
  /** Solo se rasteriza cuando está cerca de la página visible. */
  active: boolean;
  highlights?: Highlight[];
}

// react-pageflip necesita que cada página sea un componente con forwardRef.
const PdfPage = forwardRef<HTMLDivElement, PdfPageProps>(function PdfPage(
  { doc, pageNumber, width, height, active, highlights = [] },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderedWidth, setRenderedWidth] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!active || !canvas || renderedWidth === width) return;
    let cancelled = false;
    doc
      .getPage(pageNumber)
      .then((page) => (cancelled ? undefined : renderPage(page, canvas, width)))
      .then(() => !cancelled && setRenderedWidth(width))
      .catch((err: unknown) => console.error(`Página ${pageNumber}:`, err));
    return () => {
      cancelled = true;
    };
  }, [active, doc, pageNumber, width, renderedWidth]);

  return (
    <div ref={ref} className="overflow-hidden bg-papel" style={{ width, height }} data-page={pageNumber}>
      <div className="relative size-full">
        <canvas ref={canvasRef} className="block" aria-label={`Página ${pageNumber}`} />
        {/* Subrayados: rects en proporciones 0-1 → porcentajes */}
        {highlights.flatMap((h) =>
          h.rects.map((r, i) => (
            <span
              key={`${h.id}-${i}`}
              className={`pointer-events-none absolute rounded-sm mix-blend-multiply ${
                h.color === 'acento' ? 'bg-acento/40' : 'bg-papel/60'
              }`}
              style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
            />
          )),
        )}
        {renderedWidth === 0 && (
          <span className="absolute inset-0 grid place-items-center font-display text-4xl text-tinta-suave/20">
            {pageNumber}
          </span>
        )}
      </div>
    </div>
  );
});

export default PdfPage;
