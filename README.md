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
- **Lector**: las páginas se suscriben a una señal externa (`ReaderSignal`) en vez de recibir props, y react-pageflip usa `renderOnlyPageLengthChange`: pasar página no reprocesa las N páginas. `PageCache` guarda canvas ya pintados por página y ancho, los mueve entre huecos sin volver a pintarlos y libera los lejanos.
- **Zoom**: react-pageflip no admite zoom (tamaño fijo y coordenadas sin escalar). Con zoom > 100 % se muestra una vista estática de la doble página con desplazamiento por arrastre; el flip queda montado y oculto y, al volver a 100 %, salta con `turnToPage` a la página navegada.
- **Papel** (Natural / Suave / Invertido): global y por tema en `localStorage` (depende de la luz, no del libro).
- **Subrayados**: herramienta explícita (H). react-pageflip captura el ratón, así que al activarla se usa la vista estática (la del zoom) con la capa de texto de pdfjs v6 encima; al soltar la selección se crea el subrayado. `rects` se guardan como proporciones 0-1 de la página (fusionados por línea) y se pintan en %, así que coinciden a cualquier tamaño y zoom. Viven en un store externo (`HighlightBook`): cambiar uno re-renderiza solo su página y nunca repinta la caché de canvas.
- **page-flip escucha el ratón en `window`**: mientras se ve la vista estática sus manejadores se desconectan (si no, soltar cerca de una esquina pasaba la hoja del libro oculto), y un toque quieto sobre un subrayado no llega a page-flip (su "esquina" mide diagonal/5, ~170 px).
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

## Cuaderno, viaje de lectura y metas

- **Sesiones** (`lib/readingSessions.ts`, migración 4 `reading_sessions`): solo tiempo activo. Se pausa tras 60 s sin teclado/puntero/cambio de página o con la ventana oculta; se parte en la medianoche local; se guarda cada 20 s como máximo y al ocultar/salir (nunca en cada giro). No se guarda si no hubo navegación o si dura menos de 10 s. Abrir un libro (o entrar desde el Cuaderno en una página) no cuenta como navegar.
- **Estadísticas**: `dailyTotals()` agrega por día (`GROUP BY day` en SQLite; cursor por índice en IndexedDB). Racha = días consecutivos con alguna sesión (no exige la meta). Metas en `localStorage` (`vuelo:metas-activas`, `vuelo:meta-minutos`).
- **Viaje de lectura**: la barra inferior muestra marcadores, apuntes, subrayados agrupados y, si el PDF trae índice (`getOutline()`), los capítulos. Si no hay índice no se inventa nada.
- **Cuaderno** (`/cuaderno/?id=`): subrayados, apuntes y marcadores por página; exporta Markdown ("Copiar como texto") y **Guardar .md**. En Tauri usa `dialog:allow-save` + `fs:allow-write-text-file` sin scope propio: el plugin de diálogo añade al scope de fs solo el archivo elegido (verificado en `tauri-plugin-dialog` 2.8.0, `commands.rs::save`). En el navegador es una descarga normal.

## Pendiente de verificar en Tauri

Smart App Control bloqueó los ejecutables nuevos (`os error 4551`) al añadir el plugin de diálogo, así que lo siguiente se verificó **solo en el navegador** (IndexedDB) y con el SQL de la migración sobre una **copia** de la base real con Node, pero **no** dentro de Tauri:

1. **Ejecución con SQLite real**
   - Abrir la app: `PRAGMA user_version` debe pasar de 3 a 4 y existir `reading_sessions` (base en `%APPDATA%\com.netrix.vuelo\vuelo.db`).
   - Abrir un libro, pasar páginas durante más de 10 s y volver a la biblioteca: debe aparecer una fila con `seconds_active` razonable.
   - Abrir un libro y salir sin navegar: no debe crearse ninguna fila.
   - Cerrar la ventana mientras se lee: se conserva al menos el último guardado periódico (≤ 20 s perdidos). Comprobar si el guardado en `pagehide`/`beforeunload` llega a completarse en WebView2.
   - Borrar un libro: sus filas de `reading_sessions` desaparecen.
2. **Diálogo "Guardar como"** (`dialog:allow-save`, `fs:allow-write-text-file`)
   - Cuaderno → **Guardar .md**: debe abrirse el diálogo nativo, y el archivo elegido debe escribirse con el mismo contenido que "Copiar como texto".
   - Cancelar el diálogo: no se escribe nada ni aparece un error.
   - Desde la consola del webview, `writeTextFile` a otra ruta fuera de AppData debe **fallar** (el scope solo incluye el archivo elegido).
3. **CSP del build empaquetado**
   - `npm run tauri build`, abrir `/cuaderno/`, `/lectura/` y el lector: sin eventos `securitypolicyviolation` ni errores de consola; el SVG de la semana, el brillo del camino y la descarga/guardado deben funcionar.

Para poder ejecutar los binarios hace falta firmarlos o que Smart App Control no bloquee la app (decisión del usuario; desactivarlo no tiene vuelta atrás sin reinstalar Windows).
