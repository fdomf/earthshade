import type { TwilightBand } from '../core/types.js';
import { inRange } from '../core/validation.js';

/** Unpremultiplied red, green, blue, alpha bytes (integers 0–255). */
export type RGBA = readonly [number, number, number, number];
export type Palette = Readonly<Record<Exclude<TwilightBand, 'day'>, RGBA>>;

/** Default overlay colors; daylight is always transparent. */
export const DEFAULT_PALETTE: Palette = Object.freeze({
  civil: Object.freeze([160, 160, 160, 77] as const),
  nautical: Object.freeze([96, 96, 96, 102] as const),
  astronomical: Object.freeze([33, 33, 33, 128] as const),
  night: Object.freeze([0, 0, 0, 166] as const),
});

export function copyPalette(palette: Palette): Palette {
  const result = {} as Record<Exclude<TwilightBand, 'day'>, RGBA>;
  for (const key of ['civil', 'nautical', 'astronomical', 'night'] as const) {
    const color = palette?.[key];
    if (!Array.isArray(color) || color.length !== 4) throw new TypeError(`palette.${key} must contain four RGBA bytes`);
    for (const byte of color) {
      inRange(byte, 0, 255, `palette.${key}`);
      if (!Number.isInteger(byte)) throw new RangeError(`palette.${key} must contain integer bytes`);
    }
    result[key] = Object.freeze([...color]) as unknown as RGBA;
  }
  return Object.freeze(result);
}
