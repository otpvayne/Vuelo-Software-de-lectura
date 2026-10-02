'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import WingedBook from './WingedBook';

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
}

/** Repisa vacía con un libro alado flotando sobre ella. */
export default function EmptyState({
  title = 'Tu primera aventura empieza aquí',
  description = 'Añade un PDF o un EPUB —o arrástralo a la ventana— y conviértelo en un libro que se hojea página a página.',
  action,
}: EmptyStateProps) {
  const reduce = useReducedMotion() ?? false;

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto flex max-w-lg flex-col items-center px-4 py-10 text-center sm:py-16"
    >
      <div className="relative mb-12 w-full max-w-sm">
        <div className="relative flex h-44 items-end justify-center">
          {/* Sombra en la repisa, se encoge cuando el libro sube */}
          <motion.span
            aria-hidden
            className="absolute bottom-1 h-3 w-24 rounded-[50%] bg-sombra/35 blur-[6px]"
            animate={reduce ? undefined : { scaleX: [1, 0.72, 1], opacity: [0.9, 0.5, 0.9] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="mb-8"
            animate={reduce ? undefined : { y: [0, -16, 0], rotate: [-2.5, 2.5, -2.5] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <WingedBook
              className="w-44 text-papel drop-shadow-[0_10px_18px_rgb(var(--sombra)/0.25)]"
              accentClassName="text-acento"
              outlineClassName="text-tinta/35"
            />
          </motion.div>
        </div>
        <div aria-hidden className="repisa relative -mx-2 h-5" />
      </div>

      <h2 className="text-balance text-3xl font-semibold sm:text-4xl">{title}</h2>
      <p className="mt-3 text-pretty text-base text-tinta-suave/70">{description}</p>
      {action && <div className="mt-8">{action}</div>}
    </motion.section>
  );
}
