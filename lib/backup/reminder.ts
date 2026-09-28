import type { Book } from '../db';

/** Fecha (ms) del último respaldo exportado con éxito. */
export const LAST_BACKUP_KEY = 'vuelo:ultimo-respaldo';

const SHOWN_KEY = 'vuelo:aviso-respaldo-visto';
const OFF_KEY = 'vuelo:aviso-respaldo-off';
const DAY = 86_400_000;
export const REMIND_AFTER_DAYS = 30;
export const REMIND_EVERY_DAYS = 7;
export const REMIND_MIN_ACTIVE_BOOKS = 3;

const num = (k: string) => {
  try {
    return Number(localStorage.getItem(k)) || 0;
  } catch {
    return 0;
  }
};

/**
 * ¿Mostrar el aviso suave? Solo si han pasado > 30 días desde el último respaldo (o nunca),
 * hay 3+ libros con actividad, no se mostró en la última semana y no está desactivado.
 */
export function shouldRemindBackup(books: Book[], now = Date.now()): boolean {
  try {
    if (localStorage.getItem(OFF_KEY) === '1') return false;
  } catch {
    return false;
  }
  const last = num(LAST_BACKUP_KEY);
  if (last && now - last < REMIND_AFTER_DAYS * DAY) return false;
  if (now - num(SHOWN_KEY) < REMIND_EVERY_DAYS * DAY) return false;
  const active = books.filter((b) => b.lastOpenedAt !== null || b.progress > 0).length;
  return active >= REMIND_MIN_ACTIVE_BOOKS;
}

const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // Ignorar.
  }
};
/** Se mostró (o se descartó): no volver hasta dentro de una semana. */
export const markBackupReminderShown = (now = Date.now()) => set(SHOWN_KEY, String(now));
export const disableBackupReminder = () => set(OFF_KEY, '1');

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toLocaleString('es', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}
