import { isHighlightColor, type HighlightColor } from '../constants';
import { isBookFormat, type Book, type Bookmark, Highlight, HighlightRect, Note, ReadingSession } from '../db';

export const BACKUP_FORMAT = 'vuelo-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_EXTENSION = 'vuelo';
export const MANIFEST_FILE = 'manifest.json';
export const DATA_FILE = 'data.json';
/** Por encima de esto se avisa antes de exportar. */
export const LARGE_BACKUP_BYTES = 500 * 1024 * 1024;

/** Preferencias que viajan en el respaldo (localStorage). */
export const PREF_KEYS = [
  'vuelo:tema',
  'vuelo:papel',
  'vuelo:sonido',
  'vuelo:color-subrayado',
  'vuelo:epub-tamano',
  'vuelo:epub-fuente',
  'vuelo:metas-activas',
  'vuelo:meta-minutos',
  'vuelo:festejados',
] as const;

export interface BackupBookEntry {
  id: string;
  title: string;
  sha256: string;
  size: number;
  /** Ruta dentro del ZIP, o null en respaldos "solo datos". */
  file: string | null;
}

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  /** Versión de esquema de la base (nº de migraciones) de quien exportó. */
  schemaVersion: number;
  app: string;
  createdAt: string;
  includesPdfs: boolean;
  counts: { books: number; notes: number; highlights: number; bookmarks: number; sessions: number };
  books: BackupBookEntry[];
}

/** Un libro en data.json: sin filePath (es un detalle local de cada equipo). */
export type BackupBook = Omit<Book, 'filePath'>;

export interface BackupData {
  books: BackupBook[];
  notes: Note[];
  highlights: Highlight[];
  bookmarks: Bookmark[];
  sessions: ReadingSession[];
  prefs: Record<string, string>;
}

export type BackupErrorCode = 'no-zip' | 'truncado' | 'manifest' | 'version' | 'formato' | 'hash' | 'cancelado' | 'escritura';

export class BackupError extends Error {
  constructor(
    readonly code: BackupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 100_000) => typeof v === 'string' && v.length <= max && !v.includes('\u0000');
const optStr = (v: unknown, max?: number) => v === null || v === undefined || str(v, max);
const int = (v: unknown, min = 0) => typeof v === 'number' && Number.isInteger(v) && v >= min;
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const HEX64 = /^[0-9a-f]{64}$/;

export function validateManifest(raw: unknown, appSchemaVersion: number): BackupManifest {
  const bad = (why: string) => new BackupError('manifest', `El respaldo no es válido: ${why}.`);
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) throw bad('no es un archivo de respaldo de Vuelo');
  if (!int(raw.formatVersion, 1)) throw bad('falta la versión de formato');
  if ((raw.formatVersion as number) > BACKUP_FORMAT_VERSION) {
    throw new BackupError('version', 'Este respaldo usa un formato más nuevo que esta versión de Vuelo. Actualiza la app para restaurarlo.');
  }
  if (!int(raw.schemaVersion, 1)) throw bad('falta la versión de la base');
  if ((raw.schemaVersion as number) > appSchemaVersion) {
    throw new BackupError(
      'version',
      `Este respaldo viene de una versión más nueva de Vuelo (base v${raw.schemaVersion as number}; esta app usa v${appSchemaVersion}). Actualiza la app para restaurarlo.`,
    );
  }
  if (!Array.isArray(raw.books)) throw bad('falta la lista de libros');
  for (const b of raw.books) {
    if (!isObj(b) || !str(b.id, 100) || !str(b.title, 2000) || !str(b.sha256, 64) || !HEX64.test(b.sha256 as string) || !int(b.size) || !(b.file === null || str(b.file, 300))) {
      throw bad('hay un libro mal descrito en el manifiesto');
    }
    if (b.file !== null && !/^books\/[\w.-]+\.(pdf|epub)$/.test(b.file as string)) throw bad('ruta de libro no permitida');
  }
  return raw as unknown as BackupManifest;
}

const COLORS_V2 = new Set(['acento', 'papel']);

/**
 * Lleva los datos de un respaldo de un esquema anterior al actual (como las migraciones de la base):
 * v2 añade `fileName`, v3 pasa los colores 'acento'/'papel' a 'amarillo', v4 añade las sesiones,
 * v5 (EPUB) añade `format`/`locator` a los libros y `cfi`/`chapterHref` a los subrayados.
 */
export function migrateBackupData(raw: unknown, fromSchema: number): unknown {
  if (!isObj(raw)) return raw;
  const data: Record<string, unknown> = { ...raw };
  if (fromSchema < 2 && Array.isArray(data.books)) {
    data.books = data.books.map((b) => (isObj(b) ? { fileName: null, ...b } : b));
  }
  if (fromSchema < 3 && Array.isArray(data.highlights)) {
    data.highlights = data.highlights.map((h) =>
      isObj(h) && (COLORS_V2.has(h.color as string) || !isHighlightColor(h.color)) ? { ...h, color: 'amarillo' } : h,
    );
  }
  if (fromSchema < 4) data.sessions = data.sessions ?? [];
  if (fromSchema < 5) {
    if (Array.isArray(data.books)) {
      data.books = data.books.map((b) => (isObj(b) ? { format: 'pdf', locator: null, ...b } : b));
    }
    if (Array.isArray(data.highlights)) {
      data.highlights = data.highlights.map((h) => (isObj(h) ? { cfi: null, chapterHref: null, ...h } : h));
    }
  }
  data.prefs = data.prefs ?? {};
  return data;
}

