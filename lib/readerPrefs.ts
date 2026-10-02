import { isHighlightColor, type HighlightColor, type Theme } from './constants';
import { clampEpubFont, type EpubFont } from './epub';

export type PaperMode = 'natural' | 'suave' | 'invertido';

export const PAPER_LABELS: Record<PaperMode, string> = {
  natural: 'Natural',
  suave: 'Suave',
  invertido: 'Invertido',
};

const KEYS = {
  paper: 'vuelo:papel',
  sound: 'vuelo:sonido',
  gestureHint: 'vuelo:pista-gestos',
  highlightColor: 'vuelo:color-subrayado',
} as const;

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento: la preferencia dura lo que la sesión.
  }
};

/** "Invertido" solo tiene sentido de noche. */
export const paperModesFor = (theme: Theme): PaperMode[] =>
  theme === 'noche' ? ['natural', 'suave', 'invertido'] : ['natural', 'suave'];

const DEFAULT_PAPER: Record<Theme, PaperMode> = { dia: 'natural', sepia: 'suave', noche: 'suave' };

/*
 * Decisión: el modo de papel se guarda GLOBAL y POR TEMA, no por libro.
 * Depende de la luz del entorno y del cansancio de la vista, no del libro: quien lee de
 * noche con "Invertido" lo quiere en todos sus libros, y al pasar a Día debe volver lo
 * que eligió para Día (guardarlo por tema evita arrastrar "Invertido" a un tema claro).
 */
export function getPaperMode(theme: Theme): PaperMode {
  let stored: Partial<Record<Theme, PaperMode>> = {};
  try {
    stored = JSON.parse(read(KEYS.paper) ?? '{}') as Partial<Record<Theme, PaperMode>>;
  } catch {
    stored = {};
  }
  const mode = stored[theme];
  return mode && paperModesFor(theme).includes(mode) ? mode : DEFAULT_PAPER[theme];
}

export function setPaperMode(theme: Theme, mode: PaperMode) {
  let stored: Partial<Record<Theme, PaperMode>> = {};
  try {
    stored = JSON.parse(read(KEYS.paper) ?? '{}') as Partial<Record<Theme, PaperMode>>;
  } catch {
    stored = {};
  }
  write(KEYS.paper, JSON.stringify({ ...stored, [theme]: mode }));
}

/** Sonido: encendido por defecto en escritorio, apagado en táctil/móvil. */
export function getSoundEnabled(): boolean {
  const v = read(KEYS.sound);
  if (v === 'on') return true;
  if (v === 'off') return false;
  return !window.matchMedia('(pointer: coarse)').matches;
}
export const setSoundEnabled = (on: boolean) => write(KEYS.sound, on ? 'on' : 'off');

export const gestureHintSeen = () => read(KEYS.gestureHint) === '1';
export const markGestureHintSeen = () => write(KEYS.gestureHint, '1');

/** Último color de subrayado usado (preferencia global). */
export function getHighlightColor(): HighlightColor {
  const v = read(KEYS.highlightColor);
  return isHighlightColor(v) ? v : 'amarillo';
}
export const setHighlightColor = (c: HighlightColor) => write(KEYS.highlightColor, c);

// ── EPUB: tamaño y tipo de letra (preferencias globales, como el papel y el sonido) ──
const EPUB_KEYS = { size: 'vuelo:epub-tamano', font: 'vuelo:epub-fuente' } as const;

export function getEpubFontSize(): number {
  const n = Number(read(EPUB_KEYS.size));
  return Number.isFinite(n) && n > 0 ? clampEpubFont(n) : 100;
}
export const setEpubFontSize = (pct: number) => write(EPUB_KEYS.size, String(clampEpubFont(pct)));

export function getEpubFont(): EpubFont {
  return read(EPUB_KEYS.font) === 'sans' ? 'sans' : 'serif';
}
export const setEpubFont = (f: EpubFont) => write(EPUB_KEYS.font, f);
