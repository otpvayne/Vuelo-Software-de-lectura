'use client';

import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Trash2, X } from 'lucide-react';
import type { Note } from '@/lib/db';

interface NotesPanelProps {
  open: boolean;
  page: number;
  notes: Note[];
  onClose(): void;
  onAdd(content: string): Promise<void>;
  onDelete(id: string): Promise<void>;
  onGoTo(page: number): void;
}

export default function NotesPanel({ open, page, notes, onClose, onAdd, onDelete, onGoTo }: NotesPanelProps) {
  const [draft, setDraft] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    await onAdd(content);
    setDraft('');
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: '105%' }}
          animate={{ x: 0 }}
          exit={{ x: '105%' }}
          transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          className="barra fixed bottom-3 right-3 top-20 z-20 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col rounded-panel sm:right-6"
          aria-label="Notas del libro"
        >
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <h2 className="text-xl font-semibold">Notas</h2>
            <button
              type="button"
              onClick={onClose}
              className="grid size-9 place-items-center rounded-suave hover:bg-papel/70"
              aria-label="Cerrar notas"
            >
              <X className="size-4" />
            </button>
          </div>

          <form onSubmit={submit} className="px-4">
            <label htmlFor="nueva-nota" className="sr-only">
              Nueva nota para la página {page}
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
              Guardar nota
            </button>
          </form>

          <ul className="mt-4 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
            {notes.length === 0 && (
              <li className="py-8 text-center text-sm text-tinta-suave/50">Aún no hay notas en este libro.</li>
            )}
            {notes.map((note) => (
              <li key={note.id} className="group rounded-suave bg-papel/70 p-3">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onGoTo(note.page)}
                    className="text-xs font-semibold uppercase tracking-wider text-tinta-suave/60 hover:text-tinta"
                  >
                    Pág. {note.page}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDelete(note.id)}
                    className="opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                    aria-label="Borrar nota"
                  >
                    <Trash2 className="size-4 text-tinta-suave/60" />
                  </button>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{note.content}</p>
              </li>
            ))}
          </ul>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
