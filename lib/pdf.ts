import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { PDF_WORKER_SRC } from './constants';

type PdfJs = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfJs> | null = null;

/**
 * Carga pdfjs-dist solo en el cliente y configura el worker.
 * El worker se sirve como archivo estático desde /public, así funciona igual en
 * `next dev` (http://localhost:3000), en el export y dentro de Tauri
 * (tauri://localhost / http://tauri.localhost), siempre con el mismo origen.
 */
export function getPdfjs(): Promise<PdfJs> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('pdfjs solo está disponible en el cliente'));
  }
  pdfjsPromise ??= import('pdfjs-dist').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
    return pdfjs;
  });
  return pdfjsPromise;
}

/** Abre un PDF. Se pasa una copia porque pdfjs transfiere (y vacía) el buffer al worker. */
export async function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs();
  return pdfjs.getDocument({ data: data.slice() }).promise;
}

/** Libera el documento y su worker (en pdfjs v6 se hace vía loadingTask). */
export function closePdf(doc: PDFDocumentProxy): Promise<void> {
  return doc.loadingTask.destroy();
}

/** Renderiza una página en un canvas ajustado al ancho indicado (en px CSS). */
export async function renderPage(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  cssWidth: number,
): Promise<void> {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${(viewport.height / viewport.width) * cssWidth}px`;
  await page.render({ canvas, viewport }).promise;
}

export interface PdfInfo {
  title: string | null;
  author: string | null;
  pageCount: number;
  cover: string | null;
}

/** Extrae metadatos y una miniatura de la primera página (data URL WebP). */
export async function readPdfInfo(data: Uint8Array, coverWidth = 320): Promise<PdfInfo> {
  const doc = await openPdf(data);
  try {
    const meta = await doc.getMetadata().catch(() => null);
    const infoDict = (meta?.info ?? {}) as { Title?: unknown; Author?: unknown };
    const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

    let cover: string | null = null;
    try {
      const canvas = document.createElement('canvas');
      await renderPage(await doc.getPage(1), canvas, coverWidth);
      cover = canvas.toDataURL('image/webp', 0.82);
    } catch {
      cover = null;
    }

    return {
      title: clean(infoDict.Title),
      author: clean(infoDict.Author),
      pageCount: doc.numPages,
      cover,
    };
  } finally {
    await closePdf(doc);
  }
}
