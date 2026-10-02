'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, ArchiveRestore, Check, HardDriveDownload, Loader2, X } from 'lucide-react';
import { backupFileName, estimateBackup, exportBackup, type BackupEstimate, type BackupProgress } from '@/lib/backup/export';
import { BackupError, LARGE_BACKUP_BYTES } from '@/lib/backup/format';
import { readBackupHead, restoreBackup, summarizeRestore, type BackupHead, type RestoreProgress } from '@/lib/backup/import';
import type { RestoreMode, RestoreSummary } from '@/lib/backup/plan';
import { formatBytes } from '@/lib/backup/reminder';
import { openBackupSink } from '@/lib/backup/sink';
import { MIGRATIONS } from '@/lib/db';

import type { BackupTab } from './LibraryMenu';

export type { BackupTab };

interface BackupDialogProps {
  open: boolean;
  initialTab?: BackupTab;
  onClose(): void;
  /** Tras restaurar: recargar la biblioteca. */
  onRestored(): void;
}

type Progress = { label: string; pct: number; detail?: string };

const PHASE_LABEL: Record<BackupProgress['phase'] | RestoreProgress['phase'], string> = {
  preparando: 'Preparando libros…',
  empaquetando: 'Empaquetando PDF…',
  terminando: 'Terminando…',
  comparando: 'Comparando con tu biblioteca…',
  extrayendo: 'Extrayendo y verificando PDF…',
  guardando: 'Guardando cambios…',
};

const errorText = (err: unknown) =>
  err instanceof BackupError ? err.message : `Algo salió mal: ${(err as Error)?.message ?? 'error desconocido'}. No se cambió nada.`;

