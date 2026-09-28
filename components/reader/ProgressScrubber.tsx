'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Star } from 'lucide-react';
import type { HighlightColor } from '@/lib/constants';
import type { HighlightBook } from '@/lib/highlightStore';
import type { Chapter } from '@/lib/outline';

interface ProgressScrubberProps {
  page: number;
  lastVisible: number;
  pageCount: number;
  hidden: boolean;
  onGoTo(page: number): void;
  /** Marcas del camino. */
  bookmarks: number[];
  notes: number[];
  highlights: HighlightBook;
  /** Capítulos del índice del PDF ([] si no trae índice: no se inventan). */
  chapters: Chapter[];
}

/** Ancho (px) dentro del que se agrupan los puntitos de subrayados. */
const CLUSTER_PX = 8;
/** Distancia (px) para "enganchar" una parada de capítulo al pasar el cursor. */
const CHAPTER_HOVER_PX = 8;

const chapterAt = (chapters: Chapter[], page: number) => [...chapters].reverse().find((c) => c.page <= page) ?? null;

/**
 * El Viaje de lectura: la barra inferior como un camino. La estrellita avanza, lo recorrido
 * brilla y lo que falta queda tenue. Marcas: cinta (marcador), nota (apunte), puntitos de
 * color (subrayados, agrupados) y paradas de capítulo con nombre al pasar el cursor.
 * Sigue siendo un slider: clic o arrastre para saltar; el salto se hace al soltar.
 */
