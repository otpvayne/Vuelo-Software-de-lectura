'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Contrast,
  Focus,
  Highlighter,
  Keyboard,
  NotebookText,
  Minus,
  MoreHorizontal,
  NotebookPen,
  Plus,
  Square,
  SunDim,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { PAPER_LABELS, type PaperMode } from '@/lib/readerPrefs';

interface ToolbarProps {
  title: string;
  page: number;
  /** Última página visible (en doble página, la derecha). */
  lastVisible: number;
  pageCount: number;
  bookmarked: boolean;
  notesOpen: boolean;
  /** Herramienta Subrayar activa. */
  highlighting: boolean;
  zoom: number;
  paper: PaperMode;
  paperModes: PaperMode[];
  sound: boolean;
  /** En modo enfoque la barra se oculta. */
  hidden: boolean;
  /** Se incrementa para abrir el campo "Ir a página" (tecla G). */
  goToRequest: number;
  onPrev(): void;
  onNext(): void;
  onGoTo(page: number): void;
  onToggleBookmark(): void;
  onToggleNotes(): void;
  onToggleHighlight(): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onZoomReset(): void;
  onPaper(mode: PaperMode): void;
  onToggleSound(): void;
  onToggleFocus(): void;
  onHelp(): void;
  /** Enlace al Cuaderno del libro. */
  notebookHref: string;
}

const iconButton =
  'grid size-10 shrink-0 place-items-center rounded-suave text-tinta transition-colors hover:bg-papel/70 disabled:opacity-40 sm:size-11';

const PAPER_ICONS: Record<PaperMode, LucideIcon> = { natural: Square, suave: SunDim, invertido: Contrast };
const PAPER_HINTS: Record<PaperMode, string> = {
  natural: 'Natural: la página tal cual',
  suave: 'Suave: tinte cálido y menos brillo',
  invertido: 'Invertido: fondo oscuro y texto claro. Ojo: las ilustraciones también se invierten.',
};

function PageIndicator({
  page,
  lastVisible,
  pageCount,
  request,
  onGoTo,
}: Pick<ToolbarProps, 'page' | 'lastVisible' | 'pageCount' | 'onGoTo'> & { request: number }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (request > 0) setEditing(true);
  }, [request]);
  useEffect(() => {
    if (editing) {
      setValue(String(page));
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, page]);

  const label = lastVisible > page ? `${page}–${lastVisible}` : `${page}`;

  if (editing) {
    return (
      <form
        className="flex items-center gap-1.5 rounded-suave bg-papel/70 px-2 py-1 text-sm focus-within:ring-2 focus-within:ring-acento"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number.parseInt(value, 10);
          if (Number.isFinite(n)) onGoTo(Math.min(pageCount, Math.max(1, n)));
          setEditing(false);
        }}
      >
        <label htmlFor="ir-a-pagina" className="sr-only">
          Ir a la página
        </label>
        <input
          ref={inputRef}
          id="ir-a-pagina"
          type="number"
          inputMode="numeric"
          min={1}
          max={pageCount}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setEditing(false);
            }
          }}
          className="w-14 bg-transparent text-center tabular-nums outline-none focus-visible:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="whitespace-nowrap text-tinta-suave/60">de {pageCount}</span>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Ir a página (G)"
      className="whitespace-nowrap rounded-suave px-2.5 py-2 text-sm tabular-nums text-tinta-suave/75 transition-colors hover:bg-papel/70 hover:text-tinta"
    >
      <span className="hidden sm:inline">Página </span>
      {label}
      <span className="text-tinta-suave/50"> de {pageCount}</span>
    </button>
  );
}

