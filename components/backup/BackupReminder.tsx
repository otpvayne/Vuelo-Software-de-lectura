'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { HardDriveDownload } from 'lucide-react';
import type { Book } from '@/lib/db';
import { disableBackupReminder, markBackupReminderShown, shouldRemindBackup } from '@/lib/backup/reminder';

/** Nota discreta, sin culpa: como mucho una vez por semana. */
export default function BackupReminder({ books, onBackup }: { books: Book[]; onBackup(): void }) {
  const reduce = useReducedMotion() ?? false;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (shouldRemindBackup(books)) {
      setShow(true);
      markBackupReminderShown();
    }
    // Solo al cargar la biblioteca, no en cada cambio de libros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books.length > 0]);

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.aside
          key="aviso-respaldo"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: reduce ? 0 : 0.25 }}
          className="flex flex-col gap-3 rounded-tarjeta border border-linea/10 bg-papel/50 px-4 py-3 text-sm sm:flex-row sm:items-center"
          aria-label="Sugerencia de respaldo"
        >
          <HardDriveDownload className="hidden size-5 shrink-0 text-acento sm:block" aria-hidden />
          <p className="flex-1 text-tinta-suave/85">Tu biblioteca vive solo en este equipo. ¿Hacemos un respaldo?</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setShow(false);
                onBackup();
              }}
              className="rounded-suave bg-acento px-3 py-1.5 font-semibold text-tinta dark:text-fondo"
            >
              Hacer respaldo
            </button>
            <button type="button" onClick={() => setShow(false)} className="rounded-suave px-3 py-1.5 text-tinta-suave/75 hover:bg-papel">
              Ahora no
            </button>
            <button
              type="button"
              onClick={() => {
                disableBackupReminder();
                setShow(false);
              }}
              className="rounded-suave px-3 py-1.5 text-xs text-tinta-suave/60 hover:bg-papel"
            >
              No volver a mostrar
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
