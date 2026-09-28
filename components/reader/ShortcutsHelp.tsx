'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';

const SHORTCUTS: [string[], string][] = [
  [['←', '→'], 'Página anterior / siguiente'],
  [['Espacio'], 'Página siguiente (Mayús + Espacio: anterior)'],
  [['Inicio', 'Fin'], 'Primera / última página'],
  [['G'], 'Ir a página'],
  [['F'], 'Modo enfoque'],
  [['Esc'], 'Salir del enfoque o cerrar paneles'],
  [['+', '−', '0'], 'Ampliar / alejar / 100 %'],
  [['Ctrl', 'rueda'], 'Zoom con el ratón'],
  [['Doble clic'], 'Ampliar o volver a 100 %'],
  [['?'], 'Mostrar esta ayuda'],
];

export default function ShortcutsHelp({ open, onClose }: { open: boolean; onClose(): void }) {
  const reduce = useReducedMotion() ?? false;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="ayuda"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.18 }}
          className="fixed inset-0 z-50 grid place-items-center bg-sombra/40 p-4 backdrop-blur-sm"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ayuda-titulo"
        >
          <motion.div
            initial={reduce ? false : { y: 16, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={reduce ? undefined : { y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-panel bg-fondo p-6 shadow-flotante"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="ayuda-titulo" className="text-2xl font-semibold">
                Atajos de teclado
              </h2>
              <button
                type="button"
                onClick={onClose}
                autoFocus
                className="grid size-9 place-items-center rounded-suave hover:bg-papel/70"
                aria-label="Cerrar ayuda"
              >
                <X className="size-4" />
              </button>
            </div>
            <dl className="divide-y divide-linea/10">
              {SHORTCUTS.map(([keys, what]) => (
                <div key={what} className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="flex shrink-0 gap-1">
                    {keys.map((k) => (
                      <kbd
                        key={k}
                        className="min-w-7 rounded-[8px] border border-linea/15 bg-papel/70 px-2 py-0.5 text-center font-sans text-xs font-semibold shadow-[inset_0_-1px_0_rgb(var(--linea)/0.15)]"
                      >
                        {k}
                      </kbd>
                    ))}
                  </dt>
                  <dd className="text-right text-sm text-tinta-suave/75">{what}</dd>
                </div>
              ))}
            </dl>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
