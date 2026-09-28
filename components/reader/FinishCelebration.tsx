'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Star } from 'lucide-react';

const VISIBLE_MS = 4200;

/** Posiciones deterministas para las estrellas (sin Math.random en render). */
const STARS = Array.from({ length: 14 }, (_, i) => ({
  left: 6 + ((i * 37) % 88),
  size: 14 + ((i * 11) % 18),
  delay: (i % 7) * 0.12,
  drift: ((i % 5) - 2) * 14,
}));

/**
 * Festejo breve al terminar un libro: estrellas que suben y "Terminaste [título]".
 * Con movimiento reducido, solo el mensaje.
 */
export default function FinishCelebration({ title, open, onClose }: { title: string; open: boolean; onClose(): void }) {
  const reduce = useReducedMotion() ?? false;

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onClose, VISIBLE_MS);
    return () => clearTimeout(t);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="festejo"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.3 }}
          className="fixed inset-0 z-[60] grid place-items-center overflow-hidden bg-sombra/25 p-6"
          onClick={onClose}
          role="status"
          aria-live="polite"
        >
          {!reduce &&
            STARS.map((s, i) => (
              <motion.span
                key={i}
                aria-hidden
                className="absolute bottom-0 text-acento"
                style={{ left: `${s.left}%` }}
                initial={{ y: 40, opacity: 0, rotate: 0 }}
                animate={{ y: '-105vh', x: s.drift, opacity: [0, 1, 1, 0], rotate: 160 }}
                transition={{ duration: 2.8, delay: s.delay, ease: 'easeOut' }}
              >
                <Star className="fill-acento drop-shadow-[0_0_10px_rgb(var(--acento)/0.8)]" style={{ width: s.size, height: s.size }} />
              </motion.span>
            ))}
          <motion.div
            initial={reduce ? false : { scale: 0.9, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="relative max-w-md rounded-panel bg-fondo px-8 py-7 text-center shadow-flotante"
          >
            <Star className="mx-auto size-10 fill-acento text-acento" aria-hidden />
            <p className="mt-3 font-display text-2xl font-semibold text-balance">Terminaste {title}</p>
            <p className="mt-1 text-sm text-tinta-suave/70">Cada página, un viaje. Este llegó a destino.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
