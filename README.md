# Vuelo

> Cada página, un viaje.

Lector de PDF de escritorio (y Android) hecho con Next.js 14 (export estático) + Tauri v2.

## Desarrollo

```bash
npm install          # copia también el worker de pdfjs a /public
npm run dev          # UI en el navegador (persistencia en IndexedDB)
npm run tauri dev    # app nativa (persistencia en SQLite + archivos en AppData)
npm run build        # export estático en ./out
npm run tauri build  # instalable
```

Requisitos para Tauri en Windows: [Rust (rustup)](https://rustup.rs/) y
[Visual Studio Build Tools](https://aka.ms/vs/17/release/vs_BuildTools.exe) con "Desktop development with C++".

## Scripts

| Script | Qué hace |
| --- | --- |
| `typecheck` | `tsc --noEmit` |
| `reset-db` | Borra `vuelo.db` y los PDF importados del directorio de la app (`-- --keep-files` para conservar los PDF). En navegador: DevTools → Application → Clear site data. |

## Notas de arquitectura

- **Persistencia** (`lib/db.ts`): misma interfaz `VueloStore` con dos backends. SQLite si `isTauri()`, IndexedDB si no. Las migraciones son un array `MIGRATIONS` versionado con `PRAGMA user_version` (e igual versión en IndexedDB). No edites una migración publicada: añade otra.
- **Subrayados**: `rects` se guardan como proporciones 0-1 de la página, independientes del zoom.
- **Visor**: la ruta es `/lector/?id=<uuid>`. Con `output: 'export'` no hay rutas dinámicas en runtime (los id viven en la base local), por eso no se usa `lector/[id]`.
- **pdfjs**: el worker se sirve desde `/pdf.worker.min.mjs` (mismo origen en dev, export y Tauri).
- **Temas**: tokens en `app/globals.css` por `[data-theme]` (`dia`, `sepia`, `noche`). Prohibido HEX en JSX — lo impone ESLint.
- **Íconos**: `npm run tauri icon ./assets/app-icon.png`. Fuentes SVG en `assets/`.
