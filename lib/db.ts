/**
 * Persistencia de Vuelo.
 * - Dentro de Tauri: SQLite (tauri-plugin-sql) + PDF en AppData/books (tauri-plugin-fs).
 * - En el navegador (`npm run dev` sin Tauri): IndexedDB vía `idb`, mismo contrato.
 */
import type { DBSchema, IDBPDatabase } from 'idb';
import type TauriDatabase from '@tauri-apps/plugin-sql';
import { BOOKS_DIR, IDB_NAME, SQLITE_URL, type HighlightColor } from './constants';
import { isTauri } from './platform';

// ───────────────────────────── Modelos ─────────────────────────────

export interface Book {
  id: string;
  title: string;
  author: string | null;
  /** Tauri: ruta relativa a AppData. Navegador: clave en el store `files`. */
  filePath: string;
  /** Nombre original del archivo importado (para detectar duplicados). null en libros previos a la migración 2. */
  fileName: string | null;
  pageCount: number;
  currentPage: number;
  /** 0-1 */
  progress: number;
  cover: string | null;
  addedAt: number;
  lastOpenedAt: number | null;
}

export interface Note {
  id: string;
  bookId: string;
  page: number;
  content: string;
  createdAt: number;
  updatedAt: number;
}

/** Rectángulo relativo a la página: todos los valores son proporciones 0-1. */
export interface HighlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Highlight {
  id: string;
  bookId: string;
  page: number;
  rects: HighlightRect[];
  color: HighlightColor;
  text: string | null;
  note: string | null;
  createdAt: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  page: number;
  label: string | null;
  createdAt: number;
}

export type NewBook = Pick<Book, 'title' | 'author' | 'pageCount' | 'cover' | 'fileName'>;
export type NewHighlight = Omit<Highlight, 'id' | 'createdAt'>;

export interface VueloStore {
  listBooks(): Promise<Book[]>;
  getBook(id: string): Promise<Book | null>;
  /** Guarda el archivo PDF y crea el registro del libro. */
  addBook(data: NewBook, file: Uint8Array): Promise<Book>;
  readBookFile(book: Book): Promise<Uint8Array>;
  /**
   * Guarda la posición y marca el libro como abierto. `readTo` es la última página
   * visible (en doble página, la derecha) y define el progreso; si se omite, el
   * progreso no cambia (p. ej. al solo abrir el libro).
   */
  updateReading(id: string, currentPage: number, readTo?: number): Promise<void>;
  deleteBook(id: string): Promise<void>;

  listNotes(bookId: string): Promise<Note[]>;
  addNote(bookId: string, page: number, content: string): Promise<Note>;
  updateNote(id: string, content: string): Promise<void>;
  deleteNote(id: string): Promise<void>;

  listHighlights(bookId: string): Promise<Highlight[]>;
  addHighlight(data: NewHighlight): Promise<Highlight>;
  deleteHighlight(id: string): Promise<void>;

  listBookmarks(bookId: string): Promise<Bookmark[]>;
  /** Devuelve el marcador creado, o null si existía y se eliminó. */
  toggleBookmark(bookId: string, page: number, label?: string | null): Promise<Bookmark | null>;
}

// ──────────────────────────── Utilidades ───────────────────────────

const uid = () => crypto.randomUUID();
const now = () => Date.now();
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function normalizeRects(rects: HighlightRect[]): HighlightRect[] {
  return rects.map((r) => ({ x: clamp01(r.x), y: clamp01(r.y), w: clamp01(r.w), h: clamp01(r.h) }));
}

const progressOf = (page: number, total: number) => (total > 0 ? clamp01(page / total) : 0);

// ─────────────────────────── Migraciones ───────────────────────────
// Cada entrada se aplica una vez, en orden. La versión aplicada se guarda en
// PRAGMA user_version. Nunca edites una migración publicada: añade otra.

