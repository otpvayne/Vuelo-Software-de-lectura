'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';

const COUNT = 22;

/** Pseudoaleatorio determinista: mismas estrellas en el prerender y en el cliente. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260927);
const STARS = Array.from({ length: COUNT }, () => ({
  left: rand() * 100,
  top: rand() * 70,
  size: rand() < 0.2 ? 3 : rand() < 0.6 ? 2 : 1.5,
  duration: 4 + rand() * 5,
  delay: -rand() * 8,
}));

/**
 * Unas pocas estrellas tenues en el fondo. Solo se ven en el tema noche (CSS en globals.css).
 * Animación con CSS (opacidad, sin layout) para no pesar; se detiene con movimiento reducido.
 */
export default function NightSky() {
  const reduce = useReducedMotion();
  // Se decide tras montar: en el prerender no se conoce la preferencia y un className distinto
  // provocaría un desajuste de hidratación (React conservaría el del servidor).
  const [twinkle, setTwinkle] = useState(false);
  useEffect(() => setTwinkle(reduce === false), [reduce]);
  return (
    <div aria-hidden className={`cielo pointer-events-none fixed inset-0 z-0 ${twinkle ? 'titila' : ''}`}>
      {STARS.map((s, i) => (
        <span
          key={i}
          style={
            {
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: s.size,
              height: s.size,
              '--d': `${s.duration}s`,
              '--r': `${s.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
