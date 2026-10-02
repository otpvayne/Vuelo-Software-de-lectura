'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import dynamic from 'next/dynamic';
import type { BackupTab } from '@/components/backup/LibraryMenu';
import BackupReminder from '@/components/backup/BackupReminder';
import LibraryMenu from '@/components/backup/LibraryMenu';
import AddBookButton from '@/components/library/AddBookButton';
import ContinueReading, { pickContinue } from '@/components/library/ContinueReading';
import DropOverlay from '@/components/library/DropOverlay';
import ImportStatus from '@/components/library/ImportStatus';
import LibraryControls, {
  CONTROLS_MIN_BOOKS,
  filterAndSort,
  type SortKey,
} from '@/components/library/LibraryControls';
import Shelf from '@/components/library/Shelf';
import { useBookImport } from '@/components/library/useBookImport';
import EmptyState from '@/components/ui/EmptyState';
import NightSky from '@/components/ui/NightSky';
import Onboarding from '@/components/ui/Onboarding';
import ThemeToggle from '@/components/ui/ThemeToggle';
import ReadingSummaryChip from '@/components/stats/ReadingSummaryChip';
import { marcarBibliotecaLista } from '@/lib/arranque';
import { APP_NAME, TAGLINE } from '@/lib/constants';
import { getStore, type Book } from '@/lib/db';
import { getStoredTheme, setTheme } from '@/lib/theme';
import { toggleWindowFrame } from '@/lib/windowChrome';

/** El diálogo (y fflate) solo se descargan al abrirlo: no pesan en la carga de la biblioteca. */
const BackupDialog = dynamic(() => import('@/components/backup/BackupDialog'), { ssr: false });

/** Cuánto dura la animación de "entrar a la repisa" de un libro nuevo. */
const NEW_BOOK_MS = 1600;

export default function LibraryPage() {
  const reduce = useReducedMotion() ?? false;
  const [books, setBooks] = useState<Book[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recientes');
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(new Set());

  const [backup, setBackup] = useState<{ open: boolean; tab: BackupTab }>({ open: false, tab: 'exportar' });

  const loadBooks = useCallback(() => {
    getStore()
      .then((store) => store.listBooks())
      .then(setBooks)
      .catch((err: unknown) => {
        console.error(err);
        setError('No pudimos abrir tu biblioteca.');
        setBooks([]);
      })
      .finally(marcarBibliotecaLista);
  }, []);
  useEffect(loadBooks, [loadBooks]);

  // Esc alterna entre ventana sin bordes y con bordes nativos (en el lector, Esc ya tiene su uso).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Menús, diálogos y campos de texto usan Esc para cerrarse o limpiar: ahí no se toca la ventana.
      if (document.querySelector('[role="dialog"], [role="menu"], [aria-expanded="true"]')) return;
      const t = e.target as HTMLElement | null;
      if (t?.matches('input, textarea, select, [contenteditable]')) return;
      void toggleWindowFrame().catch(console.error);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Tras restaurar: recargar libros y aplicar el tema restaurado (si cambió).
  const onRestored = useCallback(() => {
    loadBooks();
    const t = getStoredTheme();
    if (t && t !== document.documentElement.dataset.theme) setTheme(t);
    window.dispatchEvent(new CustomEvent('vuelo:metas'));
  }, [loadBooks]);

  const onAdded = useCallback((book: Book) => {
    setBooks((prev) => [book, ...(prev ?? [])]);
    setNewIds((prev) => new Set(prev).add(book.id));
    setTimeout(() => {
      setNewIds((prev) => {
        const next = new Set(prev);
        next.delete(book.id);
        return next;
      });
    }, NEW_BOOK_MS);
  }, []);

  const importer = useBookImport(onAdded);

  const removeBook = useCallback(async (book: Book) => {
    const store = await getStore();
    await store.deleteBook(book.id);
    setBooks((prev) => prev?.filter((b) => b.id !== book.id) ?? null);
  }, []);

  const hasBooks = !!books && books.length > 0;
  const showControls = !!books && books.length >= CONTROLS_MIN_BOOKS;
  const continueBook = useMemo(() => (books ? pickContinue(books) : null), [books]);
  const visible = useMemo(
    () => (books ? filterAndSort(books, showControls ? query : '', showControls ? sort : 'recientes') : []),
    [books, query, sort, showControls],
  );

  return (
    <div className="relative min-h-dvh">
      <NightSky />

      <header className="barra sticky top-3 z-30 mx-3 mt-3 flex items-center gap-3 rounded-panel px-3 py-2 sm:mx-6 sm:px-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- ícono local del bundle */}
        <img src="/vuelo-icon.png" alt="" width={40} height={40} className="size-10 rounded-[11px] shadow-suave" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-semibold leading-none">{APP_NAME}</h1>
          <p className="mt-1 truncate text-xs text-tinta-suave/60">{TAGLINE}</p>
        </div>
        <ReadingSummaryChip />
        {hasBooks && <AddBookButton variant="compact" onFiles={importer.importFiles} busy={importer.busy} />}
        <ThemeToggle />
        <LibraryMenu onBackup={(tab) => setBackup({ open: true, tab })} />
      </header>

      <main className="relative z-10 mx-auto max-w-[1344px] space-y-10 px-4 pb-24 pt-8 sm:px-8 sm:pt-10">
        {error && (
          <p role="alert" className="rounded-suave bg-papel p-4 text-sm">
            {error}
          </p>
        )}

        {books === null ? null : hasBooks ? (
          <>
            <BackupReminder books={books} onBackup={() => setBackup({ open: true, tab: 'exportar' })} />
            <AnimatePresence initial={false}>
              {continueBook && (
                <motion.div
                  key="continuar"
                  exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <ContinueReading book={continueBook} />
                </motion.div>
              )}
            </AnimatePresence>

            {showControls && <LibraryControls query={query} onQuery={setQuery} sort={sort} onSort={setSort} />}

            {visible.length > 0 ? (
              <Shelf books={visible} newIds={newIds} onDelete={removeBook} />
            ) : (
              <p className="py-16 text-center text-tinta-suave/70">
                Ningún libro coincide con “{query.trim()}”.
              </p>
            )}
          </>
        ) : (
          <EmptyState
            action={<AddBookButton onFiles={importer.importFiles} busy={importer.busy} />}
          />
        )}
      </main>

      <DropOverlay onFiles={importer.importFiles} />
      <ImportStatus progress={importer.progress} notices={importer.notices} onDismiss={importer.dismiss} />
      <Onboarding />
      {backup.open && (
        <BackupDialog
          open={backup.open}
          initialTab={backup.tab}
          onClose={() => setBackup((b) => ({ ...b, open: false }))}
          onRestored={onRestored}
        />
      )}
    </div>
  );
}
