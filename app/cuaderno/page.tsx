'use client';

/* Cuaderno del libro: /cuaderno/?id=<uuid> (mismo patrón que /lector/ por el export estático). */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, BookOpen, Bookmark as BookmarkIcon, Copy, Download, Loader2, Search, X } from 'lucide-react';
import NotebookHighlight from '@/components/notebook/NotebookHighlight';
import UndoToast from '@/components/reader/UndoToast';
import ThemeToggle from '@/components/ui/ThemeToggle';
import WingedBook from '@/components/ui/WingedBook';
import { copyText } from '@/lib/clipboard';
import { HIGHLIGHT_COLORS, HIGHLIGHT_META, type HighlightColor } from '@/lib/constants';
import { getStore, type Book, type Bookmark, type Highlight, type HighlightPatch, type Note } from '@/lib/db';
import {
  buildNotebook,
  filterNotebook,
  groupByPage,
  notebookFileName,
  notebookToMarkdown,
  type NotebookKind,
} from '@/lib/notebook';
import { saveTextFile } from '@/lib/saveFile';

const KINDS: { id: NotebookKind; label: string }[] = [
  { id: 'subrayado', label: 'Subrayados' },
  { id: 'apunte', label: 'Apuntes' },
  { id: 'marcador', label: 'Marcadores' },
];

const pageHref = (id: string, page: number) => `/lector/?id=${encodeURIComponent(id)}&p=${page}`;

