'use client';

import { useEffect, useState } from 'react';

const results = new Map<string, boolean>();

/** Luminancia media > 0.8 y más del 60 % de píxeles claros: una página 1 casi en blanco. */
function isMostlyWhite(img: HTMLImageElement): boolean {
  const w = 24;
  const h = 32;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) return false;
  g.drawImage(img, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h).data;
  let sum = 0;
  let light = 0;
  for (let i = 0; i < data.length; i += 4) {
    const l = (0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0)) / 255;
    sum += l;
    if (l > 0.85) light += 1;
  }
  const n = data.length / 4;
  return sum / n > 0.8 && light / n > 0.6;
}

/**
 * ¿La portada es casi blanca? (típico cuando la portada es la página 1 de un PDF de texto).
 * Se usa para ponerle un velo en Sepia/Noche y que no deslumbre entre los demás libros.
 * El resultado se memoriza por libro.
 */
export function useLightCover(key: string, src: string | null): boolean {
  const [light, setLight] = useState(() => results.get(key) ?? false);

  useEffect(() => {
    if (!src) return setLight(false);
    const known = results.get(key);
    if (known !== undefined) return setLight(known);
    let alive = true;
    const img = new Image();
    img.onload = () => {
      const value = isMostlyWhite(img);
      results.set(key, value);
      if (alive) setLight(value);
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [key, src]);

  return light;
}
