// Borra la base SQLite de Vuelo (y los PDF importados) del directorio de la app.
// Uso: npm run reset-db                  → borra DB + libros
//      npm run reset-db -- --keep-files     → borra solo la DB
//      npm run reset-db -- --webview        → además borra los datos del WebView2 (tema, onboarding)
//      npm run reset-db -- --dry-run        → solo muestra qué borraría
// Rutas verificadas en Windows con la app real: %APPDATA%com.netrix.vuelouelo.db (+ -wal/-shm, modo WAL)
// y %APPDATA%com.netrix.vueloooks. El localStorage del webview vive en %LOCALAPPDATA%com.netrix.vuelo.
// En el navegador (IndexedDB) usa DevTools → Application → Storage → Clear site data.
import { existsSync, rmSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const IDENTIFIER = 'com.netrix.vuelo';
const DB_FILE = 'vuelo.db';
const keepFiles = process.argv.includes('--keep-files');
const webview = process.argv.includes('--webview');
const dryRun = process.argv.includes('--dry-run');

function dirs() {
  const home = homedir();
  switch (platform()) {
    case 'win32': {
      const roaming = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
      const local = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
      return { config: join(roaming, IDENTIFIER), data: join(roaming, IDENTIFIER), webview: join(local, IDENTIFIER) };
    }
    case 'darwin': {
      const base = join(home, 'Library', 'Application Support', IDENTIFIER);
      return { config: base, data: base, webview: null };
    }
    default:
      return {
        config: join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), IDENTIFIER),
        data: join(process.env.XDG_DATA_HOME ?? join(home, '.local', 'share'), IDENTIFIER),
        webview: null,
      };
  }
}

const { config, data, webview: webviewDir } = dirs();
// tauri-plugin-sql resuelve `sqlite:vuelo.db` dentro de app_config_dir.
const targets = [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`].map((f) => join(config, f));
if (!keepFiles) targets.push(join(data, 'books'));
if (webview) {
  // Solo verificado en Windows (WebView2). En macOS/Linux el almacenamiento del webview no se toca.
  if (webviewDir) targets.push(webviewDir);
  else console.warn('[vuelo] --webview solo está soportado en Windows; se omite.');
}

let removed = 0;
for (const target of targets) {
  if (existsSync(target)) {
    if (!dryRun) rmSync(target, { recursive: true, force: true });
    console.log(`  ${dryRun ? '·' : '✕'} ${target}`);
    removed++;
  }
}
console.log(
  !removed ? '[vuelo] Nada que borrar.' : dryRun ? `[vuelo] Se borrarían ${removed} rutas (dry-run).` : `[vuelo] Reset completo (${removed}).`,
);
