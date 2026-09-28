import type { HighlightRect } from './db';

/** Longitud máxima del texto guardado de un subrayado. */
export const MAX_HIGHLIGHT_TEXT = 2000;
/** Separación máxima (px de pantalla) entre cajas de una línea para fusionarlas. */
const MERGE_GAP_PX = 2;

export const normalizeText = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, MAX_HIGHLIGHT_TEXT);

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Une las cajas de una misma línea: mismo alto (±35 %) y centro vertical cercano, y que se
 * solapen o queden a menos de ~2 px. Así una línea son 1-2 rects en vez de una por palabra.
 */
export function mergeLineBoxes(boxes: Box[]): Box[] {
  const sorted = boxes
    .filter((b) => b.right - b.left > 0.5 && b.bottom - b.top > 0.5)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const out: Box[] = [];
  for (const b of sorted) {
    const h = b.bottom - b.top;
    const cy = (b.top + b.bottom) / 2;
    const same = out.find((o) => {
      const oh = o.bottom - o.top;
      const ocy = (o.top + o.bottom) / 2;
      const sameLine = Math.abs(ocy - cy) < Math.min(oh, h) * 0.5 && Math.abs(oh - h) < Math.max(oh, h) * 0.35;
      const near = b.left <= o.right + MERGE_GAP_PX && b.right >= o.left - MERGE_GAP_PX;
      return sameLine && near;
    });
    if (same) {
      same.left = Math.min(same.left, b.left);
      same.right = Math.max(same.right, b.right);
      same.top = Math.min(same.top, b.top);
      same.bottom = Math.max(same.bottom, b.bottom);
    } else {
      out.push({ ...b });
    }
  }
  return out;
}

/** Cajas de pantalla → proporciones 0-1 de la página (restando su origen y dividiendo por su tamaño). */
export function toPageFractions(boxes: Box[], page: DOMRect): HighlightRect[] {
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return boxes
    .map((b) => {
      const left = Math.max(b.left, page.left);
      const right = Math.min(b.right, page.right);
      const top = Math.max(b.top, page.top);
      const bottom = Math.min(b.bottom, page.bottom);
      return {
        x: clamp((left - page.left) / page.width),
        y: clamp((top - page.top) / page.height),
        w: clamp((right - left) / page.width),
        h: clamp((bottom - top) / page.height),
      };
    })
    .filter((r) => r.w > 0.001 && r.h > 0.001);
}

export interface PageSelection {
  page: number;
  rects: HighlightRect[];
  text: string;
}

/**
 * Divide una selección en un trozo por página (cruza dos páginas → dos subrayados).
 * `pages` son los elementos .pagina-pdf visibles, con su capa de texto dentro.
 */
export function splitSelectionByPage(range: Range, pages: HTMLElement[]): PageSelection[] {
  const result: PageSelection[] = [];
  for (const el of pages) {
    const layer = el.querySelector<HTMLElement>('.capa-texto');
    const pageNumber = Number(el.dataset.page);
    if (!layer || !Number.isFinite(pageNumber) || !range.intersectsNode(layer)) continue;

    const part = document.createRange();
    if (layer.contains(range.startContainer)) part.setStart(range.startContainer, range.startOffset);
    else part.setStart(layer, 0);
    const endOfContent = layer.querySelector(':scope > .endOfContent');
    if (layer.contains(range.endContainer) && !endOfContent?.contains(range.endContainer)) {
      part.setEnd(range.endContainer, range.endOffset);
    } else if (endOfContent) {
      // El relleno de fin de contenido ocupa toda la página: nunca entra en el subrayado.
      part.setEndBefore(endOfContent);
    } else {
      part.setEnd(layer, layer.childNodes.length);
    }

    const text = normalizeText(part.toString());
    if (!text) continue; // vacía o solo espacios

    // Solo las cajas de los fragmentos de texto (no <br> ni el relleno de fin de contenido).
    const boxes: Box[] = [];
    for (const r of Array.from(part.getClientRects())) {
      boxes.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
    const rects = toPageFractions(mergeLineBoxes(boxes), el.getBoundingClientRect());
    if (rects.length) result.push({ page: pageNumber, rects, text });
  }
  return result;
}
