import { HIGHLIGHT_META, type HighlightColor } from './constants';
import type { Book, Bookmark, Highlight, Note } from './db';

export type NotebookKind = 'subrayado' | 'apunte' | 'marcador';

export type NotebookItem =
  | { kind: 'subrayado'; id: string; page: number; createdAt: number; highlight: Highlight }
  | { kind: 'apunte'; id: string; page: number; createdAt: number; note: Note }
  | { kind: 'marcador'; id: string; page: number; createdAt: number; bookmark: Bookmark };

export interface NotebookPage {
  page: number;
  items: NotebookItem[];
}

export interface NotebookFilter {
  kinds: ReadonlySet<NotebookKind>;
  colors: ReadonlySet<HighlightColor>;
  query: string;
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Reúne subrayados, apuntes y marcadores por página (páginas y entradas ordenadas). */
export function buildNotebook(highlights: readonly Highlight[], notes: Note[], bookmarks: Bookmark[]): NotebookItem[] {
  const items: NotebookItem[] = [
    ...highlights.map((h) => ({ kind: 'subrayado' as const, id: h.id, page: h.page, createdAt: h.createdAt, highlight: h })),
    ...notes.map((n) => ({ kind: 'apunte' as const, id: n.id, page: n.page, createdAt: n.createdAt, note: n })),
    ...bookmarks.map((b) => ({ kind: 'marcador' as const, id: b.id, page: b.page, createdAt: b.createdAt, bookmark: b })),
  ];
  // Dentro de la página: marcador primero, luego por fecha.
  const order: Record<NotebookKind, number> = { marcador: 0, subrayado: 1, apunte: 1 };
  return items.sort((a, b) => a.page - b.page || order[a.kind] - order[b.kind] || a.createdAt - b.createdAt);
}

export function filterNotebook(items: NotebookItem[], f: NotebookFilter): NotebookItem[] {
  const q = fold(f.query.trim());
  return items.filter((it) => {
    if (!f.kinds.has(it.kind)) return false;
    if (it.kind === 'subrayado' && f.colors.size && !f.colors.has(it.highlight.color)) return false;
    if (it.kind !== 'subrayado' && f.colors.size && f.colors.size < 4) return false;
    if (!q) return true;
    const text =
      it.kind === 'subrayado'
        ? `${it.highlight.text ?? ''} ${it.highlight.note ?? ''}`
        : it.kind === 'apunte'
          ? it.note.content
          : `marcador ${it.bookmark.label ?? ''}`;
    return fold(text).includes(q);
  });
}

export function groupByPage(items: NotebookItem[]): NotebookPage[] {
  const pages: NotebookPage[] = [];
  for (const it of items) {
    const last = pages[pages.length - 1];
    if (last && last.page === it.page) last.items.push(it);
    else pages.push({ page: it.page, items: [it] });
  }
  return pages;
}

const quote = (s: string) =>
  s
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');

/** Markdown del cuaderno: título, página, color con su sentido y notas. */
export function notebookToMarkdown(book: Pick<Book, 'title' | 'author'>, items: NotebookItem[], exportedAt = new Date()): string {
  const date = exportedAt.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
  const lines: string[] = [`# ${book.title} — Cuaderno`, ''];
  lines.push(`${book.author ? `*${book.author}* · ` : ''}Exportado desde Vuelo el ${date}`, '');
  for (const { page, items: its } of groupByPage(items)) {
    lines.push(`## Página ${page}`, '');
    for (const it of its) {
      if (it.kind === 'subrayado') {
        const meta = HIGHLIGHT_META[it.highlight.color];
        lines.push(quote(it.highlight.text ?? ''), `> — Subrayado ${meta.label.toLowerCase()} · ${meta.meaning}`);
        if (it.highlight.note) lines.push('', `**Nota:** ${it.highlight.note}`);
        lines.push('');
      } else if (it.kind === 'apunte') {
        lines.push(`- **Apunte:** ${it.note.content.replace(/\n+/g, ' ')}`, '');
      } else {
        lines.push(`- Marcador${it.bookmark.label ? `: ${it.bookmark.label}` : ''}`, '');
      }
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export const notebookFileName = (title: string) =>
  `${fold(title)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'cuaderno'}-cuaderno.md`;
