'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import WingedBook from '@/components/ui/WingedBook';
import { alBibliotecaLista, bibliotecaLista } from '@/lib/arranque';
import { APP_NAME, TAGLINE } from '@/lib/constants';

/** Lo que dura la animación completa antes de poder retirarse. */
const MIN_MS = 1300;
/** Con movimiento reducido: marca estática el tiempo justo para reconocerla. */
const MIN_REDUCED_MS = 400;
/** Tope de espera a la biblioteca: pasado esto se retira igual (nunca bloquea la app). */
const MAX_MS = 4500;

/**
 * Bienvenida de la primera carga: el libro alado abre páginas y alas y aparece el nombre.
 * Vive en el layout raíz, así que se muestra una sola vez por apertura (no al navegar entre pantallas).
 * Se pinta ya en el HTML estático para que nunca se vea la biblioteca a medio cargar detrás.
 */
export default function Bienvenida() {
  const reduce = useReducedMotion() ?? false;
  const enBiblioteca = usePathname() === '/';
  const [visible, setVisible] = useState(true);
  const [minCumplido, setMinCumplido] = useState(false);
  const [lista, setLista] = useState(bibliotecaLista);

  useEffect(() => alBibliotecaLista(() => setLista(true)), []);
  useEffect(() => setLista(bibliotecaLista()), []);

  useEffect(() => {
    const min = setTimeout(() => setMinCumplido(true), reduce ? MIN_REDUCED_MS : MIN_MS);
    const max = setTimeout(() => setVisible(false), MAX_MS);
    return () => {
      clearTimeout(min);
      clearTimeout(max);
    };
  }, [reduce]);

  // Fuera de la biblioteca (p. ej. el lector abierto directamente) no hay nada que esperar.
  const puedeRetirarse = minCumplido && (lista || !enBiblioteca);
  useEffect(() => {
    if (puedeRetirarse) setVisible(false);
  }, [puedeRetirarse]);

  // Un toque o tecla la salta: la animación nunca estorba.
  useEffect(() => {
    if (!visible) return;
    const skip = () => setVisible(false);
    window.addEventListener('pointerdown', skip, { once: true });
    window.addEventListener('keydown', skip, { once: true });
    return () => {
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="bienvenida"
          role="status"
          aria-label={`${APP_NAME}: ${TAGLINE}`}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.3, ease: 'easeOut' }}
          className="bienvenida fixed inset-x-0 bottom-0 top-[var(--titlebar-h)] z-[60] flex flex-col items-center justify-center bg-fondo"
        >
          <WingedBook
            className="bienvenida-libro w-40 text-papel drop-shadow-[0_10px_18px_rgb(var(--sombra)/0.25)] sm:w-52"
            accentClassName="text-acento"
            outlineClassName="text-tinta/35"
          />
          <p className="bienvenida-nombre mt-6 font-display text-5xl font-semibold leading-none sm:text-6xl">{APP_NAME}</p>
          <p className="bienvenida-lema mt-3 text-sm text-tinta-suave/60">{TAGLINE}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
