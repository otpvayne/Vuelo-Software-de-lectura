'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Bookmark as BookmarkIcon, Check, Copy, Trash2, X } from 'lucide-react';
import { HIGHLIGHT_COLORS, HIGHLIGHT_META, type HighlightColor } from '@/lib/constants';
import type { Bookmark, Highlight, HighlightPatch, Note } from '@/lib/db';
import type { HighlightBook } from '@/lib/highlightStore';

export type PanelTab = 'apuntes' | 'marcadores' | 'subrayados';

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'apuntes', label: 'Apuntes' },
  { id: 'marcadores', label: 'Marcadores' },
  { id: 'subrayados', label: 'Subrayados' },
];

interface NotesPanelProps {
  open: boolean;
  tab: PanelTab;
  onTab(tab: PanelTab): void;
  page: number;
  notes: Note[];
  bookmarks: Bookmark[];
  highlights: HighlightBook;
  onClose(): void;
  onAdd(content: string): Promise<void>;
  onDelete(id: string): Promise<void>;
  onRemoveBookmark(page: number): Promise<void>;
  onUpdateHighlight(id: string, patch: HighlightPatch): void;
  onDeleteHighlight(id: string): void;
  onCopyAll(list: readonly Highlight[]): Promise<boolean>;
  onGoTo(page: number): void;
}

const itemButton = 'text-xs font-semibold uppercase tracking-wider text-tinta-suave/60 hover:text-tinta';

