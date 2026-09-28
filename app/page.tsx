'use client';

import { useCallback, useEffect, useState } from 'react';
import { Feather } from 'lucide-react';
import AddBookButton from '@/components/library/AddBookButton';
import ContinueReading from '@/components/library/ContinueReading';
import Shelf from '@/components/library/Shelf';
import EmptyState from '@/components/ui/EmptyState';
import Onboarding from '@/components/ui/Onboarding';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { APP_NAME, TAGLINE } from '@/lib/constants';
import { getStore, type Book } from '@/lib/db';

export default function LibraryPage() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const store = await getStore();
      setBooks(await store.listBooks());
    } catch (err) {
      console.error(err);
      setError('No pudimos abrir tu biblioteca.');
      setBooks([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const removeBook = useCallback(async (book: Book) => {
    const store = await getStore();
    await store.deleteBook(book.id);
    setBooks((prev) => prev?.filter((b) => b.id !== book.id) ?? null);
  }, []);

  const lastRead = books?.find((b) => b.lastOpenedAt !== null && b.progress < 1);
  const hasBooks = !!books && books.length > 0;

  return (
    <div className="min-h-dvh">
      <header className="barra sticky top-3 z-30 mx-3 mt-3 flex items-center gap-3 rounded-panel px-4 py-2 sm:mx-6">
        <Feather className="size-6 text-acento" strokeWidth={1.8} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-semibold leading-none">{APP_NAME}</p>
          <p className="hidden truncate text-xs text-tinta-suave/60 sm:block">{TAGLINE}</p>
        </div>
        {hasBooks && <AddBookButton variant="compact" onAdded={() => void load()} />}
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-6xl space-y-12 px-4 pb-16 pt-10 sm:px-8">
        {error && (
          <p role="alert" className="rounded-suave bg-papel p-4 text-sm">
            {error}
          </p>
        )}
        {books === null ? null : hasBooks ? (
          <>
            {lastRead && <ContinueReading book={lastRead} />}
            <Shelf books={books} onDelete={removeBook} />
          </>
        ) : (
          <EmptyState action={<AddBookButton onAdded={() => void load()} />} />
        )}
      </main>

      <Onboarding />
    </div>
  );
}
