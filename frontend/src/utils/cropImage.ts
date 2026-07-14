export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
    img.crossOrigin = 'anonymous';
    img.src = src;
  });

/** Crops `imageSrc` to `pixelCrop` (as reported by react-easy-crop) and returns
 * a JPEG File ready to upload — output is always resized down to fit within
 * `maxDimension` so a cropped selection from a large photo still ends up small. */
export async function getCroppedImageFile(
  imageSrc: string,
  pixelCrop: PixelCrop,
  fileName: string,
  maxDimension = 800,
): Promise<File> {
  const image = await loadImage(imageSrc);

  const scale = Math.min(1, maxDimension / Math.max(pixelCrop.width, pixelCrop.height));
  const outputWidth = Math.round(pixelCrop.width * scale);
  const outputHeight = Math.round(pixelCrop.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, outputWidth, outputHeight,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Failed to crop image')); return; }
      const baseName = fileName.replace(/\.[^/.]+$/, '') || 'photo';
      resolve(new File([blob], `${baseName}_cropped.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  });
}
