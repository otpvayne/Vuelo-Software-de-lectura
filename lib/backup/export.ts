import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate';
import { APP_NAME } from '../constants';
import { MIGRATIONS, bookExtension, getStore, type Book } from '../db';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BackupError,
  DATA_FILE,
  MANIFEST_FILE,
  PREF_KEYS,
  type BackupBook,
  type BackupData,
  type BackupManifest,
} from './format';
import { cachedBookHash } from './hash';
import type { BackupSink } from './sink';

import { LAST_BACKUP_KEY } from './reminder';

export { LAST_BACKUP_KEY };
const SLICE = 1024 * 1024;

export interface BackupEstimate {
  books: number;
  pdfBytes: number;
  /** Aproximado: data.json comprimido. */
  dataBytes: number;
}

export interface BackupProgress {
  phase: 'preparando' | 'empaquetando' | 'terminando';
  done: number;
  total: number;
  label?: string;
}

/** filePath es un detalle local de cada equipo: no viaja en el respaldo. */
const toBackupBook = (b: Book): BackupBook => {
  const { filePath, ...rest } = b;
  void filePath;
  return rest;
};

const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0));

export async function estimateBackup(includePdfs: boolean): Promise<BackupEstimate> {
  const store = await getStore();
  const dump = await store.dumpAll();
  let pdfBytes = 0;
  if (includePdfs) for (const b of dump.books) pdfBytes += await store.bookFileSize(b);
  const dataBytes = Math.round(JSON.stringify(dump).length * 0.6);
  return { books: dump.books.length, pdfBytes, dataBytes };
}

export function backupFileName(date = new Date(), includePdfs = true): string {
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `vuelo-respaldo-${d}${includePdfs ? '' : '-solo-datos'}.vuelo`;
}

function readPrefs(): Record<string, string> {
  const prefs: Record<string, string> = {};
  try {
    for (const k of PREF_KEYS) {
      const v = localStorage.getItem(k);
      if (v !== null) prefs[k] = v;
    }
  } catch {
    // Sin localStorage.
  }
  return prefs;
}

/**
 * Construye el .vuelo en streaming: manifest.json y data.json (comprimidos) y después cada
 * PDF sin recomprimir (ya lo están), de uno en uno y en trozos de 1 MB, cediendo el hilo entre
 * trozos. Solo hay un PDF en memoria a la vez.
 */
export async function exportBackup(
  sink: BackupSink,
  opts: { includePdfs: boolean; signal?: AbortSignal; onProgress?: (p: BackupProgress) => void },
): Promise<{ bytes: number; manifest: BackupManifest }> {
  const { includePdfs, signal, onProgress } = opts;
  const check = () => {
    if (signal?.aborted) throw new BackupError('cancelado', 'Respaldo cancelado.');
  };
  const store = await getStore();
  const dump = await store.dumpAll();

  // 1) Hash y tamaño de cada PDF (identidad del libro al restaurar).
  const sizes = new Map<string, number>();
  const hashes = new Map<string, string>();
  let totalPdf = 0;
  for (const [i, b] of dump.books.entries()) {
    check();
    onProgress?.({ phase: 'preparando', done: i, total: dump.books.length, label: b.title });
    const size = await store.bookFileSize(b);
    sizes.set(b.id, size);
    hashes.set(b.id, await cachedBookHash(b.id, size, () => store.readBookFile(b)));
    totalPdf += size;
    await yieldToUI();
  }

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: MIGRATIONS.length,
    app: `${APP_NAME} 0.1.0`,
    createdAt: new Date().toISOString(),
    includesPdfs: includePdfs,
    counts: {
      books: dump.books.length,
      notes: dump.notes.length,
      highlights: dump.highlights.length,
      bookmarks: dump.bookmarks.length,
      sessions: dump.sessions.length,
    },
    books: dump.books.map((b) => ({
      id: b.id,
      title: b.title,
      sha256: hashes.get(b.id) ?? '',
      size: sizes.get(b.id) ?? 0,
      file: includePdfs ? `books/${b.id}.${bookExtension(b.format)}` : null,
    })),
  };
  const data: BackupData = {
    books: dump.books.map(toBackupBook),
    notes: dump.notes,
    highlights: dump.highlights,
    bookmarks: dump.bookmarks,
    sessions: dump.sessions,
    prefs: readPrefs(),
  };

  // 2) ZIP en streaming hacia el destino.
  let written = 0;
  let pending: Uint8Array[] = [];
  let zipError: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) zipError = err;
    else pending.push(chunk);
  });
  const drain = async () => {
    const chunks = pending;
    pending = [];
    for (const c of chunks) {
      await sink.write(c);
      written += c.length;
    }
    if (zipError) throw zipError;
  };
  const addText = async (name: string, text: string) => {
    const f = new ZipDeflate(name, { level: 6 });
    zip.add(f);
    f.push(strToU8(text), true);
    await drain();
  };

  try {
    await addText(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
    await addText(DATA_FILE, JSON.stringify(data));
    if (includePdfs) {
      let done = 0;
      for (const b of dump.books as Book[]) {
        check();
        const bytes = await store.readBookFile(b);
        const f = new ZipPassThrough(`books/${b.id}.${bookExtension(b.format)}`);
        zip.add(f);
        if (!bytes.length) f.push(new Uint8Array(0), true);
        for (let i = 0; i < bytes.length; i += SLICE) {
          check();
          const end = Math.min(bytes.length, i + SLICE);
          f.push(bytes.subarray(i, end), end >= bytes.length);
          await drain();
          done += end - i;
          onProgress?.({ phase: 'empaquetando', done, total: totalPdf, label: b.title });
          await yieldToUI();
        }
      }
    }
    zip.end();
    await drain();
    onProgress?.({ phase: 'terminando', done: 1, total: 1 });
    await sink.close();
  } catch (err) {
    zip.terminate();
    await sink.abort();
    if (err instanceof BackupError) throw err;
    throw new BackupError('escritura', `No se pudo crear el respaldo: ${(err as Error).message}`);
  }
  try {
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
  } catch {
    // Ignorar.
  }
  return { bytes: written, manifest };
}
