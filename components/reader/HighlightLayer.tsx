'use client';

import { Fragment, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import { useReducedMotion } from 'motion/react';
import { StickyNote } from 'lucide-react';
import { HIGHLIGHT_META } from '@/lib/constants';
import type { Highlight } from '@/lib/db';
import type { HighlightBook } from '@/lib/highlightStore';

const EMPTY: readonly Highlight[] = [];
/** Movimiento máximo entre pulsar y soltar para contar como toque (no como arrastre del flip). */
const TAP_SLOP_PX = 6;

export const shortText = (text: string | null, max = 60) =>
  !text ? 'sin texto' : text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

interface HighlightLayerProps {
  store: HighlightBook;
  page: number;
  /** Abre el menú del subrayado, anclado al elemento tocado. */
  onOpen?: (h: Highlight, anchor: HTMLElement) => void;
}

/**
 * Pinta los subrayados de UNA página en porcentajes: se ven igual a cualquier tamaño y zoom.
 * No detiene el pointerdown: si el gesto es un arrastre, page-flip lo recibe y pasa la hoja;
 * solo un toque quieto abre el menú. Los más recientes van al final del DOM (ganan al solaparse).
 */
export default function HighlightLayer({ store, page, onOpen }: HighlightLayerProps) {
  const list = useSyncExternalStore(
    store.subscribe,
    () => store.forPage(page),
    () => EMPTY,
  );
  const reduce = useReducedMotion() ?? false;
  const down = useRef<{ x: number; y: number } | null>(null);

  if (!list.length) return null;

  return (
    <div className="capa-subrayados">
      {list.map((h) => {
        const fresh = !reduce && store.freshId === h.id;
        const meta = HIGHLIGHT_META[h.color];
        const label = `Subrayado ${meta.label.toLowerCase()} en la página ${h.page}: «${shortText(h.text)}»${
          h.note ? '. Tiene nota' : ''
        }`;
        const first = h.rects[0];
        return (
          <Fragment key={h.id}>
            {h.rects.map((r, i) => (
              <span
                key={i}
                data-hl={h.id}
                role={i === 0 ? 'button' : undefined}
                tabIndex={i === 0 ? 0 : -1}
                aria-label={i === 0 ? label : undefined}
                aria-hidden={i > 0 || undefined}
                aria-haspopup={i === 0 ? 'dialog' : undefined}
                className={`hl-rect hl-${h.color} ${fresh ? 'pintando' : ''}`}
                style={
                  {
                    left: `${r.x * 100}%`,
                    top: `${r.y * 100}%`,
                    width: `${r.w * 100}%`,
                    height: `${r.h * 100}%`,
                    '--hl-delay': `${i * 90}ms`,
                  } as CSSProperties
                }
                onPointerDown={(e) => {
                  down.current = { x: e.clientX, y: e.clientY };
                }}
                onClick={(e) => {
                  const d = down.current;
                  if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP_PX) return;
                  onOpen?.(h, e.currentTarget);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpen?.(h, e.currentTarget);
                  }
                }}
              />
            ))}
            {h.note && first && (
              <span
                aria-hidden
                title="Tiene nota"
                className="hl-nota"
                style={{
                  left: `${Math.max(0.4, first.x * 100 - 4.2)}%`,
                  top: `${first.y * 100}%`,
                  width: 'clamp(12px, 3.2%, 22px)',
                  aspectRatio: '1',
                }}
                onClick={(e) => {
                  const target = e.currentTarget.previousElementSibling as HTMLElement | null;
                  onOpen?.(h, target ?? e.currentTarget);
                }}
              >
                <StickyNote className="size-[70%]" strokeWidth={2} />
              </span>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
