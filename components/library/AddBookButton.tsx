'use client';

import { useRef, type ChangeEvent } from 'react';
import { Loader2, Plus } from 'lucide-react';

interface AddBookButtonProps {
  onFiles: (files: File[]) => void;
  busy?: boolean;
  variant?: 'primary' | 'compact';
}

/** Abre el selector de archivos (varios PDF a la vez). La importación la hace useBookImport. */
export default function AddBookButton({ onFiles, busy = false, variant = 'primary' }: AddBookButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length) onFiles(files);
  }

  const Icon = busy ? Loader2 : Plus;

  return (
    <>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={handleFiles} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label={variant === 'compact' ? 'Añadir libros' : undefined}
        title={variant === 'compact' ? 'Añadir PDF (también puedes arrastrarlos)' : undefined}
        className={
          variant === 'compact'
            ? 'grid size-11 place-items-center rounded-suave bg-acento text-tinta shadow-suave transition-transform hover:-translate-y-0.5 dark:text-fondo'
            : 'inline-flex items-center gap-2 rounded-tarjeta bg-acento px-6 py-3.5 text-base font-semibold text-tinta shadow-flotante transition-transform duration-300 ease-vuelo hover:-translate-y-0.5 active:translate-y-0 dark:text-fondo'
        }
      >
        <Icon className={`size-5 ${busy ? 'motion-safe:animate-spin' : ''}`} strokeWidth={2.2} />
        {variant === 'primary' && 'Añadir PDF'}
      </button>
    </>
  );
}
