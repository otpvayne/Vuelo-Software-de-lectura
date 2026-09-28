'use client';

import Link from 'next/link';
import { Star } from 'lucide-react';
import { formatDuration, streakLabel } from '@/lib/goals';
import { useReadingStats } from './useReadingStats';

/**
 * Resumen discreto junto al encabezado: "Hoy 12 min · Racha 4 días".
 * La estrella se ilumina al cumplir la meta del día. Oculto si las metas están desactivadas.
 */
export default function ReadingSummaryChip() {
  const { stats } = useReadingStats();
  if (!stats || !stats.goal.enabled) return null;
  const { summary, streak, goalMet } = stats;
  const today = formatDuration(summary.todaySeconds);

  return (
    <Link
      href="/lectura/"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-linea/10 bg-papel/50 px-3 py-1.5 text-xs text-tinta-suave/80 transition-colors hover:bg-papel"
      aria-label={`Tu lectura: hoy ${today}${streak.current ? `, racha de ${streakLabel(streak.current)}` : ''}${
        goalMet ? '. Meta del día cumplida' : ''
      }`}
      title={goalMet ? 'Meta del día cumplida' : `Meta: ${stats.goal.minutes} min al día`}
    >
      <Star
        className={`size-3.5 transition-colors ${goalMet ? 'fill-acento text-acento drop-shadow-[0_0_6px_rgb(var(--acento)/0.7)]' : 'text-tinta-suave/45'}`}
        strokeWidth={1.8}
        aria-hidden
      />
      <span className="tabular-nums">
        <span className="hidden sm:inline">Hoy </span>
        {today}
      </span>
      {streak.current > 0 && (
        <>
          <span aria-hidden className="text-tinta-suave/35">
            ·
          </span>
          <span className="tabular-nums">
            <span className="hidden sm:inline">Racha </span>
            {streakLabel(streak.current)}
          </span>
        </>
      )}
    </Link>
  );
}
