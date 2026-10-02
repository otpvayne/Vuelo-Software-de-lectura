import { Unzip, UnzipInflate, strFromU8, type UnzipFile } from 'fflate';
import { MIGRATIONS, getStore, type VueloStore } from '../db';
import { readPdfInfo } from '../pdf';
import { readEpubInfo } from '../epub';
import {
  BackupError,
  DATA_FILE,
  MANIFEST_FILE,
  PREF_KEYS,
  migrateBackupData,
  validateData,
  validateManifest,
  type BackupData,
  type BackupManifest,
} from './format';
import { cachedBookHash, sha256Hex } from './hash';
import { planRestore, type ExistingLibrary, type RestoreMode, type RestorePlan, type RestoreSummary } from './plan';

export interface BackupHead {
  manifest: BackupManifest;
  data: BackupData;
  /** Versión de esquema original (antes de migrar los datos). */
  fromSchema: number;
  fileSize: number;
}

export interface RestoreProgress {
  phase: 'comparando' | 'extrayendo' | 'guardando';
  done: number;
  total: number;
  label?: string;
}

const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0));
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * Recorre el ZIP en streaming. `want` decide qué entradas se extraen; `onEntry` las procesa
 * (async, con contrapresión: no se lee más del archivo hasta terminar). `stop` corta la lectura.
 */
