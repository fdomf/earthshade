import type { RasterTile } from '../raster/index.js';

export function paint(canvas: HTMLCanvasElement, tile: RasterTile): void {
  canvas.width = tile.width;
  canvas.height = tile.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Earthshade requires a 2D canvas context');
  const pixels = context.createImageData(tile.width, tile.height);
  pixels.data.set(tile.data);
  context.putImageData(pixels, 0, 0);
}

export async function encode(canvas: HTMLCanvasElement, check: () => void): Promise<ArrayBuffer> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error('Twilight PNG encoding failed')), 'image/png');
  });
  // A navigation or refresh can cancel the request while toBlob is running.
  // Do not begin another native Blob read for a retired document/revision.
  check();
  return blob.arrayBuffer();
}

export function instanceId(): string {
  // getRandomValues also works on ordinary HTTP development hosts where
  // randomUUID is unavailable because it requires a secure context.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `earthshade-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
