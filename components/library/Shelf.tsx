'use client';

import type { Book } from '@/lib/db';
import BookCard from './BookCard';

export default function Shelf({ books, title = 'Tu estantería' }: { books: Book[]; title?: string }) {
  return (
    <section aria-labelledby="estanteria">
      <h2 id="estanteria" className="mb-5 text-2xl font-semibold">
        {title}
      </h2>
      <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {books.map((book, i) => (
          <BookCard key={book.id} book={book} index={i} />
        ))}
      </ul>
    </section>
  );
}