export default function ProgressScrubber({
  page,
  lastVisible,
  pageCount,
  hidden,
  onGoTo,
  bookmarks,
  notes,
  highlights,
  chapters,
}: ProgressScrubberProps) {
  const reduce = useReducedMotion() ?? false;
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<{ page: number; chapter: Chapter | null } | null>(null);
  const [width, setWidth] = useState(0);
  const allHighlights = useSyncExternalStore(highlights.subscribe, highlights.all, highlights.all);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frac = (p: number) => (pageCount > 1 ? (p - 1) / (pageCount - 1) : 1);

  const pageAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return page;
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.max(1, Math.min(pageCount, Math.round(f * (pageCount - 1)) + 1));
  };

  // Subrayados agrupados por cercanía en pantalla: un puntito por color dentro de cada grupo.
  const clusters = useMemo(() => {
    if (!width) return [];
    const bins = new Map<number, { x: number; colors: Set<HighlightColor>; count: number; from: number; to: number }>();
    for (const h of allHighlights) {
      const x = frac(h.page) * width;
      const key = Math.round(x / CLUSTER_PX);
      const bin = bins.get(key) ?? { x: key * CLUSTER_PX, colors: new Set(), count: 0, from: h.page, to: h.page };
      bin.colors.add(h.color);
      bin.count += 1;
      bin.from = Math.min(bin.from, h.page);
      bin.to = Math.max(bin.to, h.page);
      bins.set(key, bin);
    }
    return [...bins.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allHighlights, width, pageCount]);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(pageAt(e.clientX));
    setHover(null);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag !== null) return setDrag(pageAt(e.clientX));
    if (e.pointerType !== 'mouse') return;
    const rect = trackRef.current?.getBoundingClientRect();
    const p = pageAt(e.clientX);
    const chapter =
      rect && chapters.find((c) => Math.abs(frac(c.page) * rect.width - (e.clientX - rect.left)) <= CHAPTER_HOVER_PX);
    setHover({ page: chapter ? chapter.page : p, chapter: chapter || null });
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const target = hover?.chapter ? hover.chapter.page : pageAt(e.clientX);
    setDrag(null);
    if (target !== page) onGoTo(target);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const jumps: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
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
  const fraction = frac(shown);
  const read = pageCount > 0 ? Math.round((lastVisible / pageCount) * 100) : 0;
  const currentChapter = chapterAt(chapters, shown);
  const bubble = drag !== null ? { page: drag, chapter: chapterAt(chapters, drag) } : hover;

  return (
    <motion.div
      initial={false}
      animate={hidden ? (reduce ? { opacity: 0 } : { opacity: 0, y: 24 }) : { opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={`barra fixed inset-x-2 bottom-2 z-30 flex items-center gap-3 rounded-panel px-4 py-1.5 sm:inset-x-0 sm:bottom-3 sm:mx-auto sm:w-[min(760px,calc(100vw-3rem))] ${
        hidden ? 'pointer-events-none' : ''
      }`}
      aria-hidden={hidden || undefined}
    >
      <span className="w-9 text-right text-xs tabular-nums text-tinta-suave/60">{read}%</span>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={hidden ? -1 : 0}
        aria-label="Viaje de lectura"
        aria-valuemin={1}
        aria-valuemax={pageCount}
        aria-valuenow={shown}
        aria-valuetext={`Página ${shown} de ${pageCount}${currentChapter ? `, ${currentChapter.title}` : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setHover(null)}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={onKey}
        className="viaje group relative h-11 flex-1 cursor-pointer touch-none"
      >
        {/* Camino: tramo pendiente tenue */}
        <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-linea/15" />
        {/* Tramo recorrido: iluminado */}
        <span
          className={`viaje-recorrido absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full ${reduce ? '' : 'viaje-brilla'}`}
          style={{ width: `${fraction * 100}%` }}
        />

        {/* Paradas de capítulo */}
        {chapters.map((c) => (
          <span
            key={`${c.page}-${c.title}`}
            aria-hidden
            className={`absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full ${
              c.page <= shown ? 'bg-acento' : 'bg-tinta-suave/35'
            }`}
            style={{ left: `${frac(c.page) * 100}%` }}
          />
        ))}

        {/* Marcadores (cinta) y apuntes (nota) por encima del camino */}
        {bookmarks.map((p) => (
          <span
            key={`b${p}`}
            aria-hidden
            className="cinta absolute top-[5px] h-2.5 w-[7px] -translate-x-1/2 bg-acento"
            style={{ left: `${frac(p) * 100}%` }}
          />
        ))}
        {notes.map((p, i) => (
          <span
            key={`n${p}-${i}`}
            aria-hidden
            className="absolute top-[6px] size-[7px] -translate-x-1/2 rotate-6 rounded-[2px] bg-tinta-suave/55"
            style={{ left: `${frac(p) * 100}%` }}
          />
        ))}
        {/* Subrayados: puntitos de color, agrupados si están cerca */}
        {clusters.map((c) => (
          <span
            key={c.x}
            aria-hidden
            title={`${c.count} subrayado${c.count > 1 ? 's' : ''} · pág. ${c.from}${c.to > c.from ? `–${c.to}` : ''}`}
            className="absolute bottom-[4px] flex -translate-x-1/2 flex-col items-center gap-[2px]"
            style={{ left: c.x }}
          >
            {[...c.colors].slice(0, 3).map((color) => (
              <span key={color} className={`muestra-${color} size-[5px] rounded-full`} />
            ))}
          </span>
        ))}

        {/* La estrellita que avanza */}
        <span
          aria-hidden
          className={`absolute top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center transition-transform ${
            drag !== null ? 'scale-125' : 'group-hover:scale-110'
          }`}
          style={{ left: `${fraction * 100}%` }}
        >
          <Star className="viaje-estrella size-5 fill-acento text-acento" strokeWidth={1.4} />
        </span>

        <AnimatePresence>
          {bubble && (
            // Posición en un span fijo; la animación en otro (motion reescribe transform).
            <span
              key="burbuja"
              className="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2"
              style={{ left: `${frac(bubble.page) * 100}%` }}
            >
              <motion.span
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.15 }}
                className="block max-w-[16rem] truncate whitespace-nowrap rounded-suave bg-tinta px-2.5 py-1 text-xs font-semibold tabular-nums text-fondo shadow-flotante"
              >
                Pág. {bubble.page}
                {bubble.chapter && <span className="font-normal opacity-80"> · {bubble.chapter.title}</span>}
              </motion.span>
            </span>
          )}
        </AnimatePresence>
      </div>
      <span className="w-9 text-xs tabular-nums text-tinta-suave/60">{pageCount}</span>
    </motion.div>
  );
}
