import type { Book, Bookmark, Highlight, LibraryDump, Note, ReadingSession, RestoreOps } from '../db';
import type { BackupBookEntry, BackupData, BackupManifest } from './format';

export type RestoreMode = 'combinar' | 'reemplazar';

export interface ExistingLibrary {
  dump: LibraryDump;
  /** SHA-256 del PDF de cada libro actual (por id). */
  hashes: ReadonlyMap<string, string>;
}

export interface PlannedFile {
  /** Id del libro que recibirá el PDF (nuevo). */
  bookId: string;
  entry: BackupBookEntry;
  /** Sin portada en el respaldo: regenerarla desde el PDF. */
  needsCover: boolean;
}

interface Counts {
  books: number;
  notes: number;
  highlights: number;
  bookmarks: number;
  sessions: number;
}
const zero = (): Counts => ({ books: 0, notes: 0, highlights: 0, bookmarks: 0, sessions: 0 });

export interface RestoreSummary {
  mode: RestoreMode;
  /** Lo que trae el respaldo. */
  backup: Counts;
  /** Cuántos de esos ya existen en esta biblioteca. */
  existentes: Counts;
  /** Cuántos se añadirán. */
  nuevos: Counts;
  /** Libros existentes cuyo progreso se actualizará porque el respaldo es más reciente. */
  progresoActualizado: number;
  /** Lo que se borrará (solo en "Reemplazar todo"). */
  seBorra: Counts;
  omitidos: { title: string; motivo: string }[];
}

export interface RestorePlan {
  mode: RestoreMode;
  ops: RestoreOps;
  filesToWrite: PlannedFile[];
  /** PDFs actuales que sobran tras "Reemplazar todo" (se borran después de confirmar la base). */
  filesToDeleteAfter: string[];
  summary: RestoreSummary;
}

const opened = (b: { lastOpenedAt: number | null }) => b.lastOpenedAt ?? 0;

/**
 * Decide qué hacer con cada registro del respaldo. Función pura (sin E/S): se prueba en Node.
 * - Un libro es "el mismo" si coincide el SHA-256 de su PDF.
 * - Combinar: añade lo que falta; si un libro ya existe gana el progreso más reciente
 *   (lastOpenedAt); apuntes por updatedAt; subrayados y sesiones por id (no se duplican);
 *   marcadores únicos por página.
 * - Reemplazar: la biblioteca queda exactamente como el respaldo (reutilizando los PDF que
 *   ya estén en el equipo con el mismo hash).
 */
