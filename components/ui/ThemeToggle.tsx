'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Coffee, Moon, Sun, type LucideIcon } from 'lucide-react';
import { THEME_LABELS, type Theme } from '@/lib/constants';
import { getCurrentTheme, nextTheme, setTheme } from '@/lib/theme';

const ICONS: Record<Theme, LucideIcon> = { dia: Sun, sepia: Coffee, noche: Moon };

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setThemeState] = useState<Theme | null>(null);

  useEffect(() => {
    setThemeState(getCurrentTheme());
    const onChange = (e: Event) => setThemeState((e as CustomEvent<Theme>).detail);
    window.addEventListener('vuelo:tema', onChange);
    return () => window.removeEventListener('vuelo:tema', onChange);
  }, []);

  const upcoming = theme ? nextTheme(theme) : null;
  const Icon = theme ? ICONS[theme] : null;

  return (
    <button
      type="button"
      onClick={() => upcoming && setTheme(upcoming)}
      aria-label={upcoming ? `Cambiar a tema ${THEME_LABELS[upcoming]}` : 'Cambiar tema'}
      title={theme ? `Tema: ${THEME_LABELS[theme]}` : undefined}
      className={`relative grid size-11 place-items-center overflow-hidden rounded-suave text-tinta transition-colors hover:bg-papel/70 ${className}`}
    >
      {/* Hasta leer el tema real no se pinta icono: evita una animación de salida falsa. */}
      <AnimatePresence mode="popLayout" initial={false}>
        {Icon && (
          <motion.span
            key={theme}
            initial={{ y: 18, rotate: -60, opacity: 0 }}
            animate={{ y: 0, rotate: 0, opacity: 1 }}
            exit={{ y: -18, rotate: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className="grid place-items-center"
          >
            <Icon className="size-5" strokeWidth={1.8} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
