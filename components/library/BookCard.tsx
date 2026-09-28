'use client';

import { forwardRef, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { NotebookText, Star, Trash2, X } from 'lucide-react';
import type { Book } from '@/lib/db';
import GeneratedCover, { paletteClass } from './GeneratedCover';
import { useLightCover } from './useCoverTone';

export const readerHref = (id: string) => `/lector/?id=${encodeURIComponent(id)}`;
export const notebookHref = (id: string) => `/cuaderno/?id=${encodeURIComponent(id)}`;

/** Grosor del lomo en px según el número de páginas (con mínimo y máximo). */
export const spineWidth = (pages: number) => Math.round(Math.min(26, Math.max(6, 5 + pages * 0.075)));

/** Espacio sobre el libro para que pueda "despegarse" de la repisa. */
export const LIFT_ROOM = 18;

const LONG_PRESS_MS = 320;
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface BookCardProps {
  book: Book;
  index?: number;
  /** Tamaño de la portada en px (lo calcula la estantería). */
  bookWidth: number;
  bookHeight: number;
  /** Altura de la repisa bajo el libro y del pie con título/autor. */
  plankHeight: number;
  captionHeight: number;
  /** Recién agregado: entra "cayendo" a la repisa. */
  isNew?: boolean;
  onDelete?: (book: Book) => Promise<void>;
}

const BookCard = forwardRef<HTMLLIElement, BookCardProps>(function BookCard(
  { book, index = 0, bookWidth, bookHeight, plankHeight, captionHeight, isNew = false, onDelete },
  ref,
) {
  const reduce = useReducedMotion() ?? false;
  const percent = Math.round(book.progress * 100);
  const finished = book.progress >= 1;
  const started = percent > 0 && !finished;
  const spine = spineWidth(book.pageCount);
  const lightCover = useLightCover(book.id, book.cover);

  const [tilted, setTilted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout>>();
  const longPressed = useRef(false);

  useEffect(() => () => clearTimeout(pressTimer.current), []);

  // Táctil: mantener pulsado inclina el libro; soltar lo devuelve (y no navega).
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setTilted(true);
    }, LONG_PRESS_MS);
  };
  const endPress = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    clearTimeout(pressTimer.current);
    if (longPressed.current) setTimeout(() => setTilted(false), 900);
  };
  const onClick = (e: MouseEvent) => {
    if (longPressed.current) {
      e.preventDefault();
      longPressed.current = false;
    }
  };

  async function remove() {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(book);
    } catch (err) {
      console.error(err);
      setDeleting(false);
      setConfirming(false);
    }
  }

  const lift = tilted && !reduce;
  const status = finished ? 'terminado' : started ? `${percent}% leído` : 'sin empezar';
  // La cinta asoma por el pie del libro (fuera de la portada): su largo sigue el avance.
  const ribbonLength = Math.round(8 + book.progress * 26);

  return (
    <motion.li
      ref={ref}
      layout={!reduce}
      initial={
        reduce ? false : isNew ? { opacity: 0, y: -90, rotate: -8, scale: 1.05 } : { opacity: 0, y: 14 }
      }
      animate={{ opacity: deleting ? 0.4 : 1, y: 0, rotate: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -24, scale: 0.9, transition: { duration: 0.25 } }}
      transition={
        isNew
          ? { type: 'spring', stiffness: 260, damping: 18, mass: 0.9 }
          : { delay: Math.min(index * 0.035, 0.35), duration: 0.45, ease: EASE, layout: { duration: 0.45, ease: EASE } }
      }
      className="group relative list-none"
      style={{ height: LIFT_ROOM + bookHeight + plankHeight + captionHeight }}
    >
      <div className="relative mx-auto" style={{ width: bookWidth, height: LIFT_ROOM + bookHeight }}>
        {/* Sombra de contacto sobre la repisa */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -bottom-1 left-[6%] right-[6%] h-3 rounded-[50%] bg-sombra/40 blur-[6px]"
          animate={{ opacity: lift ? 0.35 : 1, scaleX: lift ? 0.8 : 1 }}
          transition={{ duration: reduce ? 0 : 0.35 }}
        />

        <Link
          href={readerHref(book.id)}
          aria-label={`${book.title}${book.author ? `, de ${book.author}` : ''} — ${status}`}
          title={book.title}
          onClick={onClick}
          onPointerDown={onPointerDown}
          onPointerUp={endPress}
          onPointerCancel={endPress}
          onPointerLeave={endPress}
          onContextMenu={(e) => longPressed.current && e.preventDefault()}
          onFocus={() => setTilted(true)}
          onBlur={() => setTilted(false)}
          onMouseEnter={() => setTilted(true)}
          onMouseLeave={() => setTilted(false)}
          className="absolute bottom-0 left-0 block select-none rounded-[4px] [-webkit-touch-callout:none] [perspective:900px] focus-visible:ring-offset-4"
          style={{ width: bookWidth, height: bookHeight }}
        >
          <motion.div
            className={`relative size-full [transform-style:preserve-3d] ${book.cover ? '' : `portada-generada ${paletteClass(book.title)}`}`}
            style={{ transformOrigin: '50% 100%' }}
            animate={lift ? { rotateY: 26, y: -12, z: 14 } : { rotateY: 0, y: 0, z: 0 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 20 }}
          >
            {/* Lomo (cara izquierda) */}
            <div
              aria-hidden
              className="libro-lomo absolute top-0 h-full rounded-l-[3px]"
              style={{ width: spine, left: -spine, transformOrigin: 'right center', transform: 'rotateY(-90deg)' }}
            />
            {/* Canto de las páginas (cara derecha) */}
            <div
              aria-hidden
              className="libro-canto absolute"
              style={{
                top: 3,
                bottom: 3,
                width: spine - 2,
                left: '100%',
                transformOrigin: 'left center',
                transform: 'rotateY(90deg)',
              }}
            />
            {/* Portada */}
            <div
              className={`absolute inset-0 overflow-hidden rounded-l-[3px] rounded-r-[6px] bg-papel shadow-libro ${
                lightCover ? 'portada-clara' : ''
              }`}
            >
              {book.cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL local
                <img src={book.cover} alt="" className="size-full object-cover" draggable={false} />
              ) : (
                <GeneratedCover title={book.title} author={book.author} width={bookWidth} />
              )}
              <span aria-hidden className="libro-brillo pointer-events-none absolute inset-0" />
            </div>

            {/* Cinta marcapáginas: cuelga del pie del libro, nunca sobre la portada */}
            {started && (
              <span
                aria-hidden
                className="cinta absolute right-[16%] top-full w-[11px] bg-acento shadow-suave [transform:translateZ(1px)]"
                style={{ height: ribbonLength }}
              />
            )}

            {/* Terminado: sello pequeño en la esquina */}
            {finished && (
              <span
                aria-hidden
                title="Terminado"
                className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-fondo shadow-flotante ring-1 ring-acento/40 [transform:translateZ(2px)]"
              >
                <Star className="size-4 fill-acento text-acento" strokeWidth={1.5} />
              </span>
            )}
          </motion.div>
        </Link>

        {onDelete && (
          // Fuera del <Link> para no anidar elementos interactivos.
          <div
            className="acciones-tarjeta absolute -right-3 flex flex-col items-end gap-1.5"
            style={{ top: LIFT_ROOM - 10 }}
            data-abierto={confirming || undefined}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {confirming ? (
                <motion.div
                  key="confirmar"
                  initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="barra flex items-center gap-1 rounded-suave p-1"
                >
                  <button
                    type="button"
                    onClick={() => void remove()}
                    disabled={deleting}
                    aria-label={`Confirmar eliminar ${book.title}`}
                    className="rounded-[12px] bg-acento px-3 py-1.5 text-xs font-semibold text-tinta disabled:opacity-60 dark:text-fondo"
                  >
                    Eliminar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={deleting}
                    aria-label="Cancelar"
                    className="grid size-7 place-items-center rounded-[12px] hover:bg-papel/70"
                  >
                    <X className="size-4" />
                  </button>
                </motion.div>
              ) : (
                <motion.button
                  key="papelera"
                  type="button"
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setConfirming(true)}
                  aria-label={`Eliminar ${book.title}`}
                  title="Eliminar de la biblioteca"
                  className="barra grid size-9 place-items-center rounded-suave"
                >
                  <Trash2 className="size-4" strokeWidth={1.8} />
                </motion.button>
              )}
            </AnimatePresence>
            {!confirming && (
              <Link
                href={notebookHref(book.id)}
                aria-label={`Cuaderno de ${book.title}`}
                title="Cuaderno: subrayados, apuntes y marcadores"
                className="barra grid size-9 place-items-center rounded-suave"
              >
                <NotebookText className="size-4" strokeWidth={1.8} />
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Hueco de la repisa (la dibuja Shelf) */}
      <div style={{ height: plankHeight }} aria-hidden />

      <div className="px-1 pt-3 text-center" style={{ height: captionHeight }}>
        <h3 className="line-clamp-2 font-display text-[15px] font-medium leading-snug">{book.title}</h3>
        <p className="mt-0.5 flex items-center justify-center gap-1.5 truncate text-xs text-tinta-suave/60">
          {book.author && <span className="truncate">{book.author}</span>}
          {started && (
            <span className="shrink-0 font-semibold tabular-nums text-acento">
              {book.author && <span className="font-normal text-tinta-suave/40">· </span>}
              {percent}%
            </span>
          )}
          {finished && (
            <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-tinta-suave/80">
              {book.author && <span className="font-normal text-tinta-suave/40">· </span>}
              <Star className="size-3 fill-acento text-acento" strokeWidth={1.5} aria-hidden />
              Terminado
            </span>
          )}
        </p>
      </div>
    </motion.li>
  );
});

export default BookCard;
