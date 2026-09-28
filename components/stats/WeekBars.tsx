'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { DayTotal } from '@/lib/db';
import { weekdayShort } from '@/lib/days';
import { formatDuration } from '@/lib/goals';

const W = 40;
const GAP = 12;
const H = 132;
const LABEL_H = 22;

/** Barras de los últimos 7 días en SVG propio. La línea discontinua es la meta diaria. */
export default function WeekBars({ days, today, goalMinutes }: { days: DayTotal[]; today: string; goalMinutes: number | null }) {
  const reduce = useReducedMotion() ?? false;
  const goal = goalMinutes ? goalMinutes * 60 : 0;
  const max = Math.max(goal * 1.15, ...days.map((d) => d.seconds), 60);
  const width = days.length * W + (days.length - 1) * GAP;
  const y = (s: number) => H - (s / max) * (H - 8);

  return (
    <svg
      viewBox={`0 0 ${width} ${H + LABEL_H}`}
      className="h-auto w-full max-w-md"
      role="img"
      aria-label={`Minutos de lectura de los últimos 7 días: ${days
        .map((d) => `${weekdayShort(d.day)} ${formatDuration(d.seconds)}`)
        .join(', ')}`}
    >
      {goal > 0 && (
        <g>
          <line x1={0} x2={width} y1={y(goal)} y2={y(goal)} className="stroke-acento/60" strokeWidth={1.5} strokeDasharray="4 5" />
        </g>
      )}
      {days.map((d, i) => {
        const x = i * (W + GAP);
        const h = Math.max(d.seconds > 0 ? 4 : 2, H - y(d.seconds));
        const isToday = d.day === today;
        const met = goal > 0 && d.seconds >= goal;
        return (
          <g key={d.day}>
            <title>{`${weekdayShort(d.day)} ${d.day}: ${formatDuration(d.seconds)}`}</title>
            <rect x={x} y={0} width={W} height={H} rx={10} className="fill-papel/60" />
            <motion.rect
              x={x}
              width={W}
              rx={10}
              className={isToday || met ? 'fill-acento' : 'fill-tinta-suave/35'}
              initial={reduce ? false : { height: 0, y: H }}
              animate={{ height: h, y: H - h }}
              transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : i * 0.05, ease: [0.22, 1, 0.36, 1] }}
            />
            <text
              x={x + W / 2}
              y={H + 16}
              textAnchor="middle"
              className={`text-[11px] ${isToday ? 'fill-tinta font-semibold' : 'fill-tinta-suave/60'}`}
            >
              {isToday ? 'hoy' : weekdayShort(d.day)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
