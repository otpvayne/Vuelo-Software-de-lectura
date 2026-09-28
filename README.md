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
| `reset-db` | Borra `vuelo.db` y los PDF importados. Flags: `--keep-files` (conserva los PDF), `--webview` (también tema/onboarding, solo Windows), `--dry-run`. En navegador: DevTools → Application → Clear site data. |

## Notas de arquitectura

- **Persistencia** (`lib/db.ts`): misma interfaz `VueloStore` con dos backends. SQLite si `isTauri()`, IndexedDB si no. Las migraciones son un array `MIGRATIONS` versionado con `PRAGMA user_version` (e igual versión en IndexedDB). No edites una migración publicada: añade otra.
- **Importar libros**: botón (varios PDF) o arrastrar y soltar sobre la ventana. Se usan eventos HTML5 con `dragDropEnabled: false` en la ventana de Tauri: WebView2 entrega los `File` y no hace falta dar a `fs` acceso a rutas del usuario. Duplicado = mismo nombre de archivo (migración 2, `file_name`) y mismo número de páginas.
- **Progreso**: se calcula con la última página visible (en doble página, la derecha), así un libro puede llegar al 100 %.
- **Subrayados**: `rects` se guardan como proporciones 0-1 de la página, independientes del zoom.
- **Visor**: la ruta es `/lector/?id=<uuid>`. Con `output: 'export'` no hay rutas dinámicas en runtime (los id viven en la base local), por eso no se usa `lector/[id]`.
- **pdfjs**: el worker se sirve desde `/pdf.worker.min.mjs` (mismo origen en dev, export y Tauri).
- **Temas**: tokens en `app/globals.css` por `[data-theme]` (`dia`, `sepia`, `noche`). Prohibido HEX en JSX — lo impone ESLint.
- **Íconos**: `npm run tauri icon ./assets/app-icon.png`. Fuentes SVG en `assets/`.

## Datos en disco (Windows, verificado)

| Qué | Dónde |
| --- | --- |
| Base SQLite (modo WAL) | `%APPDATA%\com.netrix.vuelo\vuelo.db` |
| PDF importados | `%APPDATA%\com.netrix.vuelo\books\<id>.pdf` |
| localStorage del webview (tema, onboarding) | `%LOCALAPPDATA%\com.netrix.vuelo\EBWebView` |
| App instalada (NSIS, por usuario) | `%LOCALAPPDATA%\Vuelo` |

El localStorage depende del origen: en `tauri dev` es `http://localhost:3000` y en el build `http://tauri.localhost`, así que tema y onboarding no se comparten entre ambos.

## Seguridad (CSP)

Definida en `src-tauri/tauri.conf.json`. Tauri añade automáticamente los hashes sha256 de los `<script>` inline del export de Next.
Solo se aplica en el build empaquetado; en `tauri dev` la página la sirve el dev server de Next.

- `script-src 'self'` · sin `'unsafe-eval'` (pdfjs v6 no usa eval; sin `wasmUrl` no carga wasm).
- `worker-src 'self'` · el worker de pdfjs se sirve desde el propio bundle.
- `img-src 'self' data:` · portadas guardadas como data URL.
- `style-src 'self' 'unsafe-inline'` · motion inyecta `<style>` en `AnimatePresence mode="popLayout"`.
- `connect-src 'self' ipc: http://ipc.localhost` · IPC de Tauri. Nada externo.
- `object-src`, `base-uri`, `form-action`, `frame-ancestors`: `'none'`.

## Instalador sin firmar

Los `.exe` no están firmados. Con Smart App Control / Control de aplicaciones de Windows activo, un instalador recién compilado puede quedar bloqueado. Para distribuir, firma el binario (`bundle.windows.certificateThumbprint` o `signCommand`).