export function planRestore(
  existing: ExistingLibrary,
  manifest: BackupManifest,
  data: BackupData,
  mode: RestoreMode,
  newId: () => string,
): RestorePlan {
  const { dump, hashes } = existing;
  const replace = mode === 'reemplazar';
  const entries = new Map(manifest.books.map((e) => [e.id, e]));
  const byHash = new Map<string, Book>();
  for (const b of dump.books) {
    const h = hashes.get(b.id);
    if (h && !byHash.has(h)) byHash.set(h, b);
  }
  const existingIds = new Set(dump.books.map((b) => b.id));

  const ops: RestoreOps = { replaceAll: replace, books: [], notes: [], highlights: [], bookmarks: [], sessions: [] };
  const filesToWrite: PlannedFile[] = [];
  const summary: RestoreSummary = {
    mode,
    backup: {
      books: data.books.length,
      notes: data.notes.length,
      highlights: data.highlights.length,
      bookmarks: data.bookmarks.length,
      sessions: data.sessions.length,
    },
    existentes: zero(),
    nuevos: zero(),
    progresoActualizado: 0,
    seBorra: replace
      ? {
          books: dump.books.length,
          notes: dump.notes.length,
          highlights: dump.highlights.length,
          bookmarks: dump.bookmarks.length,
          sessions: dump.sessions.length,
        }
      : zero(),
    omitidos: [],
  };
  /** id del libro en el respaldo → id final en esta biblioteca. */
  const idMap = new Map<string, string>();
  const keptFiles = new Set<string>();

  for (const b of data.books) {
    const entry = entries.get(b.id);
    if (!entry) {
      summary.omitidos.push({ title: b.title, motivo: 'no aparece en el manifiesto' });
      continue;
    }
    const match = byHash.get(entry.sha256);
    if (match) summary.existentes.books += 1;

    if (!replace && match) {
      // Mismo libro: se conserva el registro local y solo se trae lo más reciente.
      idMap.set(b.id, match.id);
      let updated: Book | null = null;
      if (opened(b) > opened(match)) {
        updated = { ...match, currentPage: b.currentPage, progress: b.progress, lastOpenedAt: b.lastOpenedAt, locator: b.locator ?? match.locator };
        summary.progresoActualizado += 1;
      }
      if (!match.cover && b.cover) updated = { ...(updated ?? match), cover: b.cover };
      if (updated) ops.books.push(updated);
      continue;
    }
    if (replace && match) {
      // Reemplazar, pero el PDF ya está en el equipo: se reutiliza su archivo.
      idMap.set(b.id, b.id);
      keptFiles.add(match.filePath);
      ops.books.push({ ...b, filePath: match.filePath, cover: b.cover ?? match.cover });
      continue;
    }
    if (!entry.file) {
      summary.omitidos.push({ title: b.title, motivo: 'el respaldo no incluye su PDF (solo datos)' });
      continue;
    }
    // Libro nuevo: si su id choca con un libro distinto de aquí, se le da uno nuevo
    // (nunca se sobrescribe el PDF de otro libro).
    // En Reemplazar también: el PDF del libro actual con ese id se borra después de confirmar.
    const targetId = existingIds.has(b.id) ? newId() : b.id;
    idMap.set(b.id, targetId);
    summary.nuevos.books += 1;
    ops.books.push({ ...b, id: targetId, filePath: '' }); // filePath se fija al escribir el PDF
    filesToWrite.push({ bookId: targetId, entry, needsCover: !b.cover });
  }

  // ── Hijos: solo de libros restaurados, con el id de libro traducido ──
  const noteById = new Map(dump.notes.map((n) => [n.id, n]));
  const hlIds = new Set(dump.highlights.map((h) => h.id));
  const bmKeys = new Set(dump.bookmarks.map((b) => `${b.bookId}#${b.page}`));
  const sesById = new Map(dump.sessions.map((s) => [s.id, s]));

  const remap = <T extends { bookId: string }>(item: T): T | null => {
    const id = idMap.get(item.bookId);
    return id ? { ...item, bookId: id } : null;
  };

  for (const raw of data.notes) {
    const n = remap<Note>(raw);
    if (!n) continue;
    const cur = !replace ? noteById.get(n.id) : undefined;
    if (cur) {
      summary.existentes.notes += 1;
      if (n.updatedAt > cur.updatedAt) ops.notes.push(n);
    } else {
      summary.nuevos.notes += 1;
      ops.notes.push(n);
    }
  }
  for (const raw of data.highlights) {
    const h = remap<Highlight>(raw);
    if (!h) continue;
    if (!replace && hlIds.has(h.id)) {
      summary.existentes.highlights += 1;
      continue;
    }
    summary.nuevos.highlights += 1;
    ops.highlights.push(h);
  }
  const seenBm = new Set<string>();
  for (const raw of data.bookmarks) {
    const b = remap<Bookmark>(raw);
    if (!b) continue;
    const key = `${b.bookId}#${b.page}`;
    if (seenBm.has(key)) continue;
    seenBm.add(key);
    if (!replace && bmKeys.has(key)) {
      summary.existentes.bookmarks += 1;
      continue;
    }
    summary.nuevos.bookmarks += 1;
    ops.bookmarks.push(b);
  }
  for (const raw of data.sessions) {
    const s = remap<ReadingSession>(raw);
    if (!s) continue;
    const cur = !replace ? sesById.get(s.id) : undefined;
    if (cur) {
      summary.existentes.sessions += 1;
      // Mismo id: gana la versión con más tiempo guardado (una sesión solo crece).
      if (s.secondsActive > cur.secondsActive) ops.sessions.push(s);
    } else {
      summary.nuevos.sessions += 1;
      ops.sessions.push(s);
    }
  }

  const filesToDeleteAfter = replace ? dump.books.map((b) => b.filePath).filter((p) => !keptFiles.has(p)) : [];
  return { mode, ops, filesToWrite, filesToDeleteAfter, summary };
}
