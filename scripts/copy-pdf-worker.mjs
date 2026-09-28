// Copia el worker de pdfjs-dist a /public para servirlo como archivo estático
// (mismo origen en `next dev`, en el export y dentro de Tauri).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
const dest = join(root, 'public', 'pdf.worker.min.mjs');

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log('[vuelo] pdf.worker.min.mjs → public/');
