'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { Book } from '@/lib/db';
import BookCard, { LIFT_ROOM } from './BookCard';

interface ShelfProps {
  books: Book[];
  title?: string;
  newIds?: ReadonlySet<string>;
  onDelete?: (book: Book) => Promise<void>;
}

const PLANK_H = 20;
const CAPTION_H = 64;
/** Proporción del hueco que ocupa la portada (deja aire para el lomo al inclinarse). */
const BOOK_RATIO = 0.74;

/** Columnas según el ancho real de la estantería (no del viewport). */
export function columnsFor(width: number) {
  if (width < 560) return 2; // móvil (390px → 2)
  if (width < 700) return 3;
  if (width < 920) return 4; // tablet (820px → 4)
  if (width < 1160) return 5;
  return 6; // escritorio (1440px → 6)
}

function metrics(width: number) {
  const cols = columnsFor(width);
  const colGap = width < 560 ? 16 : 28;
  const rowGap = width < 560 ? 28 : 36;
  const colW = (width - colGap * (cols - 1)) / cols;
  const bookW = Math.round(colW * BOOK_RATIO);
  const bookH = Math.round((bookW * 4) / 3);
  const slotH = LIFT_ROOM + bookH + PLANK_H + CAPTION_H;
  return { cols, colGap, rowGap, bookW, bookH, pitch: slotH + rowGap, plankTop: LIFT_ROOM + bookH };
}

export default function Shelf({ books, title = 'Tu estantería', newIds, onDelete }: ShelfProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const m = useMemo(() => (width ? metrics(width) : null), [width]);
  const rows = m ? Math.max(1, Math.ceil(books.length / m.cols)) : 0;

  return (
    <section aria-labelledby="estanteria">
      <h2 id="estanteria" className="mb-4 text-2xl font-semibold">
        {title}
      </h2>
      <div ref={ref} className="relative">
        {m && (
          <>
            {/* Una repisa por fila, alineada con la base de los libros */}
            {Array.from({ length: rows }, (_, i) => (
              <div
                key={i}
                aria-hidden
                className="repisa absolute -left-3 -right-3"
                style={{ top: i * m.pitch + m.plankTop, height: PLANK_H }}
              />
            ))}
            <ul
              className="relative grid"
              style={{
                gridTemplateColumns: `repeat(${m.cols}, minmax(0, 1fr))`,
                columnGap: m.colGap,
                rowGap: m.rowGap,
              }}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {books.map((book, i) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    index={i}
                    bookWidth={m.bookW}
                    bookHeight={m.bookH}
                    plankHeight={PLANK_H}
                    captionHeight={CAPTION_H}
                    isNew={newIds?.has(book.id)}
                    onDelete={onDelete}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
