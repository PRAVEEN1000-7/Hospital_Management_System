import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Render a full HTML document string into a multi-page A4 PDF and trigger a download.
 *
 * The HTML is loaded into an off-screen iframe so the document's own <style>/<body>
 * rules apply exactly as they do in the print view, then rasterised page-by-page.
 *
 * @param html      A complete HTML document (e.g. the prescription print template).
 * @param filename  Download file name; ".pdf" is appended if missing.
 */
export async function htmlStringToPdf(html: string, filename: string): Promise<void> {
  const A4_WIDTH_PX = 794; // A4 width at ~96dpi

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = `${A4_WIDTH_PX}px`;
  iframe.style.height = '1123px';
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

    const canvas = await html2canvas(doc.body, {
      // Higher scale → sharper text/logo in the downloaded/printed PDF.
      scale: Math.min(3, (window.devicePixelRatio || 1) * 2),
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: A4_WIDTH_PX,
      windowHeight: contentHeight,
      height: contentHeight,
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    const imgData = canvas.toDataURL('image/png');

    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
    heightLeft -= pageH;

    // Only add another page when a meaningful amount of content remains; a tiny
    // sub-millimetre remainder from rounding must never create a blank page.
    while (heightLeft > 2) {
      position -= pageH;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
      heightLeft -= pageH;
    }

    pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
  } finally {
    document.body.removeChild(iframe);
  }
}
