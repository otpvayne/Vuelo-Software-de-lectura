'use client';

import { motion, useReducedMotion } from 'motion/react';
import { Search, X } from 'lucide-react';
import type { Book } from '@/lib/db';

export type SortKey = 'recientes' | 'titulo' | 'progreso';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recientes', label: 'Recientes' },
  { key: 'titulo', label: 'Título' },
  { key: 'progreso', label: 'Progreso' },
];

/** Mínimo de libros para mostrar búsqueda y orden. */
export const CONTROLS_MIN_BOOKS = 4;

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const recency = (b: Book) => b.lastOpenedAt ?? b.addedAt;

export function filterAndSort(books: Book[], query: string, sort: SortKey): Book[] {
  const q = fold(query.trim());
  const found = q ? books.filter((b) => fold(`${b.title} ${b.author ?? ''}`).includes(q)) : books.slice();
  switch (sort) {
    case 'titulo':
      return found.sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));
    case 'progreso':
      return found.sort((a, b) => b.progress - a.progress || recency(b) - recency(a));
    default:
      return found.sort((a, b) => recency(b) - recency(a));
  }
}

interface LibraryControlsProps {
  query: string;
  onQuery: (q: string) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
}

export default function LibraryControls({ query, onQuery, sort, onSort }: LibraryControlsProps) {
  const reduce = useReducedMotion() ?? false;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <label className="barra relative flex flex-1 items-center gap-2 rounded-suave px-3.5 focus-within:ring-2 focus-within:ring-acento focus-within:ring-offset-2 focus-within:ring-offset-fondo">
        <Search className="size-4 shrink-0 text-tinta-suave/50" strokeWidth={2} aria-hidden />
        <span className="sr-only">Buscar por título o autor</span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Buscar por título o autor"
          className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-tinta-suave/45 focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery('')}
            className="grid size-7 shrink-0 place-items-center rounded-[10px] hover:bg-papel/70"
            aria-label="Borrar búsqueda"
          >
            <X className="size-3.5" />
          </button>
        )}
      </label>

      <div role="radiogroup" aria-label="Ordenar libros" className="barra flex rounded-suave p-1">
        {SORTS.map(({ key, label }) => {
          const active = sort === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSort(key)}
              className={`relative flex-1 rounded-[12px] px-3.5 py-2 text-sm font-medium transition-colors sm:flex-none ${
                active ? 'text-tinta dark:text-fondo' : 'text-tinta-suave/65 hover:text-tinta'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="orden-activo"
                  className="absolute inset-0 rounded-[12px] bg-acento shadow-suave"
                  transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