export const MIGRATIONS: readonly string[] = [
  /* 1 — esquema inicial */ `
  CREATE TABLE IF NOT EXISTS books (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    author          TEXT,
    file_path       TEXT NOT NULL,
    page_count      INTEGER NOT NULL DEFAULT 0,
    current_page    INTEGER NOT NULL DEFAULT 1,
    progress        REAL NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 1),
    cover           TEXT,
    added_at        INTEGER NOT NULL,
    last_opened_at  INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_books_last_opened ON books (last_opened_at DESC);

  CREATE TABLE IF NOT EXISTS notes (
    id          TEXT PRIMARY KEY,
    book_id     TEXT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
    page        INTEGER NOT NULL,
    content     TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notes_book ON notes (book_id, page);

  -- rects: JSON [{x,y,w,h}] con proporciones 0-1 relativas a la página
  CREATE TABLE IF NOT EXISTS highlights (
    id          TEXT PRIMARY KEY,
    book_id     TEXT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
    page        INTEGER NOT NULL,
    rects       TEXT NOT NULL CHECK (json_valid(rects)),
    color       TEXT NOT NULL DEFAULT 'acento',
    text        TEXT,
    note        TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_highlights_book ON highlights (book_id, page);

  CREATE TABLE IF NOT EXISTS bookmarks (
    id          TEXT PRIMARY KEY,
    book_id     TEXT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
    page        INTEGER NOT NULL,
    label       TEXT,
    created_at  INTEGER NOT NULL,
    UNIQUE (book_id, page)
  );
  `,
  /* 2 — nombre original del archivo, para avisar de duplicados */ `
  ALTER TABLE books ADD COLUMN file_name TEXT;
  `,
];

// ────────────────────────────── SQLite ─────────────────────────────

interface BookRow {
  id: string;
  title: string;
  author: string | null;
  file_path: string;
  page_count: number;
  current_page: number;
  progress: number;
  cover: string | null;
  added_at: number;
  last_opened_at: number | null;
  file_name: string | null;
}
interface NoteRow {
  id: string;
  book_id: string;
  page: number;
  content: string;
  created_at: number;
  updated_at: number;
}
interface HighlightRow {
  id: string;
  book_id: string;
  page: number;
  rects: string;
  color: HighlightColor;
  text: string | null;
  note: string | null;
  created_at: number;
}
interface BookmarkRow {
  id: string;
  book_id: string;
  page: number;
  label: string | null;
  created_at: number;
}