const validRect = (r: unknown): r is HighlightRect =>
  isObj(r) && [r.x, r.y, r.w, r.h].every((v) => num(v) && (v as number) >= 0 && (v as number) <= 1);

/** Validación estricta de data.json: lo que no cumple el esquema hace fallar la restauración. */
export function validateData(raw: unknown): BackupData {
  const bad = (why: string) => new BackupError('formato', `El respaldo tiene datos dañados: ${why}.`);
  if (!isObj(raw)) throw bad('no hay datos');
  const arr = (k: string) => {
    const v = raw[k];
    if (!Array.isArray(v)) throw bad(`falta "${k}"`);
    return v as unknown[];
  };
  const books = arr('books').map((b) => {
    if (
      !isObj(b) || !str(b.id, 100) || !str(b.title, 2000) || !optStr(b.author, 2000) || !int(b.pageCount) ||
      !int(b.currentPage) || !num(b.progress) || !optStr(b.cover, 5_000_000) || !num(b.addedAt) ||
      !(b.lastOpenedAt === null || num(b.lastOpenedAt)) || !optStr(b.fileName, 1000) ||
      !isBookFormat(b.format) || !optStr(b.locator, 5000)
    ) {
      throw bad('un libro no es válido');
    }
    if (b.cover && !(b.cover as string).startsWith('data:image/')) throw bad('portada no permitida');
    return {
      id: b.id as string,
      title: b.title as string,
      author: (b.author as string | null) ?? null,
      pageCount: b.pageCount as number,
      currentPage: Math.max(1, b.currentPage as number),
      progress: Math.min(1, Math.max(0, b.progress as number)),
      cover: (b.cover as string | null) ?? null,
      addedAt: b.addedAt as number,
      lastOpenedAt: (b.lastOpenedAt as number | null) ?? null,
      fileName: (b.fileName as string | null) ?? null,
      format: b.format,
      locator: (b.locator as string | null) ?? null,
    } satisfies BackupBook;
  });
  const notes = arr('notes').map((n) => {
    if (!isObj(n) || !str(n.id, 100) || !str(n.bookId, 100) || !int(n.page, 1) || !str(n.content) || !num(n.createdAt) || !num(n.updatedAt)) {
      throw bad('un apunte no es válido');
    }
    return { id: n.id, bookId: n.bookId, page: n.page, content: n.content, createdAt: n.createdAt, updatedAt: n.updatedAt } as Note;
  });
  const highlights = arr('highlights').map((h) => {
    if (
      !isObj(h) || !str(h.id, 100) || !str(h.bookId, 100) || !int(h.page, 1) || !Array.isArray(h.rects) ||
      !h.rects.every(validRect) || !isHighlightColor(h.color) || !optStr(h.text) || !optStr(h.note) || !num(h.createdAt) || !optStr(h.cfi, 5000) || !optStr(h.chapterHref, 2000)
    ) {
      throw bad('un subrayado no es válido');
    }
    return {
      id: h.id,
      bookId: h.bookId,
      page: h.page,
      rects: h.rects,
      color: h.color as HighlightColor,
      text: (h.text as string | null) ?? null,
      note: (h.note as string | null) ?? null,
      createdAt: h.createdAt,
      cfi: (h.cfi as string | null) ?? null,
      chapterHref: (h.chapterHref as string | null) ?? null,
    } as Highlight;
  });
  const bookmarks = arr('bookmarks').map((b) => {
    if (!isObj(b) || !str(b.id, 100) || !str(b.bookId, 100) || !int(b.page, 1) || !optStr(b.label, 1000) || !num(b.createdAt)) {
      throw bad('un marcador no es válido');
    }
    return { id: b.id, bookId: b.bookId, page: b.page, label: (b.label as string | null) ?? null, createdAt: b.createdAt } as Bookmark;
  });
  const sessions = arr('sessions').map((s) => {
    if (
      !isObj(s) || !str(s.id, 100) || !str(s.bookId, 100) || !num(s.startedAt) || !num(s.endedAt) ||
      !num(s.secondsActive) || (s.secondsActive as number) < 0 || !int(s.pagesRead) || !str(s.day, 10) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(s.day as string)
    ) {
      throw bad('una sesión de lectura no es válida');
    }
    return {
      id: s.id,
      bookId: s.bookId,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      secondsActive: Math.round(s.secondsActive as number),
      pagesRead: s.pagesRead,
      day: s.day,
    } as ReadingSession;
  });
  const prefs: Record<string, string> = {};
  if (isObj(raw.prefs)) {
    for (const k of PREF_KEYS) {
      const v = raw.prefs[k];
      if (typeof v === 'string' && v.length < 10_000) prefs[k] = v;
    }
  }
  return { books, notes, highlights, bookmarks, sessions, prefs };
}