function Notebook() {
  const id = useSearchParams().get('id');
  const [book, setBook] = useState<Book | null>(null);
  const [missing, setMissing] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [kinds, setKinds] = useState<Set<NotebookKind>>(new Set(['subrayado', 'apunte', 'marcador']));
  const [colors, setColors] = useState<Set<HighlightColor>>(new Set());
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    if (!id) return setMissing(true);
    void (async () => {
      const store = await getStore();
      const b = await store.getBook(id);
      if (!b) return setMissing(true);
      const [h, n, bm] = await Promise.all([store.listHighlights(id), store.listNotes(id), store.listBookmarks(id)]);
      setBook(b);
      setHighlights(h);
      setNotes(n);
      setBookmarks(bm);
    })().catch(() => setMissing(true));
  }, [id]);

  const all = useMemo(() => buildNotebook(highlights, notes, bookmarks), [highlights, notes, bookmarks]);
  const visible = useMemo(() => filterNotebook(all, { kinds, colors, query }), [all, kinds, colors, query]);
  const pages = useMemo(() => groupByPage(visible), [visible]);

  const counts = useMemo(() => {
    const byKind: Record<NotebookKind, number> = { subrayado: highlights.length, apunte: notes.length, marcador: bookmarks.length };
    const byColor: Record<HighlightColor, number> = { amarillo: 0, verde: 0, azul: 0, rosa: 0 };
    for (const h of highlights) byColor[h.color] += 1;
    return { byKind, byColor };
  }, [highlights, notes, bookmarks]);

  const updateHighlight = useCallback((hid: string, patch: HighlightPatch) => {
    setHighlights((list) => list.map((h) => (h.id === hid ? { ...h, ...patch } : h)));
    void getStore().then((s) => s.updateHighlight(hid, patch));
  }, []);
  const deleteHighlight = useCallback((hid: string) => {
    setHighlights((list) => list.filter((h) => h.id !== hid));
    void getStore().then((s) => s.deleteHighlight(hid));
  }, []);

  const toggle = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  if (missing) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="font-display text-2xl">No encontramos este cuaderno.</p>
          <Link href="/" className="mt-4 inline-block rounded-tarjeta bg-acento px-5 py-2.5 font-semibold text-tinta dark:text-fondo">
            Volver a la biblioteca
          </Link>
        </div>
      </main>
    );
  }
  if (!book) {
    return (
      <main className="grid min-h-dvh place-items-center" aria-busy>
        <Loader2 className="size-8 text-tinta-suave/50 motion-safe:animate-spin" aria-label="Abriendo cuaderno" />
      </main>
    );
  }

  const markdown = () => notebookToMarkdown(book, visible.length ? visible : all);

  return (
    <div className="min-h-dvh">
      <header className="barra sticky top-3 z-30 mx-3 mt-3 flex items-center gap-1.5 rounded-panel px-2 py-1.5 sm:mx-6">
        <Link href="/" className="grid size-11 shrink-0 place-items-center rounded-suave hover:bg-papel/70" aria-label="Volver a la biblioteca">
          <ArrowLeft className="size-5" strokeWidth={1.8} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tinta-suave/55">Cuaderno</p>
          <h1 className="truncate font-display text-lg font-semibold leading-tight">{book.title}</h1>
        </div>
        <Link
          href={`/lector/?id=${encodeURIComponent(book.id)}`}
          className="hidden items-center gap-1.5 rounded-suave px-3 py-2 text-sm font-medium hover:bg-papel/70 sm:inline-flex"
        >
          <BookOpen className="size-4" aria-hidden /> Leer
        </Link>
        <button
          type="button"
          disabled={!all.length}
          onClick={async () => {
            const ok = await copyText(markdown());
            setToast({ id: Date.now(), text: ok ? 'Cuaderno copiado como texto' : 'No se pudo copiar' });
          }}
          className="inline-flex items-center gap-1.5 rounded-suave px-3 py-2 text-sm font-medium hover:bg-papel/70 disabled:opacity-40"
          title="Copiar como texto (Markdown)"
        >
          <Copy className="size-4" aria-hidden />
          <span className="hidden sm:inline">Copiar como texto</span>
          <span className="sr-only sm:hidden">Copiar como texto</span>
        </button>
        <button
          type="button"
          disabled={!all.length}
          onClick={async () => {
            const r = await saveTextFile(notebookFileName(book.title), markdown());
            if (r === 'guardado') setToast({ id: Date.now(), text: 'Cuaderno guardado (.md)' });
            if (r === 'no-disponible') setToast({ id: Date.now(), text: 'Guardar no está disponible aquí: usa "Copiar como texto"' });
          }}
          className="inline-flex items-center gap-1.5 rounded-suave px-3 py-2 text-sm font-medium hover:bg-papel/70 disabled:opacity-40"
          title="Guardar como archivo .md"
        >
          <Download className="size-4" aria-hidden />
          <span className="hidden sm:inline">Guardar .md</span>
          <span className="sr-only sm:hidden">Guardar .md</span>
        </button>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-3xl px-3 pb-20 pt-6 sm:px-8">
        {all.length > 0 && (
          <div className="mb-5 space-y-3">
            <label className="barra flex items-center gap-2 rounded-suave px-3.5 focus-within:ring-2 focus-within:ring-acento focus-within:ring-offset-2 focus-within:ring-offset-fondo">
              <Search className="size-4 shrink-0 text-tinta-suave/50" aria-hidden />
              <span className="sr-only">Buscar en el cuaderno</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar en el cuaderno"
                className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-tinta-suave/45 focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} aria-label="Borrar búsqueda" className="p-1">
                  <X className="size-3.5" />
                </button>
              )}
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <div role="group" aria-label="Tipo" className="flex flex-wrap gap-1.5">
                {KINDS.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    aria-pressed={kinds.has(k.id)}
                    onClick={() => setKinds((s) => toggle(s, k.id))}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      kinds.has(k.id) ? 'border-tinta/30 bg-papel' : 'border-linea/15 text-tinta-suave/55 line-through decoration-tinta-suave/40'
                    }`}
                  >
                    {k.label} <span className="tabular-nums text-tinta-suave/60">{counts.byKind[k.id]}</span>
                  </button>
                ))}
              </div>
              <span aria-hidden className="mx-1 h-5 w-px bg-linea/15" />
              <div role="group" aria-label="Color" className="flex flex-wrap gap-1.5">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={colors.has(c)}
                    title={`${HIGHLIGHT_META[c].label} · ${HIGHLIGHT_META[c].meaning}`}
                    onClick={() => setColors((s) => toggle(s, c))}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium ${
                      colors.has(c) ? 'border-tinta/30 bg-papel' : 'border-linea/15'
                    }`}
                  >
                    <span aria-hidden className={`muestra-${c} size-2.5 rounded-full`} />
                    {HIGHLIGHT_META[c].meaning}
                    <span className="tabular-nums text-tinta-suave/60">{counts.byColor[c]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {!all.length ? (
          <EmptyNotebook bookId={book.id} />
        ) : (
          <div className="hoja-cuaderno overflow-hidden rounded-panel py-6 pl-[calc(var(--margen-x)+0.9rem)] pr-4 shadow-suave sm:pr-8">
            {pages.length === 0 ? (
              <p className="py-10 text-center text-sm text-tinta-suave/65">Nada coincide con estos filtros.</p>
            ) : (
              pages.map(({ page, items }) => (
                <section key={page} className="relative pb-6 last:pb-0" aria-labelledby={`p-${page}`}>
                  {/* Número de página en el margen: salta al lector */}
                  <Link
                    id={`p-${page}`}
                    href={pageHref(book.id, page)}
                    className="absolute right-full top-1 mr-[1.15rem] whitespace-nowrap rounded-[8px] px-0.5 text-[11px] font-semibold tabular-nums text-acento hover:underline sm:mr-7 sm:px-1 sm:text-xs"
                    title={`Abrir el libro en la página ${page}`}
                  >
                    p. {page}
                  </Link>
                  <div className="space-y-4">
                    {items.map((it) =>
                      it.kind === 'subrayado' ? (
                        <NotebookHighlight key={it.id} h={it.highlight} onUpdate={updateHighlight} onDelete={deleteHighlight} />
                      ) : it.kind === 'apunte' ? (
                        <div
                          key={it.id}
                          className={`nota-adhesiva max-w-md rounded-[4px] px-4 pb-3 pt-4 text-sm leading-relaxed ${
                            it.page % 2 ? 'rotate-[0.8deg]' : '-rotate-[0.8deg]'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{it.note.content}</p>
                          <p className="mt-1.5 text-[11px] text-tinta-suave/55">Apunte</p>
                        </div>
                      ) : (
                        <p key={it.id} className="flex items-center gap-2 text-sm text-tinta-suave/75">
                          <BookmarkIcon className="size-4 fill-acento text-acento" aria-hidden />
                          Marcador{it.bookmark.label ? `: ${it.bookmark.label}` : ' en esta página'}
                        </p>
                      ),
                    )}
                  </div>
                </section>
              ))
            )}
          </div>
        )}
      </main>
      <UndoToast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function EmptyNotebook({ bookId }: { bookId: string }) {
  return (
    <div className="hoja-cuaderno flex flex-col items-center rounded-panel px-6 py-14 text-center shadow-suave">
      <WingedBook className="w-28 text-papel" accentClassName="text-acento" outlineClassName="text-tinta/30" />
      <h2 className="mt-6 text-2xl font-semibold">Tu cuaderno está en blanco</h2>
      <p className="mt-2 max-w-sm text-sm text-tinta-suave/70">
        Mientras lees, subraya con <kbd className="rounded bg-papel px-1.5 font-sans text-xs">H</kbd>, toma apuntes o marca
        páginas. Aquí se irán juntando, página a página.
      </p>
      <Link
        href={`/lector/?id=${encodeURIComponent(bookId)}`}
        className="mt-6 inline-flex items-center gap-2 rounded-tarjeta bg-acento px-5 py-2.5 font-semibold text-tinta shadow-suave dark:text-fondo"
      >
        <BookOpen className="size-4" aria-hidden /> Abrir el libro
      </Link>
    </div>
  );
}

export default function NotebookPage() {
  return (
    <Suspense fallback={null}>
      <Notebook />
    </Suspense>
  );
}
