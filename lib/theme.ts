import { STORAGE_KEYS, THEMES, THEME_TRANSITION_MS, type Theme } from './constants';

export const isTheme = (value: unknown): value is Theme =>
  typeof value === 'string' && (THEMES as readonly string[]).includes(value);

export function getStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEYS.theme);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'noche' : 'dia';
}

export function getCurrentTheme(): Theme {
  const attr = document.documentElement.dataset.theme;
  return isTheme(attr) ? attr : getStoredTheme() ?? getSystemTheme();
}

let transitionTimer: ReturnType<typeof setTimeout> | undefined;

/** Aplica el tema con transición suave de colores y lo persiste. */
export function setTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.add('tema-en-transicion');
  root.dataset.theme = theme;
  clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => root.classList.remove('tema-en-transicion'), THEME_TRANSITION_MS);
  try {
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  } catch {
    // Almacenamiento no disponible: el tema dura lo que la sesión.
  }
  window.dispatchEvent(new CustomEvent<Theme>('vuelo:tema', { detail: theme }));
}

export function nextTheme(theme: Theme): Theme {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] ?? 'dia';
}

/**
 * Script inline para <head>: fija data-theme antes del primer pintado (sin flash).
 * Debe ser autocontenido: no puede importar nada.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEYS.theme,
)});if(${JSON.stringify(THEMES)}.indexOf(t)<0){t=matchMedia('(prefers-color-scheme: dark)').matches?'noche':'dia'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='dia'}})();`;
