'use client';

import { useEffect, useRef } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { getPdfjs } from '@/lib/pdf';

type PdfTextLayer = InstanceType<Awaited<ReturnType<typeof getPdfjs>>['TextLayer']>;

interface TextLayerProps {
  doc: PDFDocumentProxy;
  /** 1-based */
  pageNumber: number;
  /** Ancho de la página en px CSS (cambia con el zoom). */
  width: number;
}

/**
 * Capa de texto seleccionable de pdfjs-dist v6 sobre el canvas (solo en la vista estática
 * del modo Subrayar). API real de v6: `new TextLayer({ textContentSource, container, viewport })`,
 * `render()`, `update({ viewport })` y `cancel()`. La capa se dimensiona con la variable CSS
 * `--total-scale-factor` (= escala del viewport) y cada fragmento se posiciona en % de la página,
 * así que coincide con el canvas a cualquier tamaño.
 */
export default function TextLayer({ doc, pageNumber, width }: TextLayerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const state = useRef<{ layer: PdfTextLayer; page: PDFPageProxy; baseWidth: number } | null>(null);
  const widthRef = useRef(width);
  widthRef.current = width;

  // Crear/destruir por página. Al cambiar de página se cancela el render pendiente.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    let layer: PdfTextLayer | null = null;

    (async () => {
      const [pdfjs, page] = await Promise.all([getPdfjs(), doc.getPage(pageNumber)]);
      if (cancelled) return;
      const baseWidth = page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale: widthRef.current / baseWidth });
      el.replaceChildren();
      el.style.setProperty('--total-scale-factor', String(viewport.scale));
      layer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: el, viewport });
      await layer.render();
      if (cancelled) return;
      // Como el visor de pdfjs: un relleno al final mejora la selección entre líneas.
      const end = document.createElement('div');
      end.className = 'endOfContent';
      el.append(end);
      state.current = { layer, page, baseWidth };
    })().catch((err: unknown) => {
      if (!cancelled && (err as { name?: string })?.name !== 'AbortException') console.error('Capa de texto:', err);
    });

    return () => {
      cancelled = true;
      layer?.cancel();
      state.current = null;
      el.replaceChildren();
    };
  }, [doc, pageNumber]);

  // Zoom: reajustar la capa existente (sin volver a pedir el texto).
  useEffect(() => {
    const s = state.current;
    const el = ref.current;
    if (!s || !el) return;
    const viewport = s.page.getViewport({ scale: width / s.baseWidth });
    el.style.setProperty('--total-scale-factor', String(viewport.scale));
    s.layer.update({ viewport });
  }, [width]);

  // Igual que el visor oficial: mientras se arrastra, el relleno cubre la página
  // para que la selección no "salte" al pasar por huecos entre líneas.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => el.classList.add('selecting');
    const off = () => el.classList.remove('selecting');
    el.addEventListener('pointerdown', on);
    window.addEventListener('pointerup', off);
    window.addEventListener('pointercancel', off);
    return () => {
      el.removeEventListener('pointerdown', on);
      window.removeEventListener('pointerup', off);
      window.removeEventListener('pointercancel', off);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="capa-texto"
      // Sin el menú contextual del sistema al mantener pulsado sobre la selección.
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
