'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import WingedBook from '@/components/ui/WingedBook';
import { APP_NAME } from '@/lib/constants';
import { isTauri } from '@/lib/platform';
import { syncWindowFrame } from '@/lib/windowChrome';

type Action = 'minimize' | 'toggleMaximize' | 'close';

async function run(action: Action) {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  try {
    if (action === 'minimize') await win.minimize();
    else if (action === 'toggleMaximize') await win.toggleMaximize();
    else await win.close();
  } catch (err) {
    console.error(`No se pudo ejecutar «${action}» en la ventana`, err);
  }
}

const buttonClass =
  'grid h-full w-11 place-items-center text-tinta-suave/70 transition-colors hover:bg-papel hover:text-tinta focus-visible:ring-inset focus-visible:ring-offset-0 active:bg-papel/70';

/**
 * Barra de título propia (la ventana no tiene decoración nativa). Toda la franja arrastra la ventana
 * y el doble clic alterna maximizar/restaurar (lo resuelve Tauri con data-tauri-drag-region).
 * Va siempre en el HTML y el CSS la muestra solo con html[data-ventana='propia'] (sin salto al hidratar).
 */
export default function TitleBar() {
  const [maximized, setMaximized] = useState(true);

  const refresh = useCallback(async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    setMaximized(await getCurrentWindow().isMaximized());
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    void syncWindowFrame();
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      void refresh();
      const off = await getCurrentWindow().onResized(() => void refresh());
      if (cancelled) off();
      else unlisten = off;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [refresh]);

  return (
    <div
      data-tauri-drag-region
      className="barra-titulo fixed inset-x-0 top-0 z-[70] h-[var(--titlebar-h)] select-none items-center border-b border-linea/10 bg-fondo/90 pl-3 backdrop-blur-xl"
    >
      <WingedBook className="pointer-events-none w-6 text-papel" accentClassName="text-acento" outlineClassName="text-tinta/35" />
      <span className="pointer-events-none ml-2 font-display text-sm font-semibold leading-none">{APP_NAME}</span>
      <div data-tauri-drag-region className="h-full flex-1" />
      <div className="flex h-full">
        <button type="button" className={buttonClass} onClick={() => void run('minimize')} aria-label="Minimizar" title="Minimizar">
          <Minus className="size-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => void run('toggleMaximize')}
          aria-label={maximized ? 'Restaurar' : 'Maximizar'}
          title={maximized ? 'Restaurar' : 'Maximizar'}
        >
          {maximized ? <Copy className="size-3.5 -scale-x-100" strokeWidth={1.75} /> : <Square className="size-3.5" strokeWidth={1.75} />}
        </button>
        <button
          type="button"
          className={`${buttonClass} hover:bg-acento/30`}
          onClick={() => void run('close')}
          aria-label="Cerrar"
          title="Cerrar"
        >
          <X className="size-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
