'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

const VISIBLE_MS = 5000;

interface UndoToastProps {
  /** Cambia en cada aviso nuevo (reinicia el temporizador). */
  toast: { id: number; text: string; onUndo?: () => void } | null;
  onClose(): void;
}

/** Aviso breve: "Subrayado quitado · Deshacer". */
export default function UndoToast({ toast, onClose }: UndoToastProps) {
  const reduce = useReducedMotion() ?? false;
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, VISIBLE_MS);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center px-4" aria-live="polite">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            className="pointer-events-auto flex items-center gap-3 rounded-suave bg-tinta px-4 py-2.5 text-sm text-fondo shadow-flotante"
            role="status"
          >
            <span>{toast.text}</span>
            {toast.onUndo && (
              <>
                <span aria-hidden className="text-fondo/40">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => {
                    toast.onUndo?.();
                    onClose();
                  }}
                  className="font-semibold text-acento underline-offset-2 hover:underline"
                >
                  Deshacer
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
