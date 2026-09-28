'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

interface ProgressScrubberProps {
  page: number;
  lastVisible: number;
  pageCount: number;
  hidden: boolean;
  onGoTo(page: number): void;
}

/**
 * Barra de progreso inferior: clic o arrastre para saltar a cualquier punto del libro.
 * Al arrastrar solo se mueve la burbuja; el salto se hace al soltar (sin renderizar
 * decenas de páginas por el camino).
 */
export default function ProgressScrubber({ page, lastVisible, pageCount, hidden, onGoTo }: ProgressScrubberProps) {
  const reduce = useReducedMotion() ?? false;
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);

  const pageAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return page;
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.max(1, Math.min(pageCount, Math.round(f * (pageCount - 1)) + 1));
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(pageAt(e.clientX));
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag !== null) setDrag(pageAt(e.clientX));
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const target = pageAt(e.clientX);
    setDrag(null);
    if (target !== page) onGoTo(target);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const jumps: Record<string, number> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
      PageUp: 10,
      PageDown: -10,
    };
    let target: number | null = null;
    if (e.key in jumps) target = page + (jumps[e.key] ?? 0);
    if (e.key === 'Home') target = 1;
    if (e.key === 'End') target = pageCount;
    if (target === null) return;
    e.preventDefault();
    e.stopPropagation(); // que el atajo global no pase página además
    onGoTo(Math.max(1, Math.min(pageCount, target)));
  };

  const shown = drag ?? page;
  const fraction = pageCount > 1 ? (shown - 1) / (pageCount - 1) : 1;
  const read = pageCount > 0 ? Math.round((lastVisible / pageCount) * 100) : 0;

  return (
    <motion.div
      initial={false}
      animate={hidden ? (reduce ? { opacity: 0 } : { opacity: 0, y: 24 }) : { opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={`barra fixed inset-x-2 bottom-2 z-30 flex items-center gap-3 rounded-panel px-4 py-2 sm:inset-x-0 sm:bottom-3 sm:mx-auto sm:w-[min(720px,calc(100vw-3rem))] ${
        hidden ? 'pointer-events-none' : ''
      }`}
      aria-hidden={hidden || undefined}
    >
      <span className="w-9 text-right text-xs tabular-nums text-tinta-suave/60">{read}%</span>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={hidden ? -1 : 0}
        aria-label="Progreso del libro"
        aria-valuemin={1}
        aria-valuemax={pageCount}
        aria-valuenow={shown}
        aria-valuetext={`Página ${shown} de ${pageCount}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={onKey}
        className="group relative flex h-8 flex-1 cursor-pointer touch-none items-center rounded-full"
      >
        <span className="absolute inset-x-0 h-1.5 rounded-full bg-linea/15" />
        <span className="absolute left-0 h-1.5 rounded-full bg-acento" style={{ width: `${fraction * 100}%` }} />
        <span
          className={`absolute size-4 -translate-x-1/2 rounded-full border-2 border-fondo bg-acento shadow-suave transition-transform ${
            drag !== null ? 'scale-125' : 'group-hover:scale-110'
          }`}
          style={{ left: `${fraction * 100}%` }}
        />
        <AnimatePresence>
          {drag !== null && (
            <motion.span
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.15 }}
              className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 whitespace-nowrap rounded-suave bg-tinta px-2.5 py-1 text-xs font-semibold tabular-nums text-fondo shadow-flotante"
              style={{ left: `${fraction * 100}%` }}
            >
              Pág. {drag}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <span className="w-9 text-xs tabular-nums text-tinta-suave/60">{pageCount}</span>
    </motion.div>
  );
}
