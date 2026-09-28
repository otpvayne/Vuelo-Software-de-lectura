'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, Copy, StickyNote, Trash2, X } from 'lucide-react';
import { HIGHLIGHT_COLORS, HIGHLIGHT_META, type HighlightColor } from '@/lib/constants';
import type { HighlightPatch } from '@/lib/db';
import type { HighlightBook } from '@/lib/highlightStore';
import { shortText } from './HighlightLayer';

const NOTE_SAVE_MS = 500;
const MENU_W = 288;

interface HighlightMenuProps {
  store: HighlightBook;
  id: string;
  anchor: HTMLElement;
  onUpdate(id: string, patch: HighlightPatch): void;
  onDelete(id: string): void;
  onCopy(text: string): Promise<boolean>;
  onClose(): void;
}

/**
 * Menú anclado a un subrayado: color, nota con autoguardado, copiar y eliminar (con
 * confirmación en línea). Se cierra con Esc o tocando fuera y devuelve el foco al subrayado.
 */
export default function HighlightMenu({ store, id, anchor, onUpdate, onDelete, onCopy, onClose }: HighlightMenuProps) {
  const reduce = useReducedMotion() ?? false;
  const h = useSyncExternalStore(store.subscribe, () => store.get(id), () => undefined);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const [noteOpen, setNoteOpen] = useState(!!h?.note);
  const [note, setNote] = useState(h?.note ?? '');
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const pendingNote = useRef<string | null>(null);

  // Posición: debajo del subrayado si cabe; si no, encima. Siempre dentro de la ventana.
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const height = ref.current?.offsetHeight ?? 200;
    const below = r.bottom + 10 + height < window.innerHeight - 8;
    const left = Math.min(window.innerWidth - MENU_W - 8, Math.max(8, r.left + r.width / 2 - MENU_W / 2));
    setPos({ left, top: below ? r.bottom + 10 : Math.max(8, r.top - 10 - height), below });
  }, [anchor, noteOpen, confirming]);

  const flushNote = () => {
    clearTimeout(saveTimer.current);
    if (pendingNote.current !== null) {
      onUpdate(id, { note: pendingNote.current.trim() || null });
      pendingNote.current = null;
    }
  };

  const close = () => {
    flushNote();
    onClose();
    if (anchor.isConnected) anchor.focus({ preventScroll: true });
  };

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button[aria-checked="true"], button')?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      close();
    };
    const onDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor.contains(e.target as Node)) return;
      close();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
    };
  });

  useEffect(() => () => flushNote(), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!h) return null;
  const meta = HIGHLIGHT_META[h.color];

  const changeNote = (value: string) => {
    setNote(value);
    pendingNote.current = value;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushNote, NOTE_SAVE_MS);
  };

  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-label={`Subrayado ${meta.label.toLowerCase()}: «${shortText(h.text, 40)}»`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: pos ? 1 : 0, scale: 1 }}
      transition={{ duration: reduce ? 0 : 0.14 }}
      className="barra fixed z-50 rounded-tarjeta bg-fondo/95 p-3"
      style={{ width: MENU_W, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <p className="mb-2.5 line-clamp-2 text-xs italic text-tinta-suave/70">«{shortText(h.text, 110)}»</p>

      <div role="radiogroup" aria-label="Color" className="flex items-center gap-2">
        {HIGHLIGHT_COLORS.map((c: HighlightColor) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={h.color === c}
            aria-label={`${HIGHLIGHT_META[c].label}: ${HIGHLIGHT_META[c].meaning.toLowerCase()}`}
            title={`${HIGHLIGHT_META[c].label} · ${HIGHLIGHT_META[c].meaning}`}
            onClick={() => onUpdate(id, { color: c })}
            className={`muestra-${c} grid size-8 place-items-center rounded-full shadow-suave ring-offset-2 ring-offset-fondo ${
              h.color === c ? 'ring-2 ring-tinta/70' : ''
            }`}
          >
            {h.color === c && <Check className="size-4 text-tinta" strokeWidth={2.6} aria-hidden />}
          </button>
        ))}
        <span className="ml-auto text-xs text-tinta-suave/55">Pág. {h.page}</span>
      </div>

      {noteOpen ? (
        <label className="mt-3 block">
          <span className="sr-only">Nota del subrayado</span>
          <textarea
            value={note}
            onChange={(e) => changeNote(e.target.value)}
            onBlur={flushNote}
            rows={3}
            maxLength={500}
            autoFocus={!h.note}
            placeholder="Una nota breve… (se guarda sola)"
            className="w-full resize-none rounded-suave border border-linea/15 bg-papel/50 p-2.5 text-sm placeholder:text-tinta-suave/40"
          />
        </label>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {!noteOpen && (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-suave px-2.5 py-2 text-sm hover:bg-papel/70"
          >
            <StickyNote className="size-4" strokeWidth={1.8} aria-hidden />
            Añadir nota
          </button>
        )}
        <button
          type="button"
          onClick={async () => setCopied(await onCopy(h.text ?? ''))}
          className="inline-flex items-center gap-1.5 rounded-suave px-2.5 py-2 text-sm hover:bg-papel/70"
        >
          {copied ? <Check className="size-4 text-acento" aria-hidden /> : <Copy className="size-4" strokeWidth={1.8} aria-hidden />}
          {copied ? 'Copiado' : 'Copiar texto'}
        </button>
        {confirming ? (
          <span className="ml-auto flex items-center gap-1" role="group" aria-label="Confirmar eliminación">
            <button
              type="button"
              autoFocus
              onClick={() => onDelete(id)}
              className="rounded-suave bg-acento px-2.5 py-1.5 text-sm font-semibold text-tinta dark:text-fondo"
            >
              Eliminar
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              aria-label="Cancelar"
              className="grid size-8 place-items-center rounded-suave hover:bg-papel/70"
            >
              <X className="size-4" />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-suave px-2.5 py-2 text-sm text-tinta-suave/80 hover:bg-papel/70"
          >
            <Trash2 className="size-4" strokeWidth={1.8} aria-hidden />
            Eliminar
          </button>
        )}
      </div>
    </motion.div>
  );
}
