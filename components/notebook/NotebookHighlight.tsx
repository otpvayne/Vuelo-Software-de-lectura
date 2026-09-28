'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, StickyNote, Trash2, X } from 'lucide-react';
import { HIGHLIGHT_COLORS, HIGHLIGHT_META } from '@/lib/constants';
import type { Highlight, HighlightPatch } from '@/lib/db';

const NOTE_SAVE_MS = 500;

/** Un subrayado en el cuaderno: texto con rotulador, color y nota editables, borrar en línea. */
export default function NotebookHighlight({
  h,
  onUpdate,
  onDelete,
}: {
  h: Highlight;
  onUpdate(id: string, patch: HighlightPatch): void;
  onDelete(id: string): void;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(h.note ?? '');
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pending = useRef<string | null>(null);
  const meta = HIGHLIGHT_META[h.color];

  const flush = () => {
    clearTimeout(timer.current);
    if (pending.current !== null) {
      onUpdate(h.id, { note: pending.current.trim() || null });
      pending.current = null;
    }
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <article className="group" aria-label={`Subrayado ${meta.label.toLowerCase()} (${meta.meaning.toLowerCase()})`}>
      <p className="font-display text-[17px] leading-8 sm:text-lg">
        <span className={`texto-marcador hl-${h.color}`}>{h.text}</span>
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div role="radiogroup" aria-label="Color" className="flex items-center gap-1">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={h.color === c}
              aria-label={`${HIGHLIGHT_META[c].label}: ${HIGHLIGHT_META[c].meaning.toLowerCase()}`}
              title={`${HIGHLIGHT_META[c].label} · ${HIGHLIGHT_META[c].meaning}`}
              onClick={() => onUpdate(h.id, { color: c })}
              className={`muestra-${c} grid size-5 place-items-center rounded-full ring-offset-1 ring-offset-fondo ${
                h.color === c ? 'ring-2 ring-tinta/60' : 'opacity-70 hover:opacity-100'
              }`}
            >
              {h.color === c && <Check className="size-3" strokeWidth={3} aria-hidden />}
            </button>
          ))}
        </div>
        <span className="text-xs text-tinta-suave/55">{meta.meaning}</span>
        {!editingNote && !h.note && (
          <button
            type="button"
            onClick={() => setEditingNote(true)}
            className="inline-flex items-center gap-1 text-xs text-tinta-suave/60 hover:text-tinta"
          >
            <StickyNote className="size-3.5" aria-hidden /> Añadir nota
          </button>
        )}
        <span className="ml-auto">
          {confirming ? (
            <span className="inline-flex items-center gap-1" role="group" aria-label="Confirmar eliminación">
              <button
                type="button"
                autoFocus
                onClick={() => onDelete(h.id)}
                className="rounded-[10px] bg-acento px-2.5 py-1 text-xs font-semibold text-tinta dark:text-fondo"
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
              className="inline-flex items-center gap-1 text-xs text-tinta-suave/50 opacity-100 transition-opacity hover:text-tinta sm:opacity-0 sm:focus:opacity-100 sm:group-hover:opacity-100"
              aria-label="Eliminar subrayado"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          )}
        </span>
      </div>

      {editingNote ? (
        <textarea
          value={note}
          autoFocus
          rows={2}
          maxLength={500}
          placeholder="Tu nota… (se guarda sola)"
          aria-label="Nota del subrayado"
          onChange={(e) => {
            setNote(e.target.value);
            pending.current = e.target.value;
            clearTimeout(timer.current);
            timer.current = setTimeout(flush, NOTE_SAVE_MS);
          }}
          onBlur={() => {
            flush();
            setEditingNote(false);
          }}
          className="mt-2 w-full max-w-lg resize-none rounded-[12px] border border-linea/15 bg-fondo/80 p-2.5 text-sm"
        />
      ) : (
        h.note && (
          <button
            type="button"
            onClick={() => setEditingNote(true)}
            title="Editar nota"
            className="mt-2 block max-w-lg border-l-2 border-acento/60 pl-3 text-left text-sm italic text-tinta-suave/80"
          >
            {h.note}
          </button>
        )
      )}
    </article>
  );
}
