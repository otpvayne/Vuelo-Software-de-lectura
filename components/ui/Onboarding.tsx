'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookHeart, FilePlus2, Highlighter, type LucideIcon } from 'lucide-react';
import { APP_NAME, STORAGE_KEYS, TAGLINE } from '@/lib/constants';

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: BookHeart, title: `Bienvenido a ${APP_NAME}`, body: TAGLINE },
  {
    icon: FilePlus2,
    title: 'Trae tus PDF y EPUB',
    body: 'Añádelos a tu estantería; se guardan solo en este dispositivo.',
  },
  {
    icon: Highlighter,
    title: 'Lee a tu manera',
    body: 'Hojea, subraya, marca páginas y toma notas sin salir del libro.',
  },
];

export default function Onboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      setOpen(localStorage.getItem(STORAGE_KEYS.onboarded) !== '1');
    } catch {
      setOpen(false);
    }
  }, []);

  const close = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.onboarded, '1');
    } catch {
      // Sin almacenamiento: volverá a mostrarse la próxima vez.
    }
    setOpen(false);
  };

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      {open && current && (
        <motion.div
          key="onboarding"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-sombra/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
        >
          <motion.div
            initial={{ y: 24, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="w-full max-w-sm rounded-panel bg-fondo p-8 text-center shadow-flotante"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25 }}
              >
                <div className="mx-auto mb-6 grid size-16 place-items-center rounded-tarjeta bg-papel">
                  <current.icon className="size-8 text-tinta" strokeWidth={1.5} />
                </div>
                <h2 id="onboarding-title" className="text-2xl font-semibold">
                  {current.title}
                </h2>
                <p className="mt-2 text-tinta-suave/70">{current.body}</p>
              </motion.div>
            </AnimatePresence>

            <div className="mt-6 flex justify-center gap-1.5" aria-hidden>
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step ? 'w-6 bg-acento' : 'w-1.5 bg-linea/20'
                  }`}
                />
              ))}
            </div>

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={close}
                className="flex-1 rounded-suave px-4 py-3 text-sm font-medium text-tinta-suave/70 transition-colors hover:bg-papel/70"
              >
                Saltar
              </button>
              <button
                type="button"
                onClick={() => (isLast ? close() : setStep(step + 1))}
                className="flex-1 rounded-suave bg-acento px-4 py-3 text-sm font-semibold text-tinta shadow-suave transition-transform hover:-translate-y-0.5 active:translate-y-0 dark:text-fondo"
              >
                {isLast ? 'Empezar' : 'Siguiente'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
