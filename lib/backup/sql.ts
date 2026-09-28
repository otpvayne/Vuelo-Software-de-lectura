import type { RestoreOps } from '../db';

/**
 * Literal SQL seguro. Los respaldos son datos externos: todo valor se valida y se escapa.
 * (tauri-plugin-sql no admite parámetros en una ejecución con varias sentencias, y la
 * restauración debe ir en UNA ejecución para que BEGIN…COMMIT use una sola conexión.)
 */
export function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('Número no válido en el respaldo');
    return String(v);
  }
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'string') {
    if (v.includes('\u0000')) throw new Error('Texto con carácter nulo en el respaldo');
    return `'${v.replace(/'/g, "''")}'`;
  }
  throw new Error('Tipo de dato no válido en el respaldo');
}

const ROWS_PER_INSERT = 200;

function insert(table: string, columns: string[], rows: unknown[][], onConflict: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const values = rows
      .slice(i, i + ROWS_PER_INSERT)
      .map((r) => `(${r.map(sqlLiteral).join(', ')})`)
      .join(',\n');
    out.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${values}\n${onConflict};`);
  }
  return out;
}

const updateAll = (cols: string[]) => `ON CONFLICT(id) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}`;

/**
 * Toda la restauración como un único script transaccional. Se usan UPSERT (ON CONFLICT DO
 * UPDATE) y nunca REPLACE: REPLACE borra la fila y, con claves foráneas activas, arrastraría
 * en cascada los apuntes y subrayados del libro.
 */
export function buildRestoreSql(ops: RestoreOps): string {
  const s: string[] = ['BEGIN IMMEDIATE;'];
  if (ops.replaceAll) {
    s.push(
      'DELETE FROM reading_sessions;',
      'DELETE FROM highlights;',
      'DELETE FROM notes;',
      'DELETE FROM bookmarks;',
      'DELETE FROM books;',
    );
  }
  const bookCols = ['id', 'title', 'author', 'file_path', 'page_count', 'current_page', 'progress', 'cover', 'added_at', 'last_opened_at', 'file_name'];
  s.push(
    ...insert(
      'books',
      bookCols,
      ops.books.map((b) => [b.id, b.title, b.author, b.filePath, b.pageCount, b.currentPage, b.progress, b.cover, b.addedAt, b.lastOpenedAt, b.fileName]),
      updateAll(bookCols.slice(1)),
    ),
  );
  const noteCols = ['id', 'book_id', 'page', 'content', 'created_at', 'updated_at'];
  s.push(
    ...insert(
      'notes',
      noteCols,
      ops.notes.map((n) => [n.id, n.bookId, n.page, n.content, n.createdAt, n.updatedAt]),
      updateAll(['page', 'content', 'updated_at']),
    ),
  );
  const hlCols = ['id', 'book_id', 'page', 'rects', 'color', 'text', 'note', 'created_at'];
  s.push(
    ...insert(
      'highlights',
      hlCols,
      ops.highlights.map((h) => [h.id, h.bookId, h.page, JSON.stringify(h.rects), h.color, h.text, h.note, h.createdAt]),
      updateAll(['page', 'rects', 'color', 'text', 'note']),
    ),
  );
  // Marcadores: únicos por (libro, página) → si ya existe, se deja el actual.
  s.push(
    ...insert(
      'bookmarks',
      ['id', 'book_id', 'page', 'label', 'created_at'],
      ops.bookmarks.map((b) => [b.id, b.bookId, b.page, b.label, b.createdAt]),
      'ON CONFLICT DO NOTHING',
    ),
  );
  const sesCols = ['id', 'book_id', 'started_at', 'ended_at', 'seconds_active', 'pages_read', 'day'];
  s.push(
    ...insert(
      'reading_sessions',
      sesCols,
      ops.sessions.map((x) => [x.id, x.bookId, x.startedAt, x.endedAt, Math.round(x.secondsActive), x.pagesRead, x.day]),
      updateAll(sesCols.slice(2)),
    ),
  );
  s.push('COMMIT;');
  return s.join('\n');
}