export default function BackupDialog({ open, initialTab = 'exportar', onClose, onRestored }: BackupDialogProps) {
  const reduce = useReducedMotion() ?? false;
  const [tab, setTab] = useState<BackupTab>(initialTab);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="respaldo"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.18 }}
          className="fixed inset-0 z-50 grid place-items-center bg-sombra/40 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => !busy && onClose()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="respaldo-titulo"
        >
          <motion.div
            initial={reduce ? false : { y: 16, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={reduce ? undefined : { y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-panel bg-fondo shadow-flotante"
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-4 sm:px-6">
              <h2 id="respaldo-titulo" className="text-2xl font-semibold">
                Respaldo
              </h2>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="grid size-9 place-items-center rounded-suave hover:bg-papel/70 disabled:opacity-40"
                aria-label="Cerrar"
              >
                <X className="size-4" />
              </button>
            </div>
            <div role="tablist" aria-label="Acción" className="mx-5 flex rounded-suave bg-papel/50 p-0.5 sm:mx-6">
              {(
                [
                  ['exportar', 'Crear respaldo', HardDriveDownload],
                  ['restaurar', 'Restaurar', ArchiveRestore],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  disabled={busy}
                  onClick={() => setTab(id)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-[12px] px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                    tab === id ? 'bg-fondo text-tinta shadow-suave' : 'text-tinta-suave/65 hover:text-tinta'
                  }`}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 sm:px-6">
              {tab === 'exportar' ? (
                <ExportPanel busy={busy} setBusy={setBusy} abortRef={abortRef} />
              ) : (
                <RestorePanel busy={busy} setBusy={setBusy} abortRef={abortRef} onRestored={onRestored} />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface PanelProps {
  busy: boolean;
  setBusy(b: boolean): void;
  abortRef: React.MutableRefObject<AbortController | null>;
}

function ExportPanel({ busy, setBusy, abortRef }: PanelProps) {
  const [includePdfs, setIncludePdfs] = useState(true);
  const [estimate, setEstimate] = useState<BackupEstimate | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    setEstimate(null);
    void estimateBackup(includePdfs).then((e) => alive && setEstimate(e));
    return () => {
      alive = false;
    };
  }, [includePdfs]);

  const total = estimate ? estimate.pdfBytes + estimate.dataBytes : 0;

  async function run() {
    setResult(null);
    const sink = await openBackupSink(backupFileName(new Date(), includePdfs)).catch(() => null);
    if (!sink) return; // diálogo cancelado
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setProgress({ label: PHASE_LABEL.preparando, pct: 0 });
    const t0 = performance.now();
    try {
      const { bytes } = await exportBackup(sink, {
        includePdfs,
        signal: ctrl.signal,
        onProgress: (p) =>
          setProgress({ label: PHASE_LABEL[p.phase], pct: p.total ? p.done / p.total : 1, detail: p.label }),
      });
      setResult({
        ok: true,
        text: `Respaldo listo: ${formatBytes(bytes)} en ${((performance.now() - t0) / 1000).toFixed(1)} s · ${sink.label}`,
      });
    } catch (err) {
      setResult({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
      setProgress(null);
      abortRef.current = null;
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-tinta-suave/75">
        Un solo archivo <strong className="font-semibold">.vuelo</strong> con tus libros, apuntes, subrayados, marcadores,
        sesiones y preferencias. Guárdalo fuera de este equipo.
      </p>
      <fieldset className="space-y-2" disabled={busy}>
        <legend className="sr-only">Tipo de respaldo</legend>
        <Choice checked={includePdfs} onChange={() => setIncludePdfs(true)} title="Completo" text="Incluye los PDF: restaura todo en otro equipo." />
        <Choice
          checked={!includePdfs}
          onChange={() => setIncludePdfs(false)}
          title="Solo datos (sin PDF)"
          text="Liviano: al restaurar, se asocia a los libros que ya tengas (por su huella)."
        />
      </fieldset>

      <div className="rounded-suave bg-papel/60 px-4 py-3 text-sm">
        {estimate ? (
          <>
            Tamaño estimado: <strong className="font-semibold tabular-nums">{formatBytes(total)}</strong> ·{' '}
            {estimate.books === 1 ? '1 libro' : `${estimate.books} libros`}
            {total > LARGE_BACKUP_BYTES && (
              <p className="mt-2 flex gap-2 text-tinta-suave/80">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-acento" aria-hidden />
                Es un respaldo grande. Puede tardar unos minutos; asegúrate de tener espacio donde lo guardes.
              </p>
            )}
          </>
        ) : (
          <span className="text-tinta-suave/60">Calculando tamaño…</span>
        )}
      </div>

      {progress && <ProgressBar progress={progress} onCancel={() => abortRef.current?.abort()} />}
      {result && <ResultNote ok={result.ok}>{result.text}</ResultNote>}

      {!busy && (
        <button
          type="button"
          onClick={() => void run()}
          disabled={!estimate || estimate.books === 0}
          className="inline-flex w-full items-center justify-center gap-2 rounded-tarjeta bg-acento px-5 py-3 font-semibold text-tinta shadow-suave disabled:opacity-50 dark:text-fondo"
        >
          <HardDriveDownload className="size-4" aria-hidden />
          Crear respaldo
        </button>
      )}
    </div>
  );
}

function RestorePanel({ busy, setBusy, abortRef, onRestored }: PanelProps & { onRestored(): void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [head, setHead] = useState<BackupHead | null>(null);
  const [summary, setSummary] = useState<RestoreSummary | null>(null);
  const [mode, setMode] = useState<RestoreMode>('combinar');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function pick(f: File) {
    setFile(f);
    setHead(null);
    setSummary(null);
    setResult(null);
    setConfirmReplace(false);
    setMode('combinar');
    setLoading(true);
    try {
      const h = await readBackupHead(f);
      setHead(h);
      setSummary(await summarizeRestore(h, 'combinar'));
    } catch (err) {
      setResult({ ok: false, text: errorText(err) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!head) return;
    let alive = true;
    void summarizeRestore(head, mode).then((s) => alive && setSummary(s));
    return () => {
      alive = false;
    };
  }, [head, mode]);

  async function run() {
    if (!file || !head) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setResult(null);
    setProgress({ label: PHASE_LABEL.comparando, pct: 0 });
    const t0 = performance.now();
    try {
      const { summary: s } = await restoreBackup(file, head, mode, {
        signal: ctrl.signal,
        onProgress: (p) => setProgress({ label: PHASE_LABEL[p.phase], pct: p.total ? p.done / p.total : 1, detail: p.label }),
      });
      const parts = [
        `${s.nuevos.books} libro${s.nuevos.books === 1 ? '' : 's'} nuevo${s.nuevos.books === 1 ? '' : 's'}`,
        `${s.nuevos.notes} apuntes`,
        `${s.nuevos.highlights} subrayados`,
        `${s.nuevos.bookmarks} marcadores`,
        `${s.nuevos.sessions} sesiones`,
      ];
      if (s.progresoActualizado) parts.push(`progreso actualizado en ${s.progresoActualizado}`);
      setResult({
        ok: true,
        text: `Restaurado en ${((performance.now() - t0) / 1000).toFixed(1)} s: ${parts.join(', ')}.${
          s.omitidos.length ? ` Omitidos: ${s.omitidos.map((o) => `«${o.title}» (${o.motivo})`).join('; ')}.` : ''
        }`,
      });
      setHead(null);
      setSummary(null);
      setFile(null);
      onRestored();
    } catch (err) {
      setResult({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
      setProgress(null);
      abortRef.current = null;
    }
  }

  const canRun = head && summary && !busy && (mode === 'combinar' || confirmReplace);

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept=".vuelo,application/zip"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void pick(f);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-tarjeta border-2 border-dashed border-linea/20 px-4 py-5 text-sm font-medium hover:bg-papel/50 disabled:opacity-50"
      >
        <ArchiveRestore className="size-5 text-acento" aria-hidden />
        {file ? `Archivo: ${file.name} (${formatBytes(file.size)})` : 'Elegir un archivo .vuelo'}
      </button>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-tinta-suave/70">
          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> Leyendo el respaldo…
        </p>
      )}

      {head && summary && (
        <div className="space-y-3" aria-live="polite">
          <div className="rounded-suave bg-papel/60 p-4 text-sm">
            <p className="font-semibold">Este respaldo trae</p>
            <SummaryGrid s={summary} />
            <p className="mt-2 text-xs text-tinta-suave/60">
              Creado el {new Date(head.manifest.createdAt).toLocaleString('es')} · {head.manifest.includesPdfs ? 'con PDF' : 'solo datos'}
              {head.fromSchema < MIGRATIONS.length && ` · de una versión anterior (base v${head.fromSchema}): se adaptará al cargar`}
            </p>
          </div>

          <fieldset className="space-y-2" disabled={busy}>
            <legend className="mb-1 text-sm font-semibold">¿Cómo restaurar?</legend>
            <Choice
              checked={mode === 'combinar'}
              onChange={() => {
                setMode('combinar');
                setConfirmReplace(false);
              }}
              title="Combinar (recomendado)"
              text="Añade lo que falta. No duplica libros (se reconocen por su huella) y no pisa un progreso más reciente."
            />
            <Choice
              checked={mode === 'reemplazar'}
              onChange={() => setMode('reemplazar')}
              title="Reemplazar todo"
              text="Tu biblioteca quedará exactamente como el respaldo."
            />
          </fieldset>

          {mode === 'reemplazar' && (
            <div className="rounded-suave border border-acento/40 bg-acento/10 p-4 text-sm">
              <p className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-acento" aria-hidden />
                <span>
                  Se borrará lo que tienes ahora: {summary.seBorra.books} libros, {summary.seBorra.notes} apuntes,{' '}
                  {summary.seBorra.highlights} subrayados, {summary.seBorra.bookmarks} marcadores y {summary.seBorra.sessions} sesiones.
                </span>
              </p>
              <label className="mt-3 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={confirmReplace}
                  onChange={(e) => setConfirmReplace(e.target.checked)}
                  className="size-4 accent-[rgb(var(--acento))]"
                />
                Entiendo que se reemplaza mi biblioteca actual
              </label>
            </div>
          )}

          {!busy && (
            <button
              type="button"
              disabled={!canRun}
              onClick={() => void run()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-tarjeta bg-acento px-5 py-3 font-semibold text-tinta shadow-suave disabled:opacity-50 dark:text-fondo"
            >
              <ArchiveRestore className="size-4" aria-hidden />
              {mode === 'combinar' ? 'Combinar con mi biblioteca' : 'Reemplazar mi biblioteca'}
            </button>
          )}
        </div>
      )}

      {progress && <ProgressBar progress={progress} onCancel={() => abortRef.current?.abort()} />}
      {result && <ResultNote ok={result.ok}>{result.text}</ResultNote>}
    </div>
  );
}

function SummaryGrid({ s }: { s: RestoreSummary }) {
  const rows: [string, number, number][] = [
    ['Libros', s.backup.books, s.existentes.books],
    ['Apuntes', s.backup.notes, s.existentes.notes],
    ['Subrayados', s.backup.highlights, s.existentes.highlights],
    ['Marcadores', s.backup.bookmarks, s.existentes.bookmarks],
    ['Sesiones', s.backup.sessions, s.existentes.sessions],
  ];
  return (
    <table className="mt-2 w-full text-left tabular-nums">
      <thead>
        <tr className="text-xs text-tinta-suave/60">
          <th className="py-1 font-medium" scope="col" />
          <th className="py-1 font-medium" scope="col">
            En el respaldo
          </th>
          <th className="py-1 font-medium" scope="col">
            Ya los tienes
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, total, have]) => (
          <tr key={label} className="border-t border-linea/10">
            <th scope="row" className="py-1 font-normal">
              {label}
            </th>
            <td className="py-1 font-semibold">{total}</td>
            <td className="py-1 text-tinta-suave/70">{have}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Choice({ checked, onChange, title, text }: { checked: boolean; onChange(): void; title: string; text: string }) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-suave border p-3 transition-colors ${
        checked ? 'border-acento/70 bg-acento/10' : 'border-linea/15 hover:bg-papel/50'
      }`}
    >
      <input type="radio" checked={checked} onChange={onChange} className="mt-1 size-4 accent-[rgb(var(--acento))]" />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-tinta-suave/70">{text}</span>
      </span>
    </label>
  );
}

function ProgressBar({ progress, onCancel }: { progress: Progress; onCancel(): void }) {
  const pct = Math.round(Math.min(1, Math.max(0, progress.pct)) * 100);
  return (
    <div className="rounded-suave bg-papel/60 p-4" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <Loader2 className="size-4 shrink-0 text-acento motion-safe:animate-spin" aria-hidden />
          <span className="truncate">{progress.label}</span>
        </span>
        <span className="tabular-nums text-tinta-suave/70">{pct}%</span>
      </div>
      {progress.detail && <p className="mt-0.5 truncate pl-6 text-xs text-tinta-suave/55">{progress.detail}</p>}
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-linea/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full rounded-full bg-acento transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
      <button type="button" onClick={onCancel} className="mt-3 text-sm font-medium text-tinta-suave/70 underline-offset-2 hover:underline">
        Cancelar
      </button>
    </div>
  );
}

function ResultNote({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <p
      role={ok ? 'status' : 'alert'}
      className={`flex gap-2 rounded-suave p-3 text-sm ${ok ? 'bg-papel/60' : 'border border-linea/15 bg-fondo'}`}
    >
      {ok ? (
        <Check className="mt-0.5 size-4 shrink-0 text-acento" aria-hidden />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-acento" aria-hidden />
      )}
      <span>{children}</span>
    </p>
  );
}
