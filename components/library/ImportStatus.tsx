'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, CopyCheck, Loader2, Sparkles, X } from 'lucide-react';
import type { ImportNotice, ImportProgress } from './useBookImport';

const ICONS = { duplicado: CopyCheck, error: AlertCircle, listo: Sparkles } as const;
const NOTICE_MS = 6000;

function Notice({ notice, onDismiss }: { notice: ImportNotice; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(notice.id), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice.id, onDismiss]);
  const Icon = ICONS[notice.kind];
  return (
    <div className="flex items-center gap-2.5 py-1 text-sm" role={notice.kind === 'error' ? 'alert' : 'status'}>
      <Icon className="size-4 shrink-0 text-acento" strokeWidth={2} aria-hidden />
      <span className="min-w-0 flex-1">{notice.text}</span>
      <button
        type="button"
        onClick={() => onDismiss(notice.id)}
        className="grid size-7 shrink-0 place-items-center rounded-[10px] hover:bg-papel/70"
        aria-label="Cerrar aviso"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

interface ImportStatusProps {
  progress: ImportProgress | null;
  notices: ImportNotice[];
  onDismiss: (id: string) => void;
}

/** Píldora flotante: "Agregando 2 de 3…" y avisos (duplicados, errores). */
export default function ImportStatus({ progress, notices, onDismiss }: ImportStatusProps) {
  const reduce = useReducedMotion() ?? false;
  const visible = progress !== null || notices.length > 0;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4" aria-live="polite">
      <AnimatePresence>
        {visible && (
          <motion.div
            key="estado"
            layout={!reduce}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="barra pointer-events-auto w-full max-w-md rounded-tarjeta px-4 py-3"
          >
            {progress && (
              <div role="status">
                <div className="flex items-center gap-2.5 text-sm font-medium">
                  <Loader2 className="size-4 text-acento motion-safe:animate-spin" aria-hidden />
                  <span>
                    Agregando {progress.current} de {progress.total}…
                  </span>
                </div>
                <p className="mt-0.5 truncate pl-[26px] text-xs text-tinta-suave/60">{progress.fileName}</p>
                <span className="mt-2 block h-1 overflow-hidden rounded-full bg-linea/10">
                  <motion.span
                    className="block h-full rounded-full bg-acento"
                    initial={false}
                    animate={{ width: `${((progress.current - 0.5) / progress.total) * 100}%` }}
                    transition={{ duration: reduce ? 0 : 0.4 }}
                  />
                </span>
              </div>
            )}
            {notices.length > 0 && (
              <div className={progress ? 'mt-2 border-t border-linea/10 pt-2' : ''}>
                {notices.map((n) => (
                  <Notice key={n.id} notice={n} onDismiss={onDismiss} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