async function streamZip(
  file: Blob,
  want: (name: string) => boolean,
  onEntry: (name: string, bytes: Uint8Array) => Promise<void>,
  opts: { stop?: () => boolean; signal?: AbortSignal; onBytes?: (read: number) => void } = {},
): Promise<Set<string>> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (head.length < 4 || ZIP_MAGIC.some((b, i) => head[i] !== b)) {
    throw new BackupError('no-zip', 'El archivo no es un respaldo de Vuelo (no es un ZIP válido).');
  }
  const completed = new Set<string>();
  let work: Promise<void> = Promise.resolve();
  let failure: unknown = null;
  const unzip = new Unzip((f: UnzipFile) => {
    if (!want(f.name)) return; // no se inicia: sus datos se descartan sin guardarlos
    const chunks: Uint8Array[] = [];
    f.ondata = (err, data, final) => {
      if (err) {
        failure = new BackupError('no-zip', `El respaldo está dañado (${f.name}).`);
        return;
      }
      chunks.push(data);
      if (final) {
        const bytes = concat(chunks);
        work = work.then(async () => {
          await onEntry(f.name, bytes);
          completed.add(f.name);
        });
      }
    };
    f.start();
  });
  unzip.register(UnzipInflate);

  const reader = file.stream().getReader();
  let read = 0;
  try {
    for (;;) {
      if (opts.signal?.aborted) throw new BackupError('cancelado', 'Restauración cancelada. No se cambió nada.');
      const { done, value } = await reader.read();
      try {
        unzip.push(value ?? new Uint8Array(0), done);
      } catch {
        // Si falla justo al llegar al final, al ZIP le falta su cola: está cortado.
        throw done
          ? new BackupError('truncado', 'El respaldo está incompleto (el archivo parece cortado). No se cambió nada.')
          : new BackupError('no-zip', 'El respaldo está dañado y no se puede leer. No se cambió nada.');
      }
      await work;
      if (failure) throw failure;
      if (value) {
        read += value.length;
        opts.onBytes?.(read);
      }
      if (done || opts.stop?.()) break;
      await yieldToUI();
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
  await work;
  if (failure) throw failure;
  return completed;
}

/** Lee y valida manifest.json y data.json (migrando datos de esquemas anteriores). No toca nada. */
export async function readBackupHead(file: Blob): Promise<BackupHead> {
  const texts = new Map<string, string>();
  await streamZip(
    file,
    (n) => n === MANIFEST_FILE || n === DATA_FILE,
    async (n, bytes) => {
      texts.set(n, strFromU8(bytes));
    },
    { stop: () => texts.size === 2 },
  );
  const manifestText = texts.get(MANIFEST_FILE);
  const dataText = texts.get(DATA_FILE);
  if (!manifestText) throw new BackupError('manifest', 'El respaldo no tiene manifest.json (¿está incompleto o no es de Vuelo?).');
  if (!dataText) throw new BackupError('truncado', 'El respaldo está incompleto: falta data.json.');
  let manifestRaw: unknown;
  let dataRaw: unknown;
  try {
    manifestRaw = JSON.parse(manifestText);
  } catch {
    throw new BackupError('manifest', 'El manifiesto del respaldo está dañado.');
  }
  const manifest = validateManifest(manifestRaw, MIGRATIONS.length);
  try {
    dataRaw = JSON.parse(dataText);
  } catch {
    throw new BackupError('formato', 'Los datos del respaldo están dañados.');
  }
  const data = validateData(migrateBackupData(dataRaw, manifest.schemaVersion));
  const listed = new Set(manifest.books.map((b) => b.id));
  if (data.books.some((b) => !listed.has(b.id))) {
    throw new BackupError('formato', 'El respaldo es inconsistente: hay libros que no están en el manifiesto.');
  }
  return { manifest, data, fromSchema: manifest.schemaVersion, fileSize: file.size };
}

/** Biblioteca actual + hash de cada PDF (con caché por tamaño). */
async function collectExisting(store: VueloStore, onProgress?: (p: RestoreProgress) => void): Promise<ExistingLibrary> {
  const dump = await store.dumpAll();
  const hashes = new Map<string, string>();
  for (const [i, b] of dump.books.entries()) {
    onProgress?.({ phase: 'comparando', done: i, total: dump.books.length, label: b.title });
    try {
      const size = await store.bookFileSize(b);
      hashes.set(b.id, await cachedBookHash(b.id, size, () => store.readBookFile(b)));
    } catch {
      // PDF ausente: ese libro no puede coincidir por hash.
    }
    await yieldToUI();
  }
  return { dump, hashes };
}

/** Resumen previo: qué trae el respaldo y cuánto ya existe. No cambia nada. */
export async function summarizeRestore(head: BackupHead, mode: RestoreMode): Promise<RestoreSummary> {
  const store = await getStore();
  const existing = await collectExisting(store);
  return planRestore(existing, head.manifest, head.data, mode, () => crypto.randomUUID()).summary;
}

function applyPrefs(prefs: Record<string, string>, mode: RestoreMode) {
  try {
    for (const k of PREF_KEYS) {
      const v = prefs[k];
      if (v === undefined) continue;
      if (k === 'vuelo:festejados') {
        // Se unen: un libro festejado aquí o allí no se vuelve a festejar.
        const cur = JSON.parse(localStorage.getItem(k) ?? '[]') as string[];
        const incoming = JSON.parse(v) as string[];
        localStorage.setItem(k, JSON.stringify([...new Set([...(mode === 'reemplazar' ? [] : cur), ...incoming])]));
      } else if (mode === 'reemplazar' || localStorage.getItem(k) === null) {
        localStorage.setItem(k, v);
      }
    }
  } catch {
    // Preferencias opcionales.
  }
}

export interface RestoreResult {
  summary: RestoreSummary;
  plan: RestorePlan;
}

/**
 * Restaura en dos fases:
 * 1) Extrae y verifica (SHA-256) los PDF necesarios y los guarda con ids nuevos, sin tocar
 *    ningún registro existente.
 * 2) Aplica todos los cambios de la base en UNA transacción.
 * Si algo falla en 1 o 2, se borran los PDF escritos: la biblioteca queda como estaba.
 * Solo tras confirmar la base se borran los PDF que sobran (Reemplazar todo).
 */
export async function restoreBackup(
  file: Blob,
  head: BackupHead,
  mode: RestoreMode,
  opts: { signal?: AbortSignal; onProgress?: (p: RestoreProgress) => void } = {},
): Promise<RestoreResult> {
  const store = await getStore();
  const existing = await collectExisting(store, opts.onProgress);
  const plan = planRestore(existing, head.manifest, head.data, mode, () => crypto.randomUUID());
  const wanted = new Map(plan.filesToWrite.map((f) => [f.entry.file ?? '', f]));
  const written: string[] = [];
  const totalBytes = plan.filesToWrite.reduce((n, f) => n + f.entry.size, 0);

  try {
    if (wanted.size) {
      let done = 0;
      const completed = await streamZip(
        file,
        (n) => wanted.has(n),
        async (name, bytes) => {
          const planned = wanted.get(name);
          if (!planned) return;
          if ((await sha256Hex(bytes)) !== planned.entry.sha256) {
            throw new BackupError('hash', `El PDF de «${planned.entry.title}» está dañado (no coincide su huella). No se cambió nada.`);
          }
          const book = plan.ops.books.find((b) => b.id === planned.bookId);
          if (book && planned.needsCover) {
            const info = await (book.format === 'epub' ? readEpubInfo(bytes) : readPdfInfo(bytes)).catch(() => null);
            book.cover = info?.cover ?? null;
          }
          const filePath = await store.putBookFile(planned.bookId, bytes, book?.format);
          written.push(filePath);
          if (book) book.filePath = filePath;
          done += bytes.length;
          opts.onProgress?.({ phase: 'extrayendo', done, total: totalBytes, label: planned.entry.title });
        },
        { signal: opts.signal, stop: () => written.length === wanted.size },
      );
      if (completed.size < wanted.size) {
        throw new BackupError('truncado', 'El respaldo está incompleto (el ZIP parece cortado). No se cambió nada.');
      }
    }
    if (plan.ops.books.some((b) => !b.filePath)) {
      throw new BackupError('truncado', 'Faltan PDF en el respaldo. No se cambió nada.');
    }
    opts.onProgress?.({ phase: 'guardando', done: 0, total: 1 });
    await store.applyRestore(plan.ops);
  } catch (err) {
    for (const fp of written) await store.deleteBookFile(fp).catch(() => undefined);
    if (err instanceof BackupError) throw err;
    throw new BackupError('escritura', `No se pudo restaurar: ${(err as Error).message}. No se cambió nada.`);
  }
  for (const fp of plan.filesToDeleteAfter) await store.deleteBookFile(fp).catch(() => undefined);
  applyPrefs(head.data.prefs, mode);
  opts.onProgress?.({ phase: 'guardando', done: 1, total: 1 });
  return { summary: plan.summary, plan };
}
