// Borra la base SQLite de Vuelo (y los PDF importados) del directorio de la app.
// Uso: npm run reset-db            → borra DB + libros
//      npm run reset-db -- --keep-files → borra solo la DB
// En el navegador (IndexedDB) usa DevTools → Application → Storage → Clear site data.
import { existsSync, rmSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const IDENTIFIER = 'com.netrix.vuelo';
const DB_FILE = 'vuelo.db';
const keepFiles = process.argv.includes('--keep-files');

function dirs() {
  const home = homedir();
  switch (platform()) {
    case 'win32': {
      const roaming = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
      return { config: join(roaming, IDENTIFIER), data: join(roaming, IDENTIFIER) };
    }
    case 'darwin': {
      const base = join(home, 'Library', 'Application Support', IDENTIFIER);
      return { config: base, data: base };
    }
    default:
      return {
        config: join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), IDENTIFIER),
        data: join(process.env.XDG_DATA_HOME ?? join(home, '.local', 'share'), IDENTIFIER),
      };
  }
}

const { config, data } = dirs();
// tauri-plugin-sql resuelve `sqlite:vuelo.db` dentro de app_config_dir.
const targets = [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`].map((f) => join(config, f));
if (!keepFiles) targets.push(join(data, 'books'));

let removed = 0;
for (const target of targets) {
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
    console.log(`  ✕ ${target}`);
    removed++;
  }
}
console.log(removed ? `[vuelo] Reset completo (${removed}).` : '[vuelo] Nada que borrar.');
