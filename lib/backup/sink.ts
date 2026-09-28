import { isTauri } from '../platform';

/** Destino del respaldo, escrito por partes (nunca todo el ZIP en memoria en Tauri). */
export interface BackupSink {
  /** Descripción para la interfaz ("Descargas" o la ruta elegida). */
  label: string;
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  /** Cancelación o error: deja el destino limpio si se puede. */
  abort(): Promise<void>;
}

const FLUSH_BYTES = 4 * 1024 * 1024;

function concat(parts: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * Abre el destino. En Tauri muestra "Guardar como" (dialog:allow-save): el plugin añade SOLO
 * esa ruta al scope de fs, y `write_file` ya está habilitado por el permiso de AppData
 * (write-all), así que no hace falta ampliar permisos. Devuelve null si se cancela el diálogo.
 */
export async function openBackupSink(fileName: string): Promise<BackupSink | null> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({
      title: 'Guardar respaldo de Vuelo',
      defaultPath: fileName,
      filters: [{ name: 'Respaldo de Vuelo', extensions: ['vuelo'] }],
    });
    if (!path) return null;
    const fs = await import('@tauri-apps/plugin-fs');
    let buffer: Uint8Array[] = [];
    let buffered = 0;
    let first = true;
    const flush = async () => {
      if (!buffered && !first) return;
      const data = concat(buffer, buffered);
      buffer = [];
      buffered = 0;
      // Primer bloque: crea/trunca el archivo. Luego, se añade al final.
      await fs.writeFile(path, data, { append: !first });
      first = false;
    };
    return {
      label: path,
      async write(chunk) {
        buffer.push(chunk);
        buffered += chunk.length;
        if (buffered >= FLUSH_BYTES) await flush();
      },
      close: flush,
      async abort() {
        buffer = [];
        buffered = 0;
        // La ruta elegida está en el scope: se borra el archivo a medias.
        await fs.remove(path).catch(() => undefined);
      },
    };
  }
  // Navegador: el Blob se arma con las partes (el navegador puede respaldarlo en disco).
  let parts: BlobPart[] = [];
  return {
    label: 'Descargas',
    async write(chunk) {
      parts.push(chunk as Uint8Array<ArrayBuffer>);
    },
    async close() {
      const url = URL.createObjectURL(new Blob(parts, { type: 'application/zip' }));
      parts = [];
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    async abort() {
      parts = [];
    },
  };
}