function Tools(props: ToolbarProps & { compact?: boolean }) {
  const { zoom, paper, paperModes, sound } = props;
  const pct = Math.round(zoom * 100);
  return (
    <>
      <div className="flex items-center rounded-suave" role="group" aria-label="Zoom">
        <button type="button" className={iconButton} onClick={props.onZoomOut} disabled={zoom <= 1} aria-label="Alejar (−)">
          <Minus className="size-4" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={props.onZoomReset}
          title="Restablecer zoom (0) · también doble clic en la página"
          className="min-w-[3.25rem] rounded-suave px-1 py-2 text-center text-xs font-semibold tabular-nums text-tinta-suave/80 hover:bg-papel/70"
          aria-label={`Zoom ${pct} %. Restablecer`}
        >
          {pct}%
        </button>
        <button type="button" className={iconButton} onClick={props.onZoomIn} disabled={zoom >= 4} aria-label="Ampliar (+)">
          <Plus className="size-4" strokeWidth={2} />
        </button>
      </div>

      <div role="radiogroup" aria-label="Papel" className="flex items-center rounded-suave bg-papel/50 p-0.5">
        {paperModes.map((m) => {
          const Icon = PAPER_ICONS[m];
          const active = paper === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`Papel ${PAPER_LABELS[m]}`}
              title={PAPER_HINTS[m]}
              onClick={() => props.onPaper(m)}
              className={`flex h-9 items-center gap-1.5 rounded-[12px] px-2.5 text-xs font-medium transition-colors ${
                active ? 'bg-acento text-tinta shadow-suave dark:text-fondo' : 'text-tinta-suave/70 hover:text-tinta'
              }`}
            >
              <Icon className="size-4" strokeWidth={1.9} />
              {props.compact && PAPER_LABELS[m]}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={iconButton}
        onClick={props.onToggleSound}
        aria-pressed={sound}
        aria-label={sound ? 'Silenciar sonido de página' : 'Activar sonido de página'}
        title={sound ? 'Sonido de página: activado' : 'Sonido de página: silenciado'}
      >
        {sound ? <Volume2 className="size-5" strokeWidth={1.8} /> : <VolumeX className="size-5" strokeWidth={1.8} />}
      </button>
      <Link href={props.notebookHref} className={iconButton} aria-label="Cuaderno del libro" title="Cuaderno del libro">
        <NotebookText className="size-5" strokeWidth={1.8} />
      </Link>
      <button type="button" className={iconButton} onClick={props.onToggleFocus} aria-label="Modo enfoque (F)" title="Modo enfoque (F)">
        <Focus className="size-5" strokeWidth={1.8} />
      </button>
      <button type="button" className={iconButton} onClick={props.onHelp} aria-label="Atajos de teclado (?)" title="Atajos de teclado (?)">
        <Keyboard className="size-5" strokeWidth={1.8} />
      </button>
      <ThemeToggle />
    </>
  );
}

function MoreMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative xl:hidden">
      <button
        type="button"
        className={`${iconButton} ${open ? 'bg-papel' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Más opciones de lectura"
      >
        <MoreHorizontal className="size-5" strokeWidth={1.8} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: reduce ? 0 : 0.16 }}
            className="barra absolute right-0 top-full z-40 mt-2 flex w-max max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-2 rounded-tarjeta bg-fondo/95 p-2"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Toolbar(props: ToolbarProps) {
  const reduce = useReducedMotion() ?? false;
  const { title, page, lastVisible, pageCount, bookmarked, notesOpen, hidden } = props;

  return (
    <motion.header
      initial={false}
      animate={hidden ? (reduce ? { opacity: 0 } : { opacity: 0, y: -24 }) : { opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={`barra fixed inset-x-2 top-2 z-30 flex items-center gap-0.5 rounded-panel px-1.5 py-1 sm:inset-x-6 sm:top-3 sm:gap-1 sm:px-2 sm:py-1.5 ${
        hidden ? 'pointer-events-none' : ''
      }`}
      aria-hidden={hidden || undefined}
    >
      <Link href="/" className={iconButton} aria-label="Volver a la biblioteca" tabIndex={hidden ? -1 : undefined}>
        <ArrowLeft className="size-5" strokeWidth={1.8} />
      </Link>

      <h1 className="mx-1 min-w-0 flex-1 truncate font-display text-base font-medium sm:mx-2 sm:text-lg">{title}</h1>

      <div className="hidden items-center md:flex">
        <button type="button" className={iconButton} onClick={props.onPrev} disabled={page <= 1} aria-label="Página anterior">
          <ChevronLeft className="size-5" strokeWidth={1.8} />
        </button>
      </div>
      <PageIndicator
        page={page}
        lastVisible={lastVisible}
        pageCount={pageCount}
        request={props.goToRequest}
        onGoTo={props.onGoTo}
      />
      <div className="hidden items-center md:flex">
        <button
          type="button"
          className={iconButton}
          onClick={props.onNext}
          disabled={lastVisible >= pageCount}
          aria-label="Página siguiente"
        >
          <ChevronRight className="size-5" strokeWidth={1.8} />
        </button>
      </div>

      <button
        type="button"
        className={iconButton}
        onClick={props.onToggleBookmark}
        aria-pressed={bookmarked}
        aria-label={bookmarked ? 'Quitar marcador' : 'Marcar página'}
      >
        <Bookmark className={`size-5 ${bookmarked ? 'fill-acento text-acento' : ''}`} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        className={`${iconButton} ${notesOpen ? 'bg-papel' : ''}`}
        onClick={props.onToggleNotes}
        aria-pressed={notesOpen}
        aria-label="Notas"
      >
        <NotebookPen className="size-5" strokeWidth={1.8} />
      </button>
      <button
        type="button"
        className={`${iconButton} ${props.highlighting ? 'bg-acento text-tinta shadow-suave hover:bg-acento dark:text-fondo' : ''}`}
        onClick={props.onToggleHighlight}
        aria-pressed={props.highlighting}
        aria-label="Subrayar (H)"
        title="Subrayar (H)"
      >
        <Highlighter className="size-5" strokeWidth={1.8} />
      </button>

      <span aria-hidden className="mx-1 hidden h-6 w-px bg-linea/15 xl:block" />
      <div className="hidden items-center gap-1 xl:flex">
        <Tools {...props} />
      </div>
      <MoreMenu>
        <Tools {...props} compact />
      </MoreMenu>
    </motion.header>
  );
}
