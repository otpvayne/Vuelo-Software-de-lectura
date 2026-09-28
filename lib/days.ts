/** Fechas locales como claves YYYY-MM-DD (el "día" de una sesión es el del reloj del usuario). */
const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Instante de la próxima medianoche local después de `t`. */
export function nextMidnight(t: number): number {
  const d = new Date(t);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n).getTime());
}

/** Los últimos `count` días terminando en `today` (inclusive), del más antiguo al más reciente. */
export function lastDays(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(today, i - (count - 1)));
}

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export function weekdayShort(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return WEEKDAYS[new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay()] ?? '';
}
