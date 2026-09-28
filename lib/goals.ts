import type { DayTotal } from './db';
import { addDays, lastDays } from './days';

const KEYS = {
  enabled: 'vuelo:metas-activas',
  minutes: 'vuelo:meta-minutos',
  celebrated: 'vuelo:festejados',
} as const;

export const DEFAULT_GOAL_MINUTES = 10;
export const GOAL_MIN = 5;
export const GOAL_MAX = 120;

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // Sin almacenamiento: dura la sesión.
  }
};

export interface GoalPrefs {
  enabled: boolean;
  minutes: number;
}

/** Metas en localStorage (no en la base): son una preferencia de este dispositivo. */
export function getGoalPrefs(): GoalPrefs {
  const m = Number(read(KEYS.minutes));
  return {
    enabled: read(KEYS.enabled) !== '0',
    minutes: Number.isFinite(m) && m >= GOAL_MIN && m <= GOAL_MAX ? m : DEFAULT_GOAL_MINUTES,
  };
}

export function setGoalPrefs(p: GoalPrefs) {
  write(KEYS.enabled, p.enabled ? '1' : '0');
  write(KEYS.minutes, String(Math.min(GOAL_MAX, Math.max(GOAL_MIN, Math.round(p.minutes)))));
  window.dispatchEvent(new CustomEvent('vuelo:metas'));
}

/** El festejo de "terminaste" sale una sola vez por libro. */
export function wasCelebrated(bookId: string): boolean {
  try {
    return (JSON.parse(read(KEYS.celebrated) ?? '[]') as string[]).includes(bookId);
  } catch {
    return false;
  }
}
export function markCelebrated(bookId: string) {
  let list: string[] = [];
  try {
    list = JSON.parse(read(KEYS.celebrated) ?? '[]') as string[];
  } catch {
    list = [];
  }
  if (!list.includes(bookId)) write(KEYS.celebrated, JSON.stringify([...list, bookId]));
}

export interface Streak {
  current: number;
  best: number;
  readToday: boolean;
  /** Había leído antes pero la racha se cortó (tono amable, nunca culpa). */
  broken: boolean;
}

/**
 * Racha: días consecutivos con al menos una sesión válida (no exige cumplir la meta).
 * Si hoy aún no se leyó, la racha de ayer sigue viva hasta que termine el día.
 */
export function computeStreak(totals: DayTotal[], today: string): Streak {
  const days = new Set(totals.filter((t) => t.seconds > 0).map((t) => t.day));
  const readToday = days.has(today);
  let current = 0;
  let cursor = readToday ? today : addDays(today, -1);
  while (days.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of [...days].sort()) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return { current, best, readToday, broken: current === 0 && days.size > 0 };
}

export interface ReadingSummary {
  todaySeconds: number;
  weekSeconds: number;
  totalSeconds: number;
  last7: DayTotal[];
}

export function summarize(totals: DayTotal[], today: string): ReadingSummary {
  const byDay = new Map(totals.map((t) => [t.day, t.seconds]));
  const last7 = lastDays(today, 7).map((day) => ({ day, seconds: byDay.get(day) ?? 0 }));
  return {
    todaySeconds: byDay.get(today) ?? 0,
    weekSeconds: last7.reduce((n, d) => n + d.seconds, 0),
    totalSeconds: totals.reduce((n, d) => n + d.seconds, 0),
    last7,
  };
}

export function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60);
  if (min < 1) return seconds > 0 ? '<1 min' : '0 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const streakLabel = (n: number) => (n === 1 ? '1 día' : `${n} días`);
