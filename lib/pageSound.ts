/**
 * Sonido de hoja generado con Web Audio: ruido filtrado con envolvente corta.
 * Sin archivos ni recursos externos. El AudioContext solo se crea/reanuda dentro de
 * un gesto del usuario (unlock), como exigen las políticas de autoplay.
 */
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function noiseBuffer(context: AudioContext) {
  const length = Math.floor(context.sampleRate * 0.45);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  // Ruido "marrón" suave: menos siseo que el blanco, más parecido al papel.
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.035 * white) / 1.035;
    data[i] = last * 3.2 + white * 0.18;
  }
  return buffer;
}

/**
 * Llamar desde un gesto (pointerdown/keydown). Idempotente.
 * Crear el AudioContext cuesta ~100 ms en WebView2 (inicializa el dispositivo de audio).
 * Tras el primer gesto la página tiene "activación persistente", así que se puede crear
 * un momento después, en un hueco libre, sin frenar el primer paso de página.
 */
export function unlockPageSound() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  if ('requestIdleCallback' in window) window.requestIdleCallback(createContext, { timeout: 1200 });
  else setTimeout(createContext, 250);
}

function createContext() {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      noise = noiseBuffer(ctx);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** Reproduce un pasar de hoja. No hace nada si el audio aún no se desbloqueó. */
export function playPageTurn() {
  if (!ctx || !noise || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.9 + Math.random() * 0.25;

  // Barrido de banda: el "fsss" del papel que se desliza.
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 0.9;
  band.frequency.setValueAtTime(3200, t);
  band.frequency.exponentialRampToValueAtTime(900, t + 0.32);

  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 350;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.11, t + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.05, t + 0.16);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);

  src.connect(band).connect(high).connect(gain).connect(ctx.destination);
  src.start(t);
  src.stop(t + 0.42);
}
