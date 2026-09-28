'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { BookOpen } from 'lucide-react';
import type { Book } from '@/lib/db';

export const readerHref = (id: string) => `/lector/?id=${encodeURIComponent(id)}`;

export default function BookCard({ book, index = 0 }: { book: Book; index?: number }) {
  const percent = Math.round(book.progress * 100);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="list-none"
    >
      <Link href={readerHref(book.id)} className="group block rounded-tarjeta" title={book.title}>
        <div className="relative aspect-[3/4] overflow-hidden rounded-tarjeta bg-papel shadow-libro transition-transform duration-500 ease-vuelo group-hover:-translate-y-1.5 group-hover:rotate-[-1deg]">
          {book.cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL local
            <img src={book.cover} alt="" className="size-full object-cover" draggable={false} />
          ) : (
            <div className="grid size-full place-items-center">
              <BookOpen className="size-10 text-tinta-suave/40" strokeWidth={1.2} />
            </div>
          )}
          {/* Lomo */}
          <span className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-tinta/15 to-transparent" />
          {percent > 0 && (
            <span className="absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded-full bg-fondo/60 backdrop-blur">
              <span className="block h-full rounded-full bg-acento" style={{ width: `${percent}%` }} />
            </span>
          )}
        </div>
        <h3 className="mt-3 line-clamp-2 font-display text-base font-medium leading-snug">{book.title}</h3>
        {book.author && <p className="mt-0.5 truncate text-sm text-tinta-suave/60">{book.author}</p>}
      </Link>
    </motion.li>
  );
}
