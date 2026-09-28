'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Trash2, X } from 'lucide-react';
import type { Book } from '@/lib/db';

export const readerHref = (id: string) => `/lector/?id=${encodeURIComponent(id)}`;

interface BookCardProps {
  book: Book;
  index?: number;
  onDelete?: (book: Book) => Promise<void>;
}

export default function BookCard({ book, index = 0, onDelete }: BookCardProps) {
  const percent = Math.round(book.progress * 100);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(book);
    } catch (err) {
      console.error(err);
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: deleting ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="group relative list-none"
    >
      <Link href={readerHref(book.id)} className="block rounded-tarjeta" title={book.title}>
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

      {onDelete && (
        // Fuera del <Link> para no anidar elementos interactivos.
        <div className="acciones-tarjeta absolute right-2 top-2 flex gap-1.5" data-abierto={confirming || undefined}>
          <AnimatePresence mode="popLayout" initial={false}>
            {confirming ? (
              <motion.div
                key="confirmar"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="barra flex items-center gap-1 rounded-suave p-1"
              >
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={deleting}
                  aria-label={`Confirmar eliminar ${book.title}`}
                  className="rounded-[12px] bg-acento px-3 py-1.5 text-xs font-semibold text-tinta disabled:opacity-60 dark:text-fondo"
                >
                  Eliminar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                  aria-label="Cancelar"
                  className="grid size-7 place-items-center rounded-[12px] hover:bg-papel/70"
                >
                  <X className="size-4" />
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="papelera"
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setConfirming(true)}
                aria-label={`Eliminar ${book.title}`}
                title="Eliminar de la biblioteca"
                className="barra grid size-9 place-items-center rounded-suave"
              >
                <Trash2 className="size-4" strokeWidth={1.8} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.li>
  );
}