const toBook = (r: BookRow): Book => ({
  id: r.id,
  title: r.title,
  author: r.author,
  filePath: r.file_path,
  pageCount: r.page_count,
  currentPage: r.current_page,
  progress: r.progress,
  cover: r.cover,
  addedAt: r.added_at,
  lastOpenedAt: r.last_opened_at,
  fileName: r.file_name,
});
const toNote = (r: NoteRow): Note => ({
  id: r.id,
  bookId: r.book_id,
  page: r.page,
  content: r.content,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const toHighlight = (r: HighlightRow): Highlight => ({
  id: r.id,
  bookId: r.book_id,
  page: r.page,
  rects: JSON.parse(r.rects) as HighlightRect[],
  color: r.color,
  text: r.text,
  note: r.note,
  createdAt: r.created_at,
});
const toBookmark = (r: BookmarkRow): Bookmark => ({
  id: r.id,
  bookId: r.book_id,
  page: r.page,
  label: r.label,
  createdAt: r.created_at,
});

async function migrateSqlite(db: TauriDatabase) {
  const [row] = await db.select<{ user_version: number }[]>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    // Una sola llamada por migración: el plugin usa un pool, así el BEGIN/COMMIT
    // viaja en la misma conexión.
    await db.execute(`BEGIN;\n${MIGRATIONS[v]}\nPRAGMA user_version = ${v + 1};\nCOMMIT;`);
  }
}

async function createSqliteStore(): Promise<VueloStore> {
  const [{ default: Database }, fs] = await Promise.all([
    import('@tauri-apps/plugin-sql'),
    import('@tauri-apps/plugin-fs'),
  ]);
  const db = await Database.load(SQLITE_URL);
  await migrateSqlite(db);
  const base = { baseDir: fs.BaseDirectory.AppData };

  const store: VueloStore = {
    async listBooks() {
      const rows = await db.select<BookRow[]>(
        'SELECT * FROM books ORDER BY COALESCE(last_opened_at, added_at) DESC',
      );
      return rows.map(toBook);
    },
    async getBook(id) {
      const [row] = await db.select<BookRow[]>('SELECT * FROM books WHERE id = $1', [id]);
      return row ? toBook(row) : null;
    },
    async addBook(data, file) {
      const id = uid();
      const filePath = `${BOOKS_DIR}/${id}.pdf`;
      if (!(await fs.exists(BOOKS_DIR, base))) await fs.mkdir(BOOKS_DIR, { ...base, recursive: true });
      await fs.writeFile(filePath, file, base);
      const book: Book = {
        id,
        ...data,
        filePath,
        currentPage: 1,
        progress: 0,
        addedAt: now(),
        lastOpenedAt: null,
      };
      await db.execute(
        `INSERT INTO books (id, title, author, file_path, page_count, current_page, progress, cover, added_at, file_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, book.title, book.author, filePath, book.pageCount, 1, 0, book.cover, book.addedAt, book.fileName],
      );
      return book;
    },
    async readBookFile(book) {
      return fs.readFile(book.filePath, base);
    },
    async updateReading(id, currentPage, readTo) {
      if (readTo === undefined) {
        await db.execute('UPDATE books SET current_page = $2, last_opened_at = $3 WHERE id = $1', [
          id,
          currentPage,
          now(),
        ]);
        return;
      }
      await db.execute(
        `UPDATE books
         SET current_page = $2,
             progress = CASE WHEN page_count > 0 THEN MIN(1.0, MAX(0.0, CAST($4 AS REAL) / page_count)) ELSE 0 END,
             last_opened_at = $3
         WHERE id = $1`,
        [id, currentPage, now(), readTo],
      );
    },
    async deleteBook(id) {
      const book = await store.getBook(id);
      // Borrado explícito: PRAGMA foreign_keys no está garantizado en todas las conexiones del pool.
      for (const table of ['notes', 'highlights', 'bookmarks'] as const) {
        await db.execute(`DELETE FROM ${table} WHERE book_id = $1`, [id]);
      }
      await db.execute('DELETE FROM books WHERE id = $1', [id]);
      if (book && (await fs.exists(book.filePath, base))) await fs.remove(book.filePath, base);
    },

    async listNotes(bookId) {
      const rows = await db.select<NoteRow[]>(
        'SELECT * FROM notes WHERE book_id = $1 ORDER BY page, created_at',
        [bookId],
      );
      return rows.map(toNote);
    },
    async addNote(bookId, page, content) {
      const note: Note = { id: uid(), bookId, page, content, createdAt: now(), updatedAt: now() };
      await db.execute(
        'INSERT INTO notes (id, book_id, page, content, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [note.id, bookId, page, content, note.createdAt, note.updatedAt],
      );
      return note;
    },
    async updateNote(id, content) {
      await db.execute('UPDATE notes SET content = $2, updated_at = $3 WHERE id = $1', [id, content, now()]);
    },
    async deleteNote(id) {
      await db.execute('DELETE FROM notes WHERE id = $1', [id]);
    },

    async listHighlights(bookId) {
      const rows = await db.select<HighlightRow[]>(
        'SELECT * FROM highlights WHERE book_id = $1 ORDER BY page, created_at',
        [bookId],
      );
      return rows.map(toHighlight);
    },
    async addHighlight(data) {
      const hl: Highlight = { ...data, rects: normalizeRects(data.rects), id: uid(), createdAt: now() };
      await db.execute(
        `INSERT INTO highlights (id, book_id, page, rects, color, text, note, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [hl.id, hl.bookId, hl.page, JSON.stringify(hl.rects), hl.color, hl.text, hl.note, hl.createdAt],
      );
      return hl;
    },
    async deleteHighlight(id) {
      await db.execute('DELETE FROM highlights WHERE id = $1', [id]);
    },

    async listBookmarks(bookId) {
      const rows = await db.select<BookmarkRow[]>(
        'SELECT * FROM bookmarks WHERE book_id = $1 ORDER BY page',
        [bookId],
      );
      return rows.map(toBookmark);
    },
    async toggleBookmark(bookId, page, label = null) {
      const res = await db.execute('DELETE FROM bookmarks WHERE book_id = $1 AND page = $2', [bookId, page]);
      if (res.rowsAffected > 0) return null;
      const bm: Bookmark = { id: uid(), bookId, page, label, createdAt: now() };
      await db.execute(
        'INSERT INTO bookmarks (id, book_id, page, label, created_at) VALUES ($1, $2, $3, $4, $5)',
        [bm.id, bookId, page, label, bm.createdAt],
      );
      return bm;
    },
  };
  return store;
}

// ──────────────────────── IndexedDB (fallback) ──────────────────────

interface VueloIdb extends DBSchema {
  books: { key: string; value: Book };
  files: { key: string; value: Blob };
  notes: { key: string; value: Note; indexes: { bookId: string } };
  highlights: { key: string; value: Highlight; indexes: { bookId: string } };
  bookmarks: { key: string; value: Bookmark; indexes: { bookId: string; bookPage: [string, number] } };
}

/** Registros guardados antes de la versión 2 no tienen `fileName`. */
const withDefaults = (book: Book): Book => ({ ...book, fileName: book.fileName ?? null });

const byPage = <T extends { page: number; createdAt: number }>(a: T, b: T) =>
  a.page - b.page || a.createdAt - b.createdAt;

async function createIdbStore(): Promise<VueloStore> {
  const { openDB } = await import('idb');
  // La versión de IndexedDB sigue a MIGRATIONS para mantener ambos backends alineados.
  const db: IDBPDatabase<VueloIdb> = await openDB<VueloIdb>(IDB_NAME, MIGRATIONS.length, {
    upgrade(database, oldVersion) {
      // v2 solo añade el campo opcional `fileName`: no cambia la estructura de los stores.
      if (oldVersion < 1) {
        database.createObjectStore('books', { keyPath: 'id' });
        database.createObjectStore('files');
        database.createObjectStore('notes', { keyPath: 'id' }).createIndex('bookId', 'bookId');
        database.createObjectStore('highlights', { keyPath: 'id' }).createIndex('bookId', 'bookId');
        const bookmarks = database.createObjectStore('bookmarks', { keyPath: 'id' });
        bookmarks.createIndex('bookId', 'bookId');
        bookmarks.createIndex('bookPage', ['bookId', 'page'], { unique: true });
      }
    },
  });

  return {
    async listBooks() {
      const books = (await db.getAll('books')).map(withDefaults);
      return books.sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt));
    },
    async getBook(id) {
      const book = await db.get('books', id);
      return book ? withDefaults(book) : null;
    },
    async addBook(data, file) {
      const id = uid();
      const book: Book = {
        id,
        ...data,
        filePath: id,
        currentPage: 1,
        progress: 0,
        addedAt: now(),
        lastOpenedAt: null,
      };
      const tx = db.transaction(['books', 'files'], 'readwrite');
      await Promise.all([
        tx.objectStore('files').put(new Blob([file.slice()], { type: 'application/pdf' }), id),
        tx.objectStore('books').put(book),
        tx.done,
      ]);
      return book;
    },
    async readBookFile(book) {
      const blob = await db.get('files', book.filePath);
      if (!blob) throw new Error(`No se encontró el archivo de "${book.title}"`);
      return new Uint8Array(await blob.arrayBuffer());
    },
    async updateReading(id, currentPage, readTo) {
      const book = await db.get('books', id);
      if (!book) return;
      await db.put('books', {
        ...book,
        currentPage,
        progress: readTo === undefined ? book.progress : progressOf(readTo, book.pageCount),
        lastOpenedAt: now(),
      });
    },
    async deleteBook(id) {
      const tx = db.transaction(['books', 'files', 'notes', 'highlights', 'bookmarks'], 'readwrite');
      const book = await tx.objectStore('books').get(id);
      const removeByBook = async (store: 'notes' | 'highlights' | 'bookmarks') => {
        const keys = await tx.objectStore(store).index('bookId').getAllKeys(id);
        await Promise.all(keys.map((k) => tx.objectStore(store).delete(k)));
      };
      await Promise.all([removeByBook('notes'), removeByBook('highlights'), removeByBook('bookmarks')]);
      if (book) await tx.objectStore('files').delete(book.filePath);
      await tx.objectStore('books').delete(id);
      await tx.done;
    },

    async listNotes(bookId) {
      return (await db.getAllFromIndex('notes', 'bookId', bookId)).sort(byPage);
    },
    async addNote(bookId, page, content) {
      const note: Note = { id: uid(), bookId, page, content, createdAt: now(), updatedAt: now() };
      await db.put('notes', note);
      return note;
    },
    async updateNote(id, content) {
      const note = await db.get('notes', id);
      if (note) await db.put('notes', { ...note, content, updatedAt: now() });
    },
    async deleteNote(id) {
      await db.delete('notes', id);
    },

    async listHighlights(bookId) {
      return (await db.getAllFromIndex('highlights', 'bookId', bookId)).sort(byPage);
    },
    async addHighlight(data) {
      const hl: Highlight = { ...data, rects: normalizeRects(data.rects), id: uid(), createdAt: now() };
      await db.put('highlights', hl);
      return hl;
    },
    async deleteHighlight(id) {
      await db.delete('highlights', id);
    },

    async listBookmarks(bookId) {
      return (await db.getAllFromIndex('bookmarks', 'bookId', bookId)).sort((a, b) => a.page - b.page);
    },
    async toggleBookmark(bookId, page, label = null) {
      const existing = await db.getFromIndex('bookmarks', 'bookPage', [bookId, page]);
      if (existing) {
        await db.delete('bookmarks', existing.id);
        return null;
      }
      const bm: Bookmark = { id: uid(), bookId, page, label, createdAt: now() };
      await db.put('bookmarks', bm);
      return bm;
    },
  };
}

// ───────────────────────────── Acceso ──────────────────────────────

let storePromise: Promise<VueloStore> | null = null;

/** Devuelve el almacén adecuado para la plataforma (singleton, migrado). */
export function getStore(): Promise<VueloStore> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('La base de datos solo está disponible en el cliente'));
  }
  storePromise ??= (isTauri() ? createSqliteStore() : createIdbStore()).catch((err: unknown) => {
    storePromise = null;
    throw err;
  });
  return storePromise;
}
