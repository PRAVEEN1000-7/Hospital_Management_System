import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Render a full HTML document string into a multi-page A4 PDF and trigger a download.
 *
 * The HTML is loaded into an off-screen iframe so the document's own <style>/<body>
 * rules apply exactly as they do in the print view, then rasterised page-by-page.
 *
 * @param html        A complete HTML document (e.g. the prescription print template).
 * @param filename    Download file name; ".pdf" is appended if missing.
 * @param orientation 'portrait' (default) or 'landscape' — use landscape for
 *                    wide tabular documents (e.g. a multi-column payroll sheet)
 *                    that would otherwise be cramped on a portrait page.
 * @param pageSize    'a4' (default) or 'a5' — 'a5' is for small till-receipt-style
 *                    documents (e.g. the pharmacy sale invoice) where a full A4
 *                    sheet would be mostly blank.
 */
export async function htmlStringToPdf(
  html: string, filename: string, orientation: 'portrait' | 'landscape' = 'portrait',
  pageSize: 'a4' | 'a5' = 'a4',
): Promise<void> {
  // ~96dpi page pixel sizes, swapped for landscape.
  // A4 (210 x 297mm): 794 x 1123px. A5 (148 x 210mm): 559 x 794px.
  const PORTRAIT_PX = pageSize === 'a5' ? { w: 559, h: 794 } : { w: 794, h: 1123 };
  const PAGE_WIDTH_PX = orientation === 'landscape' ? PORTRAIT_PX.h : PORTRAIT_PX.w;
  const PAGE_HEIGHT_PX = orientation === 'landscape' ? PORTRAIT_PX.w : PORTRAIT_PX.h;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = `${PAGE_WIDTH_PX}px`;
  iframe.style.height = `${PAGE_HEIGHT_PX}px`;
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('Unable to create render context');

    doc.open();
    doc.write(html);
    doc.close();

    // Wait for the iframe document (and a tick for layout) to be ready.
    await new Promise<void>((resolve) => {
      if (doc.readyState === 'complete') {
        setTimeout(resolve, 300);
      } else {
        iframe.onload = () => setTimeout(resolve, 300);
        // Fallback in case onload already fired.
        setTimeout(resolve, 1200);
      }
    });

    // Wait for web fonts (Noto Sans + language scripts) to load so glyphs render.
    try {
      await (doc as Document & { fonts?: FontFaceSet }).fonts?.ready;
    } catch {
      /* fonts API unavailable — proceed with system fonts */
    }

    // Capture only the actual content height — NOT the fixed A4 iframe viewport —
    // otherwise the blank space below a short prescription gets rasterised and
    // produces a trailing empty page.
    const contentHeight = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
    iframe.style.height = `${contentHeight}px`;

    // Row/atomic-element boundaries (DOM CSS px, relative to <body>'s top)
    // that must never be sliced across a page boundary — read BEFORE
    // rasterising, while the iframe's DOM is still queryable. `tr` covers
    // every tabular report this app generates (attendance, payroll,
    // invoices, PO/GRN, lab); `.avoid-break` covers non-<tr> blocks such as
    // a signature section. CSS `page-break-inside: avoid` only affects an
    // actual browser print — this raster path has no page concept at all
    // until we build one here, so a naive fixed-height slice otherwise cuts
    // straight through a row (e.g. an attendance employee's name sitting
    // right at a page boundary).
    const bodyTop = doc.body.getBoundingClientRect().top;
    const domSegments = Array.from(doc.querySelectorAll<HTMLElement>('tr, .avoid-break'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top - bodyTop, bottom: r.bottom - bodyTop };
      })
      .filter((s) => s.bottom > s.top)
      .sort((a, b) => a.top - b.top);

    const canvas = await html2canvas(doc.body, {
      // Higher scale → sharper text/logo in the downloaded/printed PDF.
      scale: Math.min(3, (window.devicePixelRatio || 1) * 2),
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: PAGE_WIDTH_PX,
      windowHeight: contentHeight,
      height: contentHeight,
    });

    const pdf = new jsPDF({ orientation, unit: 'mm', format: pageSize });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;

    // html2canvas scales the DOM uniformly, so one factor converts canvas px
    // to output mm on both axes, and another converts the DOM measurements
    // above (taken pre-rasterisation, in CSS px) into that same canvas-px space.
    const canvasPxPerMm = canvas.width / imgW;
    const domPxToCanvasPx = canvas.height / contentHeight;
    const pageHeightPx = pageH * canvasPxPerMm;
    const segments = domSegments.map((s) => ({
      top: s.top * domPxToCanvasPx,
      bottom: s.bottom * domPxToCanvasPx,
    }));

    // Walk the content in page-sized chunks, nudging each cut back to the
    // nearest row boundary instead of a blind fixed interval. A nudge is
    // only taken when it leaves a non-trivial amount of content on the page
    // being closed off — otherwise (e.g. a single row taller than a page,
    // or one sitting right at the very top) fall back to the plain cut
    // rather than emit a near-empty page or loop without progress.
    const MIN_SLICE_PX = pageHeightPx * 0.25;
    const sliceBoundaries: number[] = [0];
    let cursor = 0;
    // Stop once only a negligible sliver of content remains — a few px of
    // canvas-scale rounding is never real content and must not spawn a
    // near-blank trailing page — then close out with the true content end,
    // which also covers the common case of everything fitting on one page
    // (the loop body never runs at all, and this is the only boundary added
    // after the initial 0).
    while (canvas.height - cursor > 6 * canvasPxPerMm) {
      let end = Math.min(cursor + pageHeightPx, canvas.height);
      const straddling = segments.find((s) => s.top > cursor && s.top < end && s.bottom > end);
      if (straddling && straddling.top - cursor >= MIN_SLICE_PX) {
        end = straddling.top;
      }
      sliceBoundaries.push(end);
      cursor = end;
    }
    if (sliceBoundaries[sliceBoundaries.length - 1] < canvas.height - 0.5) {
      sliceBoundaries.push(canvas.height);
    }

    // Each page gets an explicitly-cropped slice of the source canvas (via a
    // scratch canvas) rather than one shared image nudged up/down per page —
    // that's what makes uneven, row-aligned slice heights safe: there's no
    // risk of a page boundary's natural clip re-showing (or hiding) a few
    // pixels of the row it was nudged away from.
    for (let i = 0; i < sliceBoundaries.length - 1; i++) {
      const sliceTop = sliceBoundaries[i];
      const sliceBottom = sliceBoundaries[i + 1];
      const sliceHeightPx = sliceBottom - sliceTop;
      if (sliceHeightPx <= 0) continue;

      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeightPx;
      const ctx = sliceCanvas.getContext('2d');
      if (!ctx) continue;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(canvas, 0, sliceTop, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

      if (i > 0) pdf.addPage();
      const sliceHeightMm = sliceHeightPx / canvasPxPerMm;
      pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 0, 0, imgW, sliceHeightMm);
    }

    pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
  } finally {
    document.body.removeChild(iframe);
  }
}
