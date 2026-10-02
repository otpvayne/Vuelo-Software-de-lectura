'use client';

import { useCallback, useRef, useState } from 'react';
import { getStore, type Book } from '@/lib/db';
import { isEpub, readEpubInfo } from '@/lib/epub';
import { readPdfInfo } from '@/lib/pdf';

export interface ImportProgress {
  /** 1-based: el archivo que se está procesando. */
  current: number;
  total: number;
  fileName: string;
}

export interface ImportNotice {
  id: string;
  kind: 'duplicado' | 'error' | 'listo';
  text: string;
}

export const titleFromFile = (name: string) => name.replace(/\.(pdf|epub)$/i, '').replace(/[_-]+/g, ' ').trim();

export const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

/** Libros que Vuelo sabe abrir: PDF y EPUB. */
export const isBookFile = (file: File) => isPdf(file) || isEpub(file);

/**
 * Mismo libro = mismo formato, mismo número de páginas (en EPUB, estimadas a partir del texto, así que
 * también cambian si el contenido cambia) y mismo nombre de archivo
 * (o, para libros importados antes de guardar el nombre, mismo título).
 */
export function findDuplicate(
  books: Book[],
  fileName: string,
  title: string,
  pageCount: number,
  format: Book['format'] = 'pdf',
) {
  return books.find(
    (b) =>
      b.format === format &&
      b.pageCount === pageCount &&
      (b.fileName === fileName || (b.fileName === null && b.title.toLowerCase() === title.toLowerCase())),
  );
}

/** Cola de importación de PDF y EPUB con progreso y avisos. Compartida por el botón y el soltar-archivos. */
export function useBookImport(onAdded: (book: Book) => void) {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [notices, setNotices] = useState<ImportNotice[]>([]);
  const queue = useRef<File[]>([]);
  const running = useRef(false);
  const counts = useRef({ done: 0, total: 0 });
  const onAddedRef = useRef(onAdded);
  onAddedRef.current = onAdded;

  const notify = useCallback((kind: ImportNotice['kind'], text: string) => {
    setNotices((prev) => [...prev.slice(-3), { id: crypto.randomUUID(), kind, text }]);
  }, []);

  const dismiss = useCallback((id: string) => setNotices((prev) => prev.filter((n) => n.id !== id)), []);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    let added = 0;
    try {
      const store = await getStore();
      let file: File | undefined;
      while ((file = queue.current.shift())) {
        counts.current.done += 1;
        setProgress({ current: counts.current.done, total: counts.current.total, fileName: file.name });
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const format = isEpub(file) ? 'epub' : 'pdf';
          const info = format === 'epub' ? await readEpubInfo(bytes) : await readPdfInfo(bytes);
          const title = info.title ?? titleFromFile(file.name);
          const existing = findDuplicate(await store.listBooks(), file.name, title, info.pageCount, format);
          if (existing) {
            notify('duplicado', `“${existing.title}” ya está en tu estantería.`);
            continue;
          }
          const book = await store.addBook(
            { title, author: info.author, pageCount: info.pageCount, cover: info.cover, fileName: file.name, format },
            bytes,
          );
          added += 1;
          onAddedRef.current(book);
        } catch (err) {
          console.error(err);
          notify('error', `No pudimos abrir “${file.name}”. ¿Está dañado o protegido?`);
        }
      }
    } finally {
      running.current = false;
      counts.current = { done: 0, total: 0 };
      setProgress(null);
      if (added > 1) notify('listo', `${added} libros nuevos en tu estantería.`);
    }
  }, [notify]);

  const importFiles = useCallback(
    (files: File[]) => {
      const books = files.filter(isBookFile);
      const skipped = files.length - books.length;
      if (skipped > 0) {
        notify('error', skipped === 1 ? 'Ese archivo no es un PDF ni un EPUB.' : `${skipped} archivos no eran PDF ni EPUB.`);
      }
      if (!books.length) return;
      queue.current.push(...books);
      counts.current.total += books.length;
      void run();
    },
    [notify, run],
  );

  return { importFiles, progress, notices, dismiss, busy: progress !== null };
}
