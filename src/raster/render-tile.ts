import type { SolarPosition } from '../core/types.js';
import { classifySine } from '../core/twilight.js';
import { longitude, RAD, validateSun } from '../core/validation.js';
import { normalizeTile, type TileRequest } from './mercator.js';
import { copyPalette, DEFAULT_PALETTE, type Palette } from './palette.js';

export interface RasterTile {
  readonly width: number;
  readonly height: number;
  /** Newly owned, unpremultiplied RGBA pixels, row-major from the top left. */
  readonly data: Uint8ClampedArray;
}

/** Render XYZ Web Mercator pixel centers without DOM, network or clock access.
 * Invalid coordinates, solar positions or RGBA bytes throw before pixel allocation.
 */
export function renderTile(request: TileRequest, sun: SolarPosition, palette: Palette = DEFAULT_PALETTE): RasterTile {
  const { x, y, z, size } = normalizeTile(request);
  validateSun(sun);
  const colors = copyPalette(palette);
  const data = new Uint8ClampedArray(size * size * 4);
  const columns = new Float64Array(size);
  const n = 2 ** z;
  const delta = sun.declinationDeg * RAD;
  const sinDelta = Math.sin(delta);
  const cosDelta = Math.cos(delta);
  const sunLongitude = longitude(sun.subsolarLongitudeDeg);
  for (let col = 0; col < size; col++) {
    const lambda = (x + (col + 0.5) / size) / n * 360 - 180;
    columns[col] = cosDelta * Math.cos((lambda - sunLongitude) * RAD);
  }
  for (let row = 0; row < size; row++) {
    const mercator = Math.PI * (1 - 2 * (y + (row + 0.5) / size) / n);
    const sinPhi = Math.tanh(mercator);
    const cosPhi = 1 / Math.cosh(mercator);
    for (let col = 0; col < size; col++) {
      const band = classifySine(sinPhi * sinDelta + cosPhi * columns[col]!);
      if (band !== 'day') {
        const color = colors[band];
        const offset = (row * size + col) * 4;
        // Avoid the generic array-to-typed-array copy for each shaded pixel.
        data[offset] = color[0];
        data[offset + 1] = color[1];
        data[offset + 2] = color[2];
        data[offset + 3] = color[3];
      }
    }
  }
  return { width: size, height: size, data };
}
