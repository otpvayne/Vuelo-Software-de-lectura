import { isTauri } from './platform';

/**
 * Marco de la ventana en escritorio. Vuelo arranca sin bordes (decorations: false) y dibuja su propia
 * barra de título; Esc en la biblioteca alterna al marco nativo de Windows.
 * El estado vive en <html data-ventana="propia|nativa"> (ausente en el navegador).
 */
export type WindowFrame = 'propia' | 'nativa';

/** Script inline previo al primer pintado: evita que el contenido salte cuando aparece la barra propia. */
export const windowChromeInitScript = `(function(){if('__TAURI_INTERNALS__' in window)document.documentElement.dataset.ventana='propia'})();`;

const listeners = new Set<() => void>();

export function getWindowFrame(): WindowFrame | null {
  if (typeof document === 'undefined') return null;
  const v = document.documentElement.dataset.ventana;
  return v === 'propia' || v === 'nativa' ? v : null;
}

export function subscribeWindowFrame(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function applyFrame(frame: WindowFrame) {
  document.documentElement.dataset.ventana = frame;
  listeners.forEach((cb) => cb());
}

/** Alinea el estado con la ventana real (por si la config y el script inline discreparan). */
export async function syncWindowFrame() {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  applyFrame((await getCurrentWindow().isDecorated()) ? 'nativa' : 'propia');
}

/** Alterna entre ventana sin bordes (barra propia) y con bordes nativos. */
export async function toggleWindowFrame() {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  const toNative = getWindowFrame() !== 'nativa';
  await win.setDecorations(toNative);
  applyFrame(toNative ? 'nativa' : 'propia');
}
