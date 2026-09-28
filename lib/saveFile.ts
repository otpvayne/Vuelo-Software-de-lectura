import { isTauri } from './platform';

export type SaveResult = 'guardado' | 'cancelado' | 'no-disponible';

/**
 * Guarda un archivo de texto elegido por el usuario.
 * - Tauri: diálogo nativo "Guardar como" (permiso `dialog:allow-save`). El plugin añade al
 *   scope de fs SOLO la ruta elegida, así que basta `fs:allow-write-text-file` sin scope amplio.
 * - Navegador: descarga normal.
 */
export async function saveTextFile(fileName: string, content: string): Promise<SaveResult> {
  if (isTauri()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({
        title: 'Guardar cuaderno',
        defaultPath: fileName,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (!path) return 'cancelado';
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      await writeTextFile(path, content);
      return 'guardado';
    } catch (err) {
      // p. ej. plataformas sin diálogo de guardar: queda "Copiar como texto".
      console.error('Guardar archivo:', err);
      return 'no-disponible';
    }
  }
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'guardado';
}
