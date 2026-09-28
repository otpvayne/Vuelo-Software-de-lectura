'use client';

import { useCallback, useEffect, useState } from 'react';
import { getStore, type Book, type DayTotal } from '@/lib/db';
import { dayKey } from '@/lib/days';
import { computeStreak, getGoalPrefs, summarize, type GoalPrefs, type ReadingSummary, type Streak } from '@/lib/goals';
import { now } from '@/lib/readingSessions';

export interface ReadingStats {
  today: string;
  summary: ReadingSummary;
  streak: Streak;
  goal: GoalPrefs;
  goalMet: boolean;
  finished: Book[];
  totals: DayTotal[];
}

/**
 * Estadísticas de lectura desde consultas agregadas (una fila por día, no por sesión).
 * Se recalculan al volver a la ventana y al cambiar las metas.
 */
export function useReadingStats(): { stats: ReadingStats | null; reload: () => void } {
  const [stats, setStats] = useState<ReadingStats | null>(null);

  const reload = useCallback(() => {
    void (async () => {
      const store = await getStore();
      const [totals, finished] = await Promise.all([store.dailyTotals(), store.listFinishedBooks()]);
      const today = dayKey(now());
      const summary = summarize(totals, today);
      const goal = getGoalPrefs();
      setStats({
        today,
        summary,
        streak: computeStreak(totals, today),
        goal,
        goalMet: summary.todaySeconds >= goal.minutes * 60,
        finished,
        totals,
      });
    })().catch((err: unknown) => console.error('Estadísticas:', err));
  }, []);

  useEffect(() => {
    reload();
    const onVisible = () => document.visibilityState === 'visible' && reload();
    window.addEventListener('focus', reload);
    window.addEventListener('vuelo:metas', reload);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', reload);
      window.removeEventListener('vuelo:metas', reload);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  return { stats, reload };
}
