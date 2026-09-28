'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import { HIGHLIGHT_COLORS, HIGHLIGHT_META, type HighlightColor } from '@/lib/constants';

interface HighlighterPaletteProps {
  open: boolean;
  color: HighlightColor;
  onColor(c: HighlightColor): void;
  onDone(): void;
}

/** Paleta flotante de la herramienta Subrayar: 4 colores con sentido sugerido y "Listo". */
export default function HighlighterPalette({ open, color, onColor, onDone }: HighlighterPaletteProps) {
  const reduce = useReducedMotion() ?? false;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="paleta"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
          transition={{ duration: reduce ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
          // Ocupa el sitio de la barra de progreso (oculta en este modo) para no tapar texto.
          className="barra fixed inset-x-0 bottom-2 z-40 mx-auto flex w-fit max-w-[calc(100vw-1rem)] items-center gap-2 rounded-panel px-2.5 py-1.5 sm:bottom-3"
          role="toolbar"
          aria-label="Subrayar: elige color y selecciona texto"
        >
          <span className="hidden pl-1.5 pr-1 text-xs text-tinta-suave/65 sm:block">Selecciona texto</span>
          <div role="radiogroup" aria-label="Color del subrayado" className="flex items-center gap-1.5">
            {HIGHLIGHT_COLORS.map((c) => {
              const meta = HIGHLIGHT_META[c];
              const active = c === color;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={`${meta.label}: ${meta.meaning.toLowerCase()}`}
                  title={`${meta.label} · ${meta.meaning}`}
                  onClick={() => onColor(c)}
                  className={`muestra-${c} grid size-9 place-items-center rounded-full shadow-suave ring-offset-2 ring-offset-fondo transition-transform ${
                    active ? 'scale-110 ring-2 ring-tinta/70' : 'hover:scale-105'
                  }`}
                >
                  {active && <Check className="size-4 text-tinta" strokeWidth={2.6} aria-hidden />}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onDone}
            className="ml-1 rounded-suave bg-acento px-3.5 py-2 text-sm font-semibold text-tinta shadow-suave dark:text-fondo"
          >
            Listo
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
