export const APP_NAME = 'Vuelo';
export const TAGLINE = 'Cada página, un viaje.';

/** Ruta de conexión de tauri-plugin-sql (relativa a app_config_dir). */
export const SQLITE_URL = 'sqlite:vuelo.db';
/** Nombre de la base IndexedDB usada como fallback en navegador. */
export const IDB_NAME = 'vuelo';
/** Carpeta (dentro de AppData) donde se guardan los PDF importados en Tauri. */
export const BOOKS_DIR = 'books';

/** Worker de pdfjs servido desde /public (ver scripts/copy-pdf-worker.mjs). */
export const PDF_WORKER_SRC = '/pdf.worker.min.mjs';

export const STORAGE_KEYS = {
  theme: 'vuelo:tema',
  onboarded: 'vuelo:onboarding-visto',
} as const;

export const THEMES = ['dia', 'sepia', 'noche'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  dia: 'Día',
  sepia: 'Sepia',
  noche: 'Noche',
};

/** Colores de subrayado: nombres de token (--hl-<color> en globals.css), nunca HEX. */
export const HIGHLIGHT_COLORS = ['amarillo', 'verde', 'azul', 'rosa'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export const HIGHLIGHT_META: Record<HighlightColor, { label: string; meaning: string }> = {
  amarillo: { label: 'Amarillo', meaning: 'Importante' },
  verde: { label: 'Verde', meaning: 'Idea' },
  azul: { label: 'Azul', meaning: 'Duda' },
  rosa: { label: 'Rosa', meaning: 'Frase favorita' },
};

export const isHighlightColor = (v: unknown): v is HighlightColor =>
  typeof v === 'string' && (HIGHLIGHT_COLORS as readonly string[]).includes(v);

export const THEME_TRANSITION_MS = 450;
