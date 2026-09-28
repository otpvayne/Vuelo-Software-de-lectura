import type { Highlight } from './db';

const EMPTY: readonly Highlight[] = Object.freeze([]);

/**
 * Subrayados del libro abierto, fuera de React.
 * Cada página se suscribe y obtiene SU lista (misma referencia mientras no cambie): crear,
 * recolorear o borrar un subrayado re-renderiza solo esa página, no las N del flip, y nunca
 * toca la caché de canvas.
 */
export class HighlightBook {
  private byPage = new Map<number, readonly Highlight[]>();
  private listeners = new Set<() => void>();
  /** Id recién creado: su capa lo "pinta" con animación una vez. */
  freshId: string | null = null;
  private allCache: readonly Highlight[] | null = null;

  constructor(initial: Highlight[] = []) {
    this.reset(initial);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  forPage = (page: number): readonly Highlight[] => this.byPage.get(page) ?? EMPTY;

  /** Todos, por página y fecha (para el panel). Referencia estable entre cambios. */
  all = (): readonly Highlight[] => {
    this.allCache ??= [...this.byPage.values()]
      .flat()
      .sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
    return this.allCache;
  };

  get(id: string): Highlight | undefined {
    for (const list of this.byPage.values()) {
      const h = list.find((x) => x.id === id);
      if (h) return h;
    }
    return undefined;
  }

  reset(list: Highlight[]) {
    this.byPage.clear();
    for (const h of list) this.put(h, false);
    this.emit();
  }

  upsert(h: Highlight, fresh = false) {
    if (fresh) this.freshId = h.id;
    this.put(h, true);
    this.emit();
  }

  update(id: string, patch: Partial<Highlight>) {
    const h = this.get(id);
    if (h) this.upsert({ ...h, ...patch });
  }

  remove(id: string) {
    const h = this.get(id);
    if (!h) return;
    const list = (this.byPage.get(h.page) ?? EMPTY).filter((x) => x.id !== id);
    if (list.length) this.byPage.set(h.page, list);
    else this.byPage.delete(h.page);
    this.emit();
  }

  private put(h: Highlight, replace: boolean) {
    const current = this.byPage.get(h.page) ?? EMPTY;
    const rest = replace ? current.filter((x) => x.id !== h.id) : current;
    // Orden por fecha: el más reciente queda encima en el DOM y gana al tocar si se solapan.
    this.byPage.set(h.page, [...rest, h].sort((a, b) => a.createdAt - b.createdAt));
  }

  private emit() {
    this.allCache = null;
    for (const fn of this.listeners) fn();
  }
}
