import type { TwilightBand } from './types.js';
import { inRange, RAD } from './validation.js';

/** Immutable, inclusive lower boundaries. Labels are left to the host application. */
export const TWILIGHT_BANDS = Object.freeze([
  Object.freeze({ id: 'day', minElevationDeg: 0 }),
  Object.freeze({ id: 'civil', minElevationDeg: -6 }),
  Object.freeze({ id: 'nautical', minElevationDeg: -12 }),
  Object.freeze({ id: 'astronomical', minElevationDeg: -18 }),
  Object.freeze({ id: 'night', minElevationDeg: -90 }),
] as const);

/** Classifies geometric elevation in [-90, 90]; exact thresholds belong to the brighter band. */
export function classifyTwilight(elevationDeg: number): TwilightBand {
  inRange(elevationDeg, -90, 90, 'elevationDeg');
  return elevationDeg >= 0 ? 'day' : elevationDeg >= -6 ? 'civil'
    : elevationDeg >= -12 ? 'nautical' : elevationDeg >= -18 ? 'astronomical' : 'night';
}

const CIVIL = Math.sin(-6 * RAD);
const NAUTICAL = Math.sin(-12 * RAD);
const ASTRONOMICAL = Math.sin(-18 * RAD);
export function classifySine(sin: number): TwilightBand {
  return sin >= 0 ? 'day' : sin >= CIVIL ? 'civil'
    : sin >= NAUTICAL ? 'nautical' : sin >= ASTRONOMICAL ? 'astronomical' : 'night';
}
