'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import type { Book } from '@/lib/db';
import { readerHref } from './BookCard';

export default function ContinueReading({ book }: { book: Book }) {
  const percent = Math.round(book.progress * 100);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      aria-label="Continuar leyendo"
    >
      <Link
        href={readerHref(book.id)}
        className="group flex items-center gap-5 rounded-panel bg-papel/70 p-4 shadow-suave transition-shadow hover:shadow-flotante sm:gap-6 sm:p-5"
      >
        <div className="aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-suave bg-papel shadow-libro sm:w-24">
          {book.cover && (
            // eslint-disable-next-line @next/next/no-img-element -- data URL local
            <img src={book.cover} alt="" className="size-full object-cover" draggable={false} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-tinta-suave/60">
            Continúa tu viaje
          </p>
          <h2 className="mt-1 line-clamp-2 text-xl font-semibold sm:text-2xl">{book.title}</h2>
          <div className="mt-3 flex items-center gap-3">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-linea/10">
              <span className="block h-full rounded-full bg-acento" style={{ width: `${percent}%` }} />
            </span>
            <span className="text-sm tabular-nums text-tinta-suave/70">
              Pág. {book.currentPage} de {book.pageCount}
            </span>
          </div>
        </div>
        <ArrowRight
          className="hidden size-6 shrink-0 text-tinta-suave/60 transition-transform group-hover:translate-x-1 sm:block"
          strokeWidth={1.8}
        />
      </Link>
    </motion.section>
  );
}
