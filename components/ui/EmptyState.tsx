'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { BookOpen, Sparkles } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({
  title = 'Tu primera aventura empieza aquí',
  description = 'Añade un PDF y conviértelo en un libro que se hojea página a página.',
  action,
}: EmptyStateProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center"
    >
      <div className="relative mb-8">
        <motion.div
          animate={{ y: [0, -8, 0], rotate: [-2, 2, -2] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          className="grid size-28 place-items-center rounded-panel bg-papel shadow-libro"
        >
          <BookOpen className="size-12 text-tinta" strokeWidth={1.4} />
        </motion.div>
        <motion.span
          animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -right-3 -top-3 grid size-9 place-items-center rounded-full bg-acento text-tinta shadow-suave dark:text-fondo"
        >
          <Sparkles className="size-4" strokeWidth={2} />
        </motion.span>
      </div>

      <h2 className="text-balance text-3xl font-semibold sm:text-4xl">{title}</h2>
      <p className="mt-3 text-pretty text-base text-tinta-suave/70">{description}</p>
      {action && <div className="mt-8">{action}</div>}
    </motion.section>
  );
}