export default function NotesPanel(props: NotesPanelProps) {
  const { open, tab, onTab, onClose } = props;
  const reduce = useReducedMotion() ?? false;

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={reduce ? { opacity: 0 } : { x: '105%' }}
          animate={reduce ? { opacity: 1 } : { x: 0 }}
          exit={reduce ? { opacity: 0 } : { x: '105%' }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 34 }}
          className="barra fixed bottom-3 right-3 top-20 z-20 flex w-[min(24rem,calc(100vw-1.5rem))] flex-col rounded-panel sm:right-6"
          aria-label="Apuntes, marcadores y subrayados"
        >
          <div className="flex items-center justify-between px-4 pb-2 pt-3">
            <div role="tablist" aria-label="Secciones" className="flex rounded-suave bg-papel/50 p-0.5">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`pestana-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls={`panel-${t.id}`}
                  onClick={() => onTab(t.id)}
                  className={`rounded-[12px] px-3 py-1.5 text-sm font-medium transition-colors ${
                    tab === t.id ? 'bg-fondo text-tinta shadow-suave' : 'text-tinta-suave/65 hover:text-tinta'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid size-9 place-items-center rounded-suave hover:bg-papel/70"
              aria-label="Cerrar panel"
            >
              <X className="size-4" />
            </button>
          </div>

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`pestana-${tab}`} className="flex min-h-0 flex-1 flex-col">
            {tab === 'apuntes' && <NotesTab {...props} />}
            {tab === 'marcadores' && <BookmarksTab {...props} />}
            {tab === 'subrayados' && <HighlightsTab {...props} />}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function NotesTab({ page, notes, onAdd, onDelete, onGoTo }: NotesPanelProps) {
  const [draft, setDraft] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    await onAdd(content);
    setDraft('');
  }
  return (
    <>
      <form onSubmit={submit} className="px-4">
        <label htmlFor="nueva-nota" className="sr-only">
          Nuevo apunte para la página {page}
        </label>
        <textarea
          id="nueva-nota"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Una idea sobre la página ${page}…`}
          rows={3}
          className="w-full resize-none rounded-suave border border-linea/10 bg-fondo/80 p-3 text-sm placeholder:text-tinta-suave/40"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="mt-2 w-full rounded-suave bg-acento py-2.5 text-sm font-semibold text-tinta disabled:opacity-50 dark:text-fondo"
        >
          Guardar apunte
        </button>
      </form>
      <ul className="mt-4 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
        {notes.length === 0 && (
          <li className="py-8 text-center text-sm text-tinta-suave/50">Aún no hay apuntes en este libro.</li>
        )}
        {notes.map((note) => (
          <li key={note.id} className="group rounded-suave bg-papel/70 p-3">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => onGoTo(note.page)} className={itemButton}>
                Pág. {note.page}
              </button>
              <button
                type="button"
                onClick={() => void onDelete(note.id)}
                className="opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                aria-label="Borrar apunte"
              >
                <Trash2 className="size-4 text-tinta-suave/60" />
              </button>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{note.content}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

function BookmarksTab({ bookmarks, onGoTo, onRemoveBookmark }: NotesPanelProps) {
  return (
    <ul className="flex-1 space-y-2 overflow-y-auto px-4 pb-4 pt-1">
      {bookmarks.length === 0 && (
        <li className="py-8 text-center text-sm text-tinta-suave/50">Sin marcadores. Usa el botón del marcapáginas.</li>
      )}
      {bookmarks.map((b) => (
        <li key={b.id} className="group flex items-center gap-3 rounded-suave bg-papel/70 px-3 py-2.5">
          <BookmarkIcon className="size-4 shrink-0 fill-acento text-acento" aria-hidden />
          <button type="button" onClick={() => onGoTo(b.page)} className="flex-1 text-left text-sm hover:underline">
            Página {b.page}
          </button>
          <button
            type="button"
            onClick={() => void onRemoveBookmark(b.page)}
            className="opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
            aria-label={`Quitar marcador de la página ${b.page}`}
          >
            <Trash2 className="size-4 text-tinta-suave/60" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function HighlightsTab({ highlights, onGoTo, onUpdateHighlight, onDeleteHighlight, onCopyAll }: NotesPanelProps) {
  const all = useSyncExternalStore(highlights.subscribe, highlights.all, highlights.all);
  const [filter, setFilter] = useState<HighlightColor | null>(null);
  const [copied, setCopied] = useState(false);

  const counts = useMemo(() => {
    const c: Record<HighlightColor, number> = { amarillo: 0, verde: 0, azul: 0, rosa: 0 };
    for (const h of all) c[h.color] += 1;
    return c;
  }, [all]);
  const list = filter ? all.filter((h) => h.color === filter) : all;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2" role="group" aria-label="Filtrar por color">
        {HIGHLIGHT_COLORS.map((c) => {
          const active = filter === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(active ? null : c)}
              title={`${HIGHLIGHT_META[c].label} · ${HIGHLIGHT_META[c].meaning}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                active ? 'border-tinta/40 bg-papel' : 'border-linea/15 hover:bg-papel/60'
              }`}
            >
              <span aria-hidden className={`muestra-${c} size-2.5 rounded-full`} />
              {HIGHLIGHT_META[c].label}
              <span className="tabular-nums text-tinta-suave/60">{counts[c]}</span>
            </button>
          );
        })}
      </div>
      <div className="px-4 pb-2">
        <button
          type="button"
          disabled={!all.length}
          onClick={async () => setCopied(await onCopyAll(all))}
          className="inline-flex w-full items-center justify-center gap-2 rounded-suave border border-linea/15 py-2 text-sm font-medium hover:bg-papel/60 disabled:opacity-50"
        >
          {copied ? <Check className="size-4 text-acento" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? 'Copiados' : 'Copiar todos los subrayados'}
        </button>
      </div>
      <ul className="flex-1 space-y-2 overflow-y-auto px-4 pb-4">
        {list.length === 0 && (
          <li className="py-8 text-center text-sm text-tinta-suave/50">
            {all.length ? 'Ninguno de este color.' : 'Aún no hay subrayados. Activa Subrayar (H) y selecciona texto.'}
          </li>
        )}
        {list.map((h) => (
          <HighlightItem
            key={h.id}
            h={h}
            onGoTo={onGoTo}
            onUpdate={onUpdateHighlight}
            onDelete={onDeleteHighlight}
          />
        ))}
      </ul>
    </>
  );
}

function HighlightItem({
  h,
  onGoTo,
  onUpdate,
  onDelete,
}: {
  h: Highlight;
  onGoTo(page: number): void;
  onUpdate(id: string, patch: HighlightPatch): void;
  onDelete(id: string): void;
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(h.note ?? '');
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pending = useRef<string | null>(null);

  const flush = () => {
    clearTimeout(timer.current);
    if (pending.current !== null) {
      onUpdate(h.id, { note: pending.current.trim() || null });
      pending.current = null;
    }
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <li className="group relative overflow-hidden rounded-suave bg-papel/70 py-2.5 pl-4 pr-3">
      <span aria-hidden className={`muestra-${h.color} absolute inset-y-0 left-0 w-1.5`} />
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => onGoTo(h.page)} className={itemButton}>
          Pág. {h.page} · {HIGHLIGHT_META[h.color].meaning}
        </button>
        {confirming ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              autoFocus
              onClick={() => onDelete(h.id)}
              className="rounded-[10px] bg-acento px-2 py-1 text-xs font-semibold text-tinta dark:text-fondo"
            >
              Eliminar
            </button>
            <button type="button" onClick={() => setConfirming(false)} aria-label="Cancelar" className="p-1">
              <X className="size-3.5" />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
            aria-label="Eliminar subrayado"
          >
            <Trash2 className="size-4 text-tinta-suave/60" />
          </button>
        )}
      </div>
      <button type="button" onClick={() => onGoTo(h.page)} className="mt-1 block text-left text-sm leading-snug">
        {h.text}
      </button>
      {editing ? (
        <textarea
          value={note}
          autoFocus
          rows={2}
          maxLength={500}
          onChange={(e) => {
            setNote(e.target.value);
            pending.current = e.target.value;
            clearTimeout(timer.current);
            timer.current = setTimeout(flush, 500);
          }}
          onBlur={() => {
            flush();
            setEditing(false);
          }}
          aria-label="Nota del subrayado"
          className="mt-2 w-full resize-none rounded-[10px] border border-linea/15 bg-fondo/70 p-2 text-xs"
        />
      ) : h.note ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-1.5 block w-full rounded-[10px] bg-fondo/60 px-2 py-1.5 text-left text-xs text-tinta-suave/80"
          title="Editar nota"
        >
          {h.note}
        </button>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="mt-1 text-xs text-tinta-suave/55 hover:text-tinta">
          + Añadir nota
        </button>
      )}
    </li>
  );
}
