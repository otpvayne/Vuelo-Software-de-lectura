/** SHA-256 en hexadecimal (Web Crypto: navegador, Tauri, Android y Node ≥ 19). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const CACHE_PREFIX = 'vuelo:sha256:';

/**
 * Hash de un PDF de la biblioteca con caché por (id, tamaño): evita releer PDF grandes en
 * cada respaldo. Si el tamaño cambia, se recalcula.
 */
export async function cachedBookHash(bookId: string, size: number, read: () => Promise<Uint8Array>): Promise<string> {
  const key = CACHE_PREFIX + bookId;
  try {
    const hit = localStorage.getItem(key);
    if (hit) {
      const [s, h] = hit.split(':');
      if (Number(s) === size && h && /^[0-9a-f]{64}$/.test(h)) return h;
    }
  } catch {
    // Sin localStorage: se calcula siempre.
  }
  const hash = await sha256Hex(await read());
  try {
    localStorage.setItem(key, `${size}:${hash}`);
  } catch {
    // Ignorar.
  }
  return hash;
}
