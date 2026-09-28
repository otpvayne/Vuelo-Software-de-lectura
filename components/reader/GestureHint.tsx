'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Hand, ZoomIn } from 'lucide-react';
import { gestureHintSeen, markGestureHintSeen } from '@/lib/readerPrefs';

const VISIBLE_MS = 5000;

/** Sugerencia de gestos la primera vez que se abre un libro. Se cierra sola y no vuelve. */
export default function GestureHint() {
  const reduce = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (gestureHintSeen()) return;
    markGestureHintSeen();
    setOpen(true);
  }, []);
  // Temporizador aparte: si el efecto de arriba se ejecuta dos veces (StrictMode), no se pierde.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setOpen(false), VISIBLE_MS);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="pista"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: reduce ? 0 : 0.35 }}
          className="pointer-events-auto fixed inset-x-0 bottom-20 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-tarjeta bg-tinta/90 px-5 py-4 text-sm text-fondo shadow-flotante backdrop-blur sm:flex-row sm:gap-6"
          role="status"
          onClick={() => setOpen(false)}
        >
          <span className="flex items-center gap-2.5">
            <motion.span
              animate={reduce ? undefined : { x: [8, -8, 8] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              className="inline-flex"
            >
              <Hand className="size-5 text-acento" strokeWidth={1.8} />
            </motion.span>
            Desliza o arrastra la esquina para pasar página
          </span>
          <span className="flex items-center gap-2.5">
            <ZoomIn className="size-5 text-acento" strokeWidth={1.8} />
            Doble toque para ampliar
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
