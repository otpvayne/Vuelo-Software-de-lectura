import type { PDFDocumentProxy } from 'pdfjs-dist';

/** Límite de ancho del canvas en px de dispositivo (evita texturas gigantes con zoom alto). */
export const MAX_CANVAS_PX = 4096;

export interface PageCacheStats {
  /** Renders reales de pdfjs. */
  renders: number;
  /** Veces que se reutilizó un canvas ya pintado al tamaño pedido. */
  hits: number;
  /** Canvas liberados por lejanía. */
  released: number;
  /** Duración del último render (ms). */
  lastRenderMs: number;
  /** Canvas vivos en la caché. */
  live: number;
}

/**
 * Caché de canvas ya pintados, por página y ancho en px de dispositivo.
 *
 * Los canvas son elementos del DOM que se mueven entre "huecos" (PdfPage) en vez de
 * volver a pintarse: cambiar de página, volver del zoom o remontar el flip no cuesta
 * un render si el canvas ya existe. Solo se conservan las páginas cercanas a la actual.
 */
export class PageCache {
  private readonly canvases = new Map<number, Map<number, HTMLCanvasElement>>();
  private readonly inflight = new Map<string, Promise<HTMLCanvasElement>>();
  private keep: { center: number; radius: number } = { center: 1, radius: Infinity };
  private destroyed = false;
  readonly stats: PageCacheStats = { renders: 0, hits: 0, released: 0, lastRenderMs: 0, live: 0 };

  constructor(private readonly doc: PDFDocumentProxy) {}

  /** Canvas pintado exactamente a `pixelWidth`, si existe. */
  get(page: number, pixelWidth: number): HTMLCanvasElement | null {
    const c = this.canvases.get(page)?.get(pixelWidth) ?? null;
    if (c) this.stats.hits += 1;
    return c;
  }

  /** El mejor sustituto disponible mientras llega el bueno: el más cercano por arriba, o el mayor. */
  best(page: number, pixelWidth: number): HTMLCanvasElement | null {
    const byWidth = this.canvases.get(page);
    if (!byWidth?.size) return null;
    const widths = [...byWidth.keys()].sort((a, b) => a - b);
    const w = widths.find((x) => x >= pixelWidth) ?? widths[widths.length - 1];
    return w === undefined ? null : (byWidth.get(w) ?? null);
  }

  /** Pinta (o reutiliza) la página al ancho indicado. Deduplica peticiones simultáneas. */
  render(page: number, pixelWidth: number): Promise<HTMLCanvasElement> {
    const width = Math.min(MAX_CANVAS_PX, Math.round(pixelWidth));
    const hit = this.get(page, width);
    if (hit) return Promise.resolve(hit);
    const key = `${page}@${width}`;
    const pending = this.inflight.get(key);
    if (pending) return pending;

    const job = (async () => {
      const t0 = performance.now();
      const pdfPage = await this.doc.getPage(page);
      const base = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: width / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.className = 'pdf-canvas';
      canvas.dataset.px = String(width);
      await pdfPage.render({ canvas, viewport }).promise;
      this.stats.renders += 1;
      this.stats.lastRenderMs = Math.round(performance.now() - t0);
      if (this.destroyed) {
        canvas.width = 0;
        throw new Error('caché destruida');
      }
      let byWidth = this.canvases.get(page);
      if (!byWidth) this.canvases.set(page, (byWidth = new Map()));
      byWidth.set(width, canvas);
      this.trimWidths(page, width);
      this.enforce();
      return canvas;
    })().finally(() => this.inflight.delete(key));

    this.inflight.set(key, job);
    return job;
  }

  /** Marca la zona de interés y libera las páginas fuera de ella. */
  retain(center: number, radius: number) {
    this.keep = { center, radius };
    this.enforce();
  }

  destroy() {
    this.destroyed = true;
    for (const byWidth of this.canvases.values()) for (const c of byWidth.values()) this.release(c);
    this.canvases.clear();
  }

  private enforce() {
    const { center, radius } = this.keep;
    for (const [page, byWidth] of this.canvases) {
      if (Math.abs(page - center) <= radius) continue;
      for (const c of byWidth.values()) {
        // Un canvas en pantalla no se toca: lo liberará el siguiente ciclo.
        if (!c.isConnected) this.release(c);
      }
      for (const [w, c] of byWidth) if (c.width === 0) byWidth.delete(w);
      if (!byWidth.size) this.canvases.delete(page);
    }
    this.stats.live = [...this.canvases.values()].reduce((n, m) => n + m.size, 0);
  }

  /** Por página, conserva como mucho el ancho recién pintado y otro más (p. ej. base y zoom). */
  private trimWidths(page: number, fresh: number) {
    const byWidth = this.canvases.get(page);
    if (!byWidth || byWidth.size <= 2) return;
    for (const [w, c] of byWidth) {
      if (byWidth.size <= 2) break;
      if (w !== fresh && !c.isConnected) {
        this.release(c);
        byWidth.delete(w);
      }
    }
  }

  private release(c: HTMLCanvasElement) {
    c.remove();
    // Poner el tamaño a 0 libera la memoria del bitmap de inmediato.
    c.width = 0;
    c.height = 0;
    this.stats.released += 1;
  }
}

/**
 * Estado compartido del lector fuera de React: la página actual y si el flip está activo.
 * Cada PdfPage se suscribe y solo se re-renderiza cuando cambia SU estado "activo",
 * sin tener que re-renderizar (ni que react-pageflip reprocese) todas las páginas.
 */
export class ReaderSignal {
  private listeners = new Set<() => void>();
  current = 1;
  /** false mientras la vista de zoom estática tiene los canvas. */
  flipEnabled = true;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  set(patch: Partial<Pick<ReaderSignal, 'current' | 'flipEnabled'>>) {
    Object.assign(this, patch);
    for (const fn of this.listeners) fn();
  }
}
