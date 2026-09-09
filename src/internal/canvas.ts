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

export function instanceId(): string {
  // getRandomValues also works on ordinary HTTP development hosts where
  // randomUUID is unavailable because it requires a secure context.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `earthshade-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
