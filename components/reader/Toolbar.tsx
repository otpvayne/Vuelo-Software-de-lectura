'use client';

import Link from 'next/link';
import { ArrowLeft, Bookmark, ChevronLeft, ChevronRight, NotebookPen } from 'lucide-react';
import ThemeToggle from '@/components/ui/ThemeToggle';

interface ToolbarProps {
  title: string;
  page: number;
  pageCount: number;
  bookmarked: boolean;
  notesOpen: boolean;
  onPrev(): void;
  onNext(): void;
  onToggleBookmark(): void;
  onToggleNotes(): void;
}

const iconButton =
  'grid size-11 place-items-center rounded-suave text-tinta transition-colors hover:bg-papel/70 disabled:opacity-40';

export default function Toolbar({
  title,
  page,
  pageCount,
  bookmarked,
  notesOpen,
  onPrev,
  onNext,
  onToggleBookmark,
  onToggleNotes,
}: ToolbarProps) {
  return (
    <header className="barra fixed inset-x-3 top-3 z-30 flex items-center gap-1 rounded-panel px-2 py-1.5 sm:inset-x-6">
      <Link href="/" className={iconButton} aria-label="Volver a la biblioteca">
        <ArrowLeft className="size-5" strokeWidth={1.8} />
      </Link>

      <h1 className="mx-2 min-w-0 flex-1 truncate font-display text-base font-medium sm:text-lg">{title}</h1>

      <div className="hidden items-center sm:flex">
        <button type="button" className={iconButton} onClick={onPrev} disabled={page <= 1} aria-label="Página anterior">
          <ChevronLeft className="size-5" strokeWidth={1.8} />
        </button>
        <span className="min-w-20 text-center text-sm tabular-nums text-tinta-suave/70">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          className={iconButton}
          onClick={onNext}
          disabled={page >= pageCount}
          aria-label="Página siguiente"
        >
          <ChevronRight className="size-5" strokeWidth={1.8} />
        </button>
      </div>

      <button
        type="button"
        className={iconButton}
        onClick={onToggleBookmark}
        aria-pressed={bookmarked}
        aria-label={bookmarked ? 'Quitar marcador' : 'Marcar página'}
      >
        <Bookmark className={`size-5 ${bookmarked ? 'fill-acento text-acento' : ''}`} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        className={`${iconButton} ${notesOpen ? 'bg-papel' : ''}`}
        onClick={onToggleNotes}
        aria-pressed={notesOpen}
        aria-label="Notas"
      >
        <NotebookPen className="size-5" strokeWidth={1.8} />
      </button>
      <ThemeToggle />
    </header>
  );
}
