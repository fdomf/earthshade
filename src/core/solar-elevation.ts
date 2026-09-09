import type { GeographicPoint, SolarPosition } from './types.js';
import { inRange, longitude, RAD, validateSun } from './validation.js';

/** Geometric solar elevation in degrees [-90, 90]. Invalid inputs throw RangeError. */
export function solarElevation(point: GeographicPoint, sun: SolarPosition): number {
  const phi = inRange(point.latitudeDeg, -90, 90, 'latitudeDeg') * RAD;
  const lambda = longitude(point.longitudeDeg);
  validateSun(sun);
  const delta = sun.declinationDeg * RAD;
  const sin = Math.sin(phi) * Math.sin(delta)
    + Math.cos(phi) * Math.cos(delta) * Math.cos((lambda - longitude(sun.subsolarLongitudeDeg)) * RAD);
  return Math.asin(Math.max(-1, Math.min(1, sin))) / RAD;
}
