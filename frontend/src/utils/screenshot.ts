import html2canvas from 'html2canvas';

/**
 * Rasterises a live on-page DOM element exactly as currently rendered
 * (colors, badges, layout — no reformatting into rows/columns) and triggers
 * a PNG download. Used where "download" means "what's on screen," not a
 * data export — e.g. the Attendance grid.
 */
export async function downloadElementAsImage(element: HTMLElement, filename: string): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: Math.min(2, (window.devicePixelRatio || 1) * 1.5),
    useCORS: true,
    backgroundColor: '#ffffff',
  });
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
