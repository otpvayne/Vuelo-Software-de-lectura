import type { ReadingSession } from './db';
import { dayKey, nextMidnight } from './days';

/** Sin interacción durante este tiempo, el reloj se pausa. */
export const IDLE_MS = 60_000;
/** Sesiones más cortas no se guardan. */
export const MIN_SESSION_SECONDS = 10;
/** Oculta más tiempo que esto: al volver empieza una sesión nueva. */
export const HIDDEN_ENDS_SESSION_MS = 5 * 60_000;
/**
 * Mientras se lee se guarda como mucho con esta frecuencia (nunca en cada giro de página).
 * Es un upsert por id con el total acumulado: guardar dos veces no duplica segundos.
 */
export const SAVE_EVERY_MS = 10_000;
const TICK_MS = 1_000;

/**
 * Reloj de la app. En desarrollo, las pruebas pueden desplazarlo con
 * `window.__vueloReloj = ms` para simular pausas largas o la medianoche.
 */
export function now(): number {
  const offset =
    process.env.NODE_ENV !== 'production'
      ? ((globalThis as unknown as { __vueloReloj?: number }).__vueloReloj ?? 0)
      : 0;
  return Date.now() + offset;
}

interface Current {
  id: string;
  startedAt: number;
  day: string;
  activeMs: number;
  pages: Set<number>;
}

/**
 * Registro de una visita al lector.
 * - Cuenta solo tiempo ACTIVO: se pausa tras 60 s sin teclado/puntero/cambio de página o
 *   con la ventana oculta.
 * - Solo se guarda si hubo navegación (abrir un libro sin moverse no cuenta) y si dura
 *   al menos 10 s.
 * - Si cambia el día con la app abierta, la sesión se parte en la medianoche local.
 */
export class ReadingSessionTracker {
  private cur: Current;
  private navigated = false;
  private lastActivity: number;
  private lastTick: number;
  private hidden = false;
  private hiddenAt = 0;
  private lastSave = 0;
  private currentPage: number;
  private interval: ReturnType<typeof setInterval> | undefined;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly bookId: string,
    startPage: number,
    private readonly save: (s: ReadingSession) => Promise<void>,
  ) {
    const t = now();
    this.currentPage = startPage;
    this.lastActivity = t;
    this.lastTick = t;
    this.cur = this.fresh(t);
  }

  start() {
    const opts = { passive: true } as const;
    for (const type of ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'] as const) {
      window.addEventListener(type, this.onActivity, opts);
    }
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onLeave);
    window.addEventListener('beforeunload', this.onLeave);
    // Page Lifecycle (Android/Chromium): la página puede congelarse sin llegar a ocultarse.
    document.addEventListener('freeze', this.onLeave);
    this.hidden = document.visibilityState === 'hidden';
    this.interval = setInterval(() => this.tick(), TICK_MS);
  }

  /** Cierra la sesión (al salir del lector) y quita todos los listeners. */
  stop(): Promise<void> {
    clearInterval(this.interval);
    for (const type of ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'] as const) {
      window.removeEventListener(type, this.onActivity);
    }
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onLeave);
    window.removeEventListener('beforeunload', this.onLeave);
    document.removeEventListener('freeze', this.onLeave);
    this.tick();
    this.persist(now());
    return this.queue;
  }

  /** Guarda ya lo acumulado y espera a que se escriba (p. ej. antes de cerrar la ventana). */
  flush(): Promise<void> {
    this.tick();
    this.persist(now());
    return this.queue;
  }

  /** Página real de partida (el flip puede ajustar la pedida a su doble página). No es navegación. */
  rebase(page: number) {
    if (this.navigated) return;
    this.currentPage = page;
    this.cur.pages = new Set([page]);
  }

  /** Cambio de página (no escribe en la base). */
  pageView(page: number) {
    if (page !== this.currentPage) this.navigated = true;
    this.currentPage = page;
    this.cur.pages.add(page);
    this.activity();
  }

  /** Avanza el reloj: cuenta tiempo activo, parte en medianoche y guarda de vez en cuando. */
  tick() {
    const t = now();
    if (!this.hidden) {
      let from = this.lastTick;
      // Medianoche(s) entre el último tic y ahora: cerrar la sesión del día anterior.
      while (dayKey(from) !== dayKey(t)) {
        const midnight = nextMidnight(from);
        this.count(from, midnight);
        this.persist(midnight);
        this.cur = this.fresh(midnight);
        from = midnight;
      }
      this.count(from, t);
    }
    this.lastTick = t;
    if (t - this.lastSave >= SAVE_EVERY_MS) this.persist(t);
  }

  /** Estado para pruebas y depuración. */
  snapshot() {
    return {
      id: this.cur.id,
      day: this.cur.day,
      seconds: Math.round(this.cur.activeMs / 1000),
      pages: this.cur.pages.size,
      navigated: this.navigated,
      paused: this.hidden || now() - this.lastActivity >= IDLE_MS,
      hidden: this.hidden,
    };
  }

  private fresh(t: number): Current {
    return { id: crypto.randomUUID(), startedAt: t, day: dayKey(t), activeMs: 0, pages: new Set([this.currentPage]) };
  }

  /** Suma el tramo [from, to] recortado a 60 s tras la última interacción. */
  private count(from: number, to: number) {
    const until = Math.min(to, this.lastActivity + IDLE_MS);
    if (until > from) this.cur.activeMs += until - from;
  }

  private activity() {
    const t = now();
    // Tras una pausa, el tiempo inactivo no cuenta: se reanuda desde ahora.
    if (t - this.lastActivity >= IDLE_MS) {
      this.tick();
      this.lastTick = t;
    }
    this.lastActivity = t;
  }

  private persist(endedAt: number) {
    this.lastSave = now();
    if (!this.navigated || this.cur.activeMs < MIN_SESSION_SECONDS * 1000) return;
    const s: ReadingSession = {
      id: this.cur.id,
      bookId: this.bookId,
      startedAt: this.cur.startedAt,
      endedAt,
      secondsActive: Math.round(this.cur.activeMs / 1000),
      pagesRead: this.cur.pages.size,
      day: this.cur.day,
    };
    // En cola: nunca dos escrituras de la misma sesión a la vez.
    this.queue = this.queue.then(() => this.save(s)).catch((err: unknown) => console.error('Sesión de lectura:', err));
  }

  private onActivity = () => this.activity();

  private onVisibility = () => {
    const t = now();
    if (document.visibilityState === 'hidden') {
      this.tick();
      this.hidden = true;
      this.hiddenAt = t;
      this.persist(t);
      return;
    }
    this.hidden = false;
    if (t - this.hiddenAt > HIDDEN_ENDS_SESSION_MS) {
      // Ausencia larga: la sesión anterior ya se guardó al ocultarse; empieza otra.
      this.cur = this.fresh(t);
    }
    this.lastTick = t;
    this.lastActivity = t;
  };

  private onLeave = () => {
    this.tick();
    this.persist(now());
  };
}
