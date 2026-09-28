import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface Chapter {
  title: string;
  /** 1-based */
  page: number;
}

type RefLike = { num: number; gen: number };

/**
 * Capítulos del índice del PDF (primer nivel de `getOutline()`), con su página.
 * Si el PDF no trae índice, devuelve [] — nunca se inventan capítulos.
 */
export async function getChapters(doc: PDFDocumentProxy): Promise<Chapter[]> {
  const outline = await doc.getOutline().catch(() => null);
  if (!outline?.length) return [];
  const chapters: Chapter[] = [];
  for (const item of outline) {
    try {
      let dest: unknown = item.dest;
      if (typeof dest === 'string') dest = await doc.getDestination(dest);
      if (!Array.isArray(dest) || dest[0] == null) continue;
      const target = dest[0] as RefLike | number;
      const index = typeof target === 'number' ? target : await doc.getPageIndex(target);
      const title = item.title?.trim();
      if (title) chapters.push({ title, page: index + 1 });
    } catch {
      // Destino roto: se ignora ese capítulo.
    }
  }
  return chapters.sort((a, b) => a.page - b.page);
}
