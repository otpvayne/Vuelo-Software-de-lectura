'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Clock, Star } from 'lucide-react';
import type { Book } from '@/lib/db';
import { readerHref } from './BookCard';
import GeneratedCover from './GeneratedCover';
import { useLightCover } from './useCoverTone';

const MIN_PER_PAGE = 2;

export function remainingLabel(book: Book) {
  const minutes = Math.max(0, book.pageCount - book.currentPage) * MIN_PER_PAGE;
  if (minutes === 0) return 'Casi terminado';
  if (minutes < 60) return `≈ ${minutes} min restantes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `≈ ${h} h${m ? ` ${m} min` : ''} restantes`;
}

/** El libro empezado y sin terminar abierto más recientemente, si lo hay. */
export function pickContinue(books: Book[]): Book | null {
  const started = books.filter((b) => b.lastOpenedAt !== null && b.progress > 0 && b.progress < 1);
  return started.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))[0] ?? null;
}

/** Ancho de referencia para escalar la tipografía de la portada generada. */
const COVER_W = 100;

export default function ContinueReading({ book }: { book: Book }) {
  const reduce = useReducedMotion() ?? false;
  const percent = Math.round(book.progress * 100);
  const lightCover = useLightCover(book.id, book.cover);

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      aria-labelledby="sigue-leyendo"
      className="relative overflow-hidden rounded-panel border border-linea/10 bg-gradient-to-br from-papel via-papel/70 to-acento/15 p-5 shadow-flotante sm:p-7"
    >
      {/* Estrella que respira */}
      <motion.span
        aria-hidden
        className="absolute right-5 top-5 text-acento sm:right-8 sm:top-7"
        animate={reduce ? undefined : { scale: [1, 1.18, 1], opacity: [0.55, 1, 0.55] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Star className="size-6 fill-acento drop-shadow-[0_0_12px_rgb(var(--acento)/0.6)]" strokeWidth={1.4} />
      </motion.span>
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-acento/15 blur-3xl"
      />

      <div className="relative flex items-center gap-5 sm:gap-7">
        <div
          className={`relative aspect-[3/4] w-[84px] shrink-0 overflow-hidden rounded-l-[3px] rounded-r-[6px] bg-papel shadow-libro sm:w-[112px] ${
            lightCover ? 'portada-clara' : ''
          }`}
        >
          {book.cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL local
            <img src={book.cover} alt="" className="size-full object-cover" draggable={false} />
          ) : (
            <GeneratedCover title={book.title} author={book.author} width={COVER_W} />
          )}
        </div>

        <div className="min-w-0 flex-1 pr-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tinta-suave/60 sm:text-xs sm:tracking-[0.18em]">
            Sigue donde lo dejaste
          </p>
          <h2 id="sigue-leyendo" className="mt-1.5 line-clamp-2 text-2xl font-semibold leading-tight sm:text-3xl">
            {book.title}
          </h2>
          {book.author && <p className="mt-1 truncate text-sm text-tinta-suave/70">{book.author}</p>}

          <div className="mt-4 flex items-center gap-3">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-linea/10">
              <span className="block h-full rounded-full bg-acento" style={{ width: `${percent}%` }} />
            </span>
            <span className="text-xs font-semibold tabular-nums text-tinta-suave/70">{percent}%</span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-tinta-suave/70">
            <span className="tabular-nums">
              Página {book.currentPage} de {book.pageCount}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" strokeWidth={2} aria-hidden />
              {remainingLabel(book)}
            </span>
          </div>

          <Link
            href={readerHref(book.id)}
            className="group mt-5 inline-flex items-center gap-2 rounded-tarjeta bg-acento px-5 py-2.5 text-sm font-semibold text-tinta shadow-suave transition-transform duration-300 ease-vuelo hover:-translate-y-0.5 dark:text-fondo"
          >
            Continuar
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.2} />
          </Link>
        </div>
      </div>
    </motion.section>
  );
}
