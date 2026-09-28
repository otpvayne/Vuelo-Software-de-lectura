'use client';

/*
 * Visor. Con `output: 'export'` no existen rutas dinámicas en runtime (los id viven
 * en la base local), así que el libro llega por query: /lector/?id=<uuid>.
 */
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Loader2 } from 'lucide-react';
import BookSpread, { type BookSpreadHandle } from '@/components/reader/BookSpread';
import NotesPanel from '@/components/reader/NotesPanel';
import Toolbar from '@/components/reader/Toolbar';
import EmptyState from '@/components/ui/EmptyState';
import { getStore, type Book, type Bookmark, type Highlight, type Note } from '@/lib/db';
import { closePdf, openPdf } from '@/lib/pdf';

interface Loaded {
  book: Book;
  doc: PDFDocumentProxy;
  aspect: number;
}

function Reader() {
  const id = useSearchParams().get('id');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [notes, setNotes] = useState<Note[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const spreadRef = useRef<BookSpreadHandle>(null);

  useEffect(() => {
    if (!id) {
      setFailed(true);
      return;
    }
    let doc: PDFDocumentProxy | null = null;
    let cancelled = false;
    (async () => {
      const store = await getStore();
      const book = await store.getBook(id);
      if (!book) throw new Error('Libro no encontrado');
      doc = await openPdf(await store.readBookFile(book));
      const first = (await doc.getPage(1)).getViewport({ scale: 1 });
      const [n, h, b] = await Promise.all([
        store.listNotes(id),
        store.listHighlights(id),
        store.listBookmarks(id),
        store.updateReading(id, book.currentPage),
      ]);
      if (cancelled) return;
      setNotes(n);
      setHighlights(h);
      setBookmarks(b);
      setPage(book.currentPage);
      setLoaded({ book, doc, aspect: first.height / first.width });
    })().catch((err: unknown) => {
      console.error(err);
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
      if (doc) void closePdf(doc);
    };
  }, [id]);

  // Guarda el progreso sin escribir en cada giro de página.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      void getStore().then((s) => s.updateReading(loaded.book.id, page));
    }, 400);
    return () => clearTimeout(t);
  }, [loaded, page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight') spreadRef.current?.next();
      if (e.key === 'ArrowLeft') spreadRef.current?.prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleBookmark = useCallback(async () => {
    if (!loaded) return;
    const store = await getStore();
    await store.toggleBookmark(loaded.book.id, page);
    setBookmarks(await store.listBookmarks(loaded.book.id));
  }, [loaded, page]);

  if (failed) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <EmptyState
          title="Este libro se ha perdido en el viaje"
          description="No encontramos el PDF. Puede que se haya borrado de la biblioteca."
          action={
            <Link href="/" className="rounded-tarjeta bg-acento px-6 py-3 font-semibold text-tinta dark:text-fondo">
              Volver a la biblioteca
            </Link>
          }
        />
      </main>
    );
  }

  if (!loaded) return <ReaderLoading />;

  const { book, doc, aspect } = loaded;

  return (
    <div className="h-dvh overflow-hidden bg-fondo">
      <Toolbar
        title={book.title}
        page={page}
        pageCount={doc.numPages}
        bookmarked={bookmarks.some((b) => b.page === page)}
        notesOpen={notesOpen}
        onPrev={() => spreadRef.current?.prev()}
        onNext={() => spreadRef.current?.next()}
        onToggleBookmark={() => void toggleBookmark()}
        onToggleNotes={() => setNotesOpen((o) => !o)}
      />

      <main className="size-full px-3 pb-6 pt-24 sm:px-10">
        <BookSpread
          ref={spreadRef}
          doc={doc}
          aspect={aspect}
          startPage={book.currentPage}
          highlights={highlights}
          onPageChange={setPage}
        />
      </main>

      <NotesPanel
        open={notesOpen}
        page={page}
        notes={notes}
        onClose={() => setNotesOpen(false)}
        onGoTo={(p) => spreadRef.current?.goTo(p)}
        onAdd={async (content) => {
          const store = await getStore();
          const note = await store.addNote(book.id, page, content);
          setNotes((prev) => [...prev, note].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt));
        }}
        onDelete={async (noteId) => {
          await (await getStore()).deleteNote(noteId);
          setNotes((prev) => prev.filter((n) => n.id !== noteId));
        }}
      />
    </div>
  );
}

function ReaderLoading() {
  return (
    <main className="grid min-h-dvh place-items-center" aria-busy>
      <Loader2 className="size-8 animate-spin text-tinta-suave/50" aria-label="Abriendo libro" />
    </main>
  );
}

export default function ReaderPage() {
  return (
    <Suspense fallback={<ReaderLoading />}>
      <Reader />
    </Suspense>
  );
}
