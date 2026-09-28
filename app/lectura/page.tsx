'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, BookCheck, Flame, Minus, Plus, Star, Trophy } from 'lucide-react';
import WeekBars from '@/components/stats/WeekBars';
import { useReadingStats } from '@/components/stats/useReadingStats';
import ThemeToggle from '@/components/ui/ThemeToggle';
import WingedBook from '@/components/ui/WingedBook';
import { readerHref } from '@/components/library/BookCard';
import { GOAL_MAX, GOAL_MIN, formatDuration, setGoalPrefs, streakLabel } from '@/lib/goals';

const PRESETS = [5, 10, 15, 20, 30];

export default function ReadingPage() {
  const { stats } = useReadingStats();
  const reduce = useReducedMotion() ?? false;

  return (
    <div className="min-h-dvh">
      <header className="barra sticky top-3 z-30 mx-3 mt-3 flex items-center gap-2 rounded-panel px-2 py-1.5 sm:mx-6">
        <Link href="/" className="grid size-11 place-items-center rounded-suave hover:bg-papel/70" aria-label="Volver a la biblioteca">
          <ArrowLeft className="size-5" strokeWidth={1.8} />
        </Link>
        <h1 className="flex-1 font-display text-xl font-semibold">Tu lectura</h1>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 pb-16 pt-8 sm:px-8">
        {!stats ? null : (
          <>
            {/* Mensaje del día: siempre amable */}
            <motion.section
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-4 rounded-panel bg-gradient-to-br from-papel via-papel/70 to-acento/15 p-5 shadow-suave sm:p-6"
            >
              <WingedBook className="w-16 shrink-0 text-papel sm:w-20" accentClassName="text-acento" outlineClassName="text-tinta/30" />
              <div>
                <p className="font-display text-xl font-semibold sm:text-2xl">{headline(stats)}</p>
                <p className="mt-1 text-sm text-tinta-suave/70">{subline(stats)}</p>
              </div>
            </motion.section>

            <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Tiempo de lectura">
              <StatCard label="Hoy" value={formatDuration(stats.summary.todaySeconds)}>
                {stats.goal.enabled && (
                  <GoalBar seconds={stats.summary.todaySeconds} goalMinutes={stats.goal.minutes} met={stats.goalMet} />
                )}
              </StatCard>
              <StatCard label="Últimos 7 días" value={formatDuration(stats.summary.weekSeconds)} />
              <StatCard label="En total" value={formatDuration(stats.summary.totalSeconds)} />
            </section>

            <section className="rounded-panel bg-papel/40 p-5 shadow-suave sm:p-6" aria-labelledby="semana">
              <h2 id="semana" className="mb-4 text-lg font-semibold">
                Tu semana
              </h2>
              <WeekBars
                days={stats.summary.last7}
                today={stats.today}
                goalMinutes={stats.goal.enabled ? stats.goal.minutes : null}
              />
              {stats.goal.enabled && (
                <p className="mt-2 text-xs text-tinta-suave/60">La línea punteada es tu meta de {stats.goal.minutes} min.</p>
              )}
            </section>

            <section className="grid grid-cols-2 gap-3" aria-label="Rachas">
              <StatCard
                label="Racha actual"
                value={stats.streak.current ? streakLabel(stats.streak.current) : '—'}
                icon={<Flame className="size-4 text-acento" aria-hidden />}
              />
              <StatCard
                label="Mejor racha"
                value={stats.streak.best ? streakLabel(stats.streak.best) : '—'}
                icon={<Trophy className="size-4 text-acento" aria-hidden />}
              />
            </section>

            <section className="rounded-panel bg-papel/40 p-5 shadow-suave sm:p-6" aria-labelledby="terminados">
              <h2 id="terminados" className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <BookCheck className="size-5 text-acento" aria-hidden /> Libros terminados
                <span className="text-sm font-normal text-tinta-suave/60">({stats.finished.length})</span>
              </h2>
              {stats.finished.length ? (
                <ul className="divide-y divide-linea/10">
                  {stats.finished.map((b) => (
                    <li key={b.id} className="flex items-center gap-3 py-2.5">
                      <Star className="size-4 shrink-0 fill-acento text-acento" aria-hidden />
                      <Link href={readerHref(b.id)} className="min-w-0 flex-1 truncate font-display hover:underline">
                        {b.title}
                      </Link>
                      {b.author && <span className="hidden truncate text-sm text-tinta-suave/60 sm:block">{b.author}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-tinta-suave/65">Cuando termines un libro, aparecerá aquí con su estrella.</p>
              )}
            </section>

            <GoalSettings enabled={stats.goal.enabled} minutes={stats.goal.minutes} />
          </>
        )}
      </main>
    </div>
  );
}

type Stats = NonNullable<ReturnType<typeof useReadingStats>['stats']>;

function headline(s: Stats) {
  if (s.streak.broken && !s.streak.readToday) return 'Hoy es un buen día para volver a empezar';
  if (s.goal.enabled && s.goalMet) return 'Meta de hoy cumplida';
  if (s.streak.readToday) return 'Hoy ya volaste un rato';
  if (s.streak.current > 0) return `Llevas ${streakLabel(s.streak.current)} leyendo`;
  return 'Cada página, un viaje';
}

function subline(s: Stats) {
  if (s.streak.broken && !s.streak.readToday) return 'Unos minutos bastan. Sin prisa.';
  if (!s.goal.enabled) return 'Las metas están desactivadas: lee a tu ritmo.';
  const left = Math.max(0, s.goal.minutes * 60 - s.summary.todaySeconds);
  if (!left) return 'Todo lo que leas ahora es un regalo extra.';
  return `Te faltan ${formatDuration(left)} para tu meta de hoy, si te apetece.`;
}

function StatCard({ label, value, icon, children }: { label: string; value: string; icon?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="rounded-tarjeta bg-papel/40 p-4 shadow-suave">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-tinta-suave/60">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
      {children}
    </div>
  );
}

function GoalBar({ seconds, goalMinutes, met }: { seconds: number; goalMinutes: number; met: boolean }) {
  const pct = Math.min(100, (seconds / (goalMinutes * 60)) * 100);
  return (
    <div className="mt-2">
      <span className="block h-1.5 overflow-hidden rounded-full bg-linea/10">
        <span className="block h-full rounded-full bg-acento" style={{ width: `${pct}%` }} />
      </span>
      <p className="mt-1 text-xs text-tinta-suave/60">{met ? 'Meta cumplida' : `Meta: ${goalMinutes} min`}</p>
    </div>
  );
}

function GoalSettings({ enabled, minutes }: { enabled: boolean; minutes: number }) {
  return (
    <section className="rounded-panel border border-linea/10 p-5 sm:p-6" aria-labelledby="ajustes-meta">
      <h2 id="ajustes-meta" className="text-lg font-semibold">
        Meta diaria
      </h2>
      <p className="mt-1 text-sm text-tinta-suave/65">
        Opcional y sin presión. La racha cuenta cualquier día con lectura, aunque no llegues a la meta.
      </p>
      <label className="mt-4 flex cursor-pointer items-center justify-between gap-4">
        <span className="text-sm font-medium">Usar metas y racha</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setGoalPrefs({ enabled: !enabled, minutes })}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${enabled ? 'bg-acento' : 'bg-linea/20'}`}
        >
          <span className={`absolute top-1 size-5 rounded-full bg-fondo shadow-suave transition-all ${enabled ? 'left-6' : 'left-1'}`} />
        </button>
      </label>
      {enabled && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-suave bg-papel/60 p-1" role="group" aria-label="Minutos al día">
            <button
              type="button"
              onClick={() => setGoalPrefs({ enabled, minutes: minutes - 5 })}
              disabled={minutes <= GOAL_MIN}
              className="grid size-9 place-items-center rounded-[12px] hover:bg-fondo disabled:opacity-40"
              aria-label="Menos minutos"
            >
              <Minus className="size-4" />
            </button>
            <span className="min-w-20 text-center text-sm font-semibold tabular-nums">{minutes} min</span>
            <button
              type="button"
              onClick={() => setGoalPrefs({ enabled, minutes: minutes + 5 })}
              disabled={minutes >= GOAL_MAX}
              className="grid size-9 place-items-center rounded-[12px] hover:bg-fondo disabled:opacity-40"
              aria-label="Más minutos"
            >
              <Plus className="size-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={m === minutes}
                onClick={() => setGoalPrefs({ enabled, minutes: m })}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  m === minutes ? 'border-acento bg-acento/20' : 'border-linea/15 hover:bg-papel/60'
                }`}
              >
                {m} min
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
