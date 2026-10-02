import type { Book as EpubBook } from '@likecoin/epub-ts';

/**
 * Motor EPUB (epub.ts, fork mantenido de epub.js). Se carga solo en el cliente y bajo demanda,
 * igual que pdfjs: la biblioteca no paga su peso.
 *
 * Las "páginas" de un EPUB son estimadas: una ubicación por ~1 600 caracteres. Dependen solo del
 * texto del libro (no del tamaño de letra ni de la ventana), así que son estables entre
 * aperturas y sirven de `pageCount`/`currentPage`/`page` para barra de progreso, notas,
 * marcadores, metas y racha, igual que con PDF.
 */
export const EPUB_CHARS_PER_PAGE = 1600;

export const isEpub = (file: File) => file.type === 'application/epub+zip' || /\.epub$/i.test(file.name);

type EpubLib = typeof import('@likecoin/epub-ts');
let libPromise: Promise<EpubLib> | null = null;

export function getEpubLib(): Promise<EpubLib> {
  if (typeof window === 'undefined') return Promise.reject(new Error('epub.ts solo está disponible en el cliente'));
  libPromise ??= import('@likecoin/epub-ts');
  return libPromise;
}

/** Abre un EPUB desde sus bytes (se copia el buffer: la librería no debe tocar el original). */
export async function openEpub(data: Uint8Array): Promise<EpubBook> {
  const { default: ePub } = await getEpubLib();
  const book = ePub(data.slice().buffer as ArrayBuffer);
  await book.opened;
  await book.ready;
  return book;
}

export function closeEpub(book: EpubBook) {
  try {
    book.destroy();
  } catch (err) {
    console.warn('EPUB: error al cerrar', err);
  }
}

export interface EpubInfo {
  title: string | null;
  author: string | null;
  /** Páginas estimadas (ubicaciones de ~1 600 caracteres). */
  pageCount: number;
  /** Capítulos del índice (o del spine si no trae índice). */
  chapters: number;
  /** Miniatura de la portada (data URL WebP) o null: entonces se usa GeneratedCover. */
  cover: string | null;
}

const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ') : null);

/** Miniatura de la portada embebida en el EPUB. */
async function readCover(book: EpubBook, width: number): Promise<string | null> {
  try {
    const path = book.cover;
    if (!path) return null;
    const blob = await book.archive?.getBlob(path);
    if (!blob || !blob.size) return null;
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, width / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/webp', 0.82);
  } catch {
    return null;
  }
}

/** Metadatos, portada y número de páginas estimadas de un EPUB. */
export async function readEpubInfo(data: Uint8Array, coverWidth = 320): Promise<EpubInfo> {
  const book = await openEpub(data);
  try {
    const meta = book.packaging.metadata;
    const locations = await book.locations.generate(EPUB_CHARS_PER_PAGE);
    const toc = book.navigation?.toc ?? [];
    return {
      title: clean(meta.title),
      author: clean(meta.creator),
      pageCount: Math.max(1, locations.length),
      chapters: toc.length || book.spine.length,
      cover: await readCover(book, coverWidth),
    };
  } finally {
    closeEpub(book);
  }
}

// ───────────────────────── Contenido del libro: tema y papel ─────────────────────────

export type EpubFont = 'serif' | 'sans';

/**
 * Fuentes del sistema: el iframe del libro es otro documento y no hereda las fuentes de la app
 * (cargar @font-face dentro de él exigiría rutas absolutas y ampliar la CSP).
 */
export const EPUB_FONT_STACKS: Record<EpubFont, string> = {
  serif: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif",
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

/** Tamaño de letra del libro en %, con paso de 10. */
export const EPUB_FONT_MIN = 70;
export const EPUB_FONT_MAX = 220;
export const EPUB_FONT_STEP = 10;
export const clampEpubFont = (n: number) => Math.min(EPUB_FONT_MAX, Math.max(EPUB_FONT_MIN, Math.round(n / EPUB_FONT_STEP) * EPUB_FONT_STEP));

/** Un token de color del tema (canales RGB, p. ej. "43 35 64") leído en vivo del documento. */
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const rgb = (name: string, alpha?: number) => `rgb(${token(name)}${alpha === undefined ? '' : ` / ${alpha}`})`;

export interface EpubPalette {
  paper: string;
  ink: string;
  accent: string;
}

/**
 * Colores del libro según tema y papel, SOLO con los tokens del tema (nada de paleta aparte).
 * Imita lo que hace el papel con un PDF: en Día y Sepia la página es el fondo del tema (Natural) o
 * su tinte cálido (Suave); en Noche la página es clara (como el PDF «tal cual»), más tenue en Suave,
 * y «Invertido» la oscurece con texto claro.
 */
export function epubPalette(theme: string, paper: string): EpubPalette {
  const accent = rgb('--acento');
  if (theme === 'noche') {
    if (paper === 'invertido') return { paper: rgb('--fondo'), ink: rgb('--tinta'), accent };
    if (paper === 'suave') return { paper: rgb('--papel-tinte'), ink: rgb('--fondo'), accent };
    return { paper: rgb('--tinta'), ink: rgb('--fondo'), accent };
  }
  if (paper === 'suave') return { paper: rgb('--papel-tinte'), ink: rgb('--tinta'), accent };
  return { paper: rgb('--fondo'), ink: rgb('--tinta'), accent };
}

/** CSS que se inyecta dentro de cada iframe de epub.js. */
export function epubContentCss(p: EpubPalette, font: EpubFont): string {
  return `
html, body { background: ${p.paper} !important; color: ${p.ink} !important; }
body { font-family: ${EPUB_FONT_STACKS[font]} !important; line-height: 1.62 !important; text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased; }
body *:not(img):not(svg):not(svg *) { color: ${p.ink} !important; background-color: transparent !important; font-family: inherit !important; }
a, a * { text-decoration: underline; text-decoration-color: ${p.accent}; text-underline-offset: 0.18em; }
img, svg, video { max-width: 100% !important; height: auto; }
hr { border-color: ${p.ink}; opacity: 0.25; }
::selection { background: ${p.accent}; color: ${p.ink}; }
`;
}

/** Sombra del lomo entre las dos hojas (solo con doble página). */
export const EPUB_SPREAD_MIN_WIDTH = 900;

/**
 * `locations.cfiFromLocation` devuelve un RANGO («epubcfi(padre,inicio,fin)»), que epub.js no puede
 * mostrar como destino. Se navega al punto de inicio del rango.
 */
export function startOfCfi(cfi: string): string {
  const m = /^epubcfi\((.*?),(.*?),(.*?)\)$/.exec(cfi);
  return m ? `epubcfi(${m[1]}${m[2]})` : cfi;
}
