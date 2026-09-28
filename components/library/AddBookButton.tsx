'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { getStore, type Book } from '@/lib/db';
import { readPdfInfo } from '@/lib/pdf';

interface AddBookButtonProps {
  onAdded?: (book: Book) => void;
  variant?: 'primary' | 'compact';
}

const titleFromFile = (name: string) => name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();

export default function AddBookButton({ onAdded, variant = 'primary' }: AddBookButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;

    setBusy(true);
    setError(null);
    try {
      const store = await getStore();
      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const info = await readPdfInfo(bytes);
        const book = await store.addBook(
          {
            title: info.title ?? titleFromFile(file.name),
            author: info.author,
            pageCount: info.pageCount,
            cover: info.cover,
          },
          bytes,
        );
        onAdded?.(book);
      }
    } catch (err) {
      console.error(err);
      setError('No pudimos abrir ese PDF. ¿Está dañado o protegido?');
    } finally {
      setBusy(false);
    }
  }

  const Icon = busy ? Loader2 : Plus;

  return (
    <div className="flex flex-col items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={handleFiles}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={variant === 'compact' ? 'Añadir libro' : undefined}
        className={
          variant === 'compact'
            ? 'grid size-11 place-items-center rounded-suave bg-acento text-tinta shadow-suave transition-transform hover:-translate-y-0.5 disabled:opacity-60 dark:text-fondo'
            : 'inline-flex items-center gap-2 rounded-tarjeta bg-acento px-6 py-3.5 text-base font-semibold text-tinta shadow-flotante transition-transform duration-300 ease-vuelo hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 dark:text-fondo'
        }
      >
        <Icon className={`size-5 ${busy ? 'animate-spin' : ''}`} strokeWidth={2.2} />
        {variant === 'primary' && (busy ? 'Preparando tu libro…' : 'Añadir un PDF')}
      </button>
      {error && (
        <p role="alert" className="text-sm text-tinta-suave/70">
          {error}
        </p>
      )}
    </div>
  );
}
