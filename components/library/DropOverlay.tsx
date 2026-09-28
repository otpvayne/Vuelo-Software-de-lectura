'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import WingedBook from '@/components/ui/WingedBook';

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/**
 * Soltar PDF sobre la ventana. Usa eventos HTML5, que funcionan igual en el navegador y en
 * Tauri (con `dragDropEnabled: false` en la ventana, WebView2/WebKit entregan los File).
 * Así se leen los bytes directamente, sin ampliar los permisos de fs a rutas del usuario.
 */
export default function DropOverlay({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [active, setActive] = useState(false);
  const depth = useRef(0);
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;
  const reduce = useReducedMotion() ?? false;

  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setActive(true);
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setActive(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) onFilesRef.current(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="soltar"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          className="pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-fondo/75 p-6 backdrop-blur-md"
          role="status"
          aria-live="polite"
        >
          <motion.div
            initial={reduce ? false : { scale: 0.92, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={reduce ? undefined : { scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="flex w-full max-w-lg flex-col items-center rounded-panel border-2 border-dashed border-acento/70 bg-papel/80 px-8 py-12 text-center shadow-flotante"
          >
            <motion.div
              animate={reduce ? undefined : { y: [0, -10, 0], rotate: [-3, 3, -3] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <WingedBook
                className="w-32 text-papel drop-shadow-lg"
                accentClassName="text-acento"
                outlineClassName="text-tinta/35"
              />
            </motion.div>
            <p className="mt-6 font-display text-3xl font-semibold">Suelta tu libro aquí</p>
            <p className="mt-2 text-sm text-tinta-suave/70">Puedes soltar varios PDF a la vez.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
