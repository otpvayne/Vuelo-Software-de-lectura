'use client';

import { forwardRef, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Highlight } from '@/lib/db';
import type { HighlightBook } from '@/lib/highlightStore';
import { MAX_CANVAS_PX, type PageCache, type ReaderSignal } from '@/lib/pageCache';
import HighlightLayer from './HighlightLayer';
import TextLayer from './TextLayer';

/** Cuántas páginas alrededor de la actual se mantienen pintadas en el flip. */
export const RENDER_WINDOW = 3;

/** Espera antes de pintar a mayor resolución tras un zoom (mientras, se estira el canvas existente). */
const HIRES_DEBOUNCE_MS = 220;

const dpr = () => (typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2));

interface PdfPageProps {
  cache: PageCache;
  /** 1-based */
  pageNumber: number;
  width: number;
  height: number;
  /** En el flip, la página se activa según la señal compartida; en el zoom siempre está activa. */
  signal?: ReaderSignal;
  /** Subrayados del libro (store externo: cambiarlos no re-renderiza el canvas). */
  highlights?: HighlightBook;
  onOpenHighlight?: (h: Highlight, anchor: HTMLElement) => void;
  /** Capa de texto seleccionable (solo en la vista estática del modo Subrayar). */
  selectable?: boolean;
  className?: string;
}

function useActive(signal: ReaderSignal | undefined, page: number) {
  return useSyncExternalStore(
    signal?.subscribe ?? noopSubscribe,
    () => !signal || (signal.flipEnabled && Math.abs(page - signal.current) <= RENDER_WINDOW),
    () => false,
  );
}
const noopSubscribe = () => () => {};

/**
 * Hueco de una página. No pinta por sí misma: pide a la caché un canvas del tamaño justo y lo
 * adjunta. Si no existe aún, muestra el mejor disponible estirado (sin parpadeo) y cambia
 * al nítido cuando está listo. react-pageflip exige forwardRef en cada página.
 */
const PdfPage = forwardRef<HTMLDivElement, PdfPageProps>(function PdfPage(
  { cache, pageNumber, width, height, signal, highlights, onOpenHighlight, selectable = false, className = '' },
  ref,
) {
  const slotRef = useRef<HTMLDivElement>(null);
  const active = useActive(signal, pageNumber);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const detach = () => {
      for (const c of Array.from(slot.querySelectorAll('canvas'))) c.remove();
    };
    if (!active || width <= 0) {
      detach();
      setReady(false);
      return;
    }
    const target = Math.min(MAX_CANVAS_PX, Math.round(width * dpr()));
    const show = (c: HTMLCanvasElement) => {
      if (c.parentElement !== slot) {
        detach();
        slot.prepend(c);
      }
    };

    const exact = cache.get(pageNumber, target);
    if (exact) {
      show(exact);
      setReady(true);
      return;
    }

    let cancelled = false;
    const fallback = cache.best(pageNumber, target);
    if (fallback) show(fallback);
    setReady(false);
    const t = setTimeout(
      () => {
        cache
          .render(pageNumber, target)
          .then((c) => {
            if (cancelled) return;
            show(c);
            setReady(true);
          })
          .catch((err: unknown) => {
            if (!cancelled) console.error(`Página ${pageNumber}:`, err);
          });
      },
      fallback ? HIRES_DEBOUNCE_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [active, cache, pageNumber, width]);

  // Al desmontar, soltar el canvas para que la caché pueda reutilizarlo en otro hueco.
  useEffect(() => {
    const slot = slotRef.current;
    return () => {
      for (const c of Array.from(slot?.querySelectorAll('canvas') ?? [])) c.remove();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`pagina-pdf relative isolate overflow-hidden bg-papel ${className}`}
      style={{ width, height }}
      data-page={pageNumber}
      data-listo={ready ? '1' : undefined}
    >
      <div ref={slotRef} className="absolute inset-0 [&>canvas]:block [&>canvas]:size-full" />
      {/* Subrayados: rects en proporciones 0-1 → porcentajes */}
      {highlights && <HighlightLayer store={highlights} page={pageNumber} onOpen={onOpenHighlight} />}
      {selectable && <TextLayer doc={cache.doc} pageNumber={pageNumber} width={width} />}
      {!ready && !slotRef.current?.firstElementChild && (
        <span className="absolute inset-0 grid place-items-center font-display text-4xl text-tinta-suave/20">
          {pageNumber}
        </span>
      )}
    </div>
  );
});

export default PdfPage;
