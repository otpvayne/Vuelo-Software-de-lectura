'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArchiveRestore, BarChart3, HardDriveDownload, MoreHorizontal } from 'lucide-react';

export type BackupTab = 'exportar' | 'restaurar';

/** Menú discreto de la biblioteca: respaldo, restauración y "Tu lectura". */
export default function LibraryMenu({ onBackup }: { onBackup(tab: BackupTab): void }) {
  const reduce = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = 'flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left text-sm hover:bg-papel/70';
  const choose = (tab: BackupTab) => {
    setOpen(false);
    onBackup(tab);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Más opciones"
        title="Respaldo y más"
        className={`grid size-11 place-items-center rounded-suave text-tinta-suave/80 transition-colors hover:bg-papel/70 ${open ? 'bg-papel' : ''}`}
      >
        <MoreHorizontal className="size-5" strokeWidth={1.8} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: reduce ? 0 : 0.15 }}
            className="barra absolute right-0 top-full z-40 mt-2 w-60 rounded-tarjeta bg-fondo/95 p-1.5"
          >
            <button type="button" role="menuitem" className={item} onClick={() => choose('exportar')}>
              <HardDriveDownload className="size-4 text-acento" aria-hidden /> Crear respaldo…
            </button>
            <button type="button" role="menuitem" className={item} onClick={() => choose('restaurar')}>
              <ArchiveRestore className="size-4 text-acento" aria-hidden /> Restaurar respaldo…
            </button>
            <Link href="/lectura/" role="menuitem" className={item} onClick={() => setOpen(false)}>
              <BarChart3 className="size-4 text-acento" aria-hidden /> Tu lectura
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
