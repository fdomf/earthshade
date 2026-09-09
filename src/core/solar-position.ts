import type { SolarPosition, TimeInput } from './types.js';
import { longitude, RAD, timestamp } from './validation.js';

/**
 * Approximate geocentric solar declination and subsolar longitude, in degrees.
 * Meeus/NOAA equation-of-time model; no atmospheric refraction. Throws RangeError
 * for invalid time or instants outside [1900-01-01, 2101-01-01) UTC.
 * See tests/fixtures/solar.json for reference provenance and README.md for approximation limits.
 */
export function solarPosition(time: TimeInput): SolarPosition {
  const timestampMs = timestamp(time);
  const t = (timestampMs / 86400000 + 2440587.5 - 2451545) / 36525;
  const meanLongitude = ((280.46646 + t * (36000.76983 + 0.0003032 * t)) % 360 + 360) % 360;
  const anomaly = (357.52911 + t * (35999.05029 - 0.0001537 * t)) * RAD;
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const center = Math.sin(anomaly) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(2 * anomaly) * (0.019993 - 0.000101 * t) + Math.sin(3 * anomaly) * 0.000289;
  const omega = (125.04 - 1934.136 * t) * RAD;
  const apparentLongitude = (meanLongitude + center - 0.00569 - 0.00478 * Math.sin(omega)) * RAD;
  const obliquity = (23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - 0.001813 * t))) / 60) / 60
    + 0.00256 * Math.cos(omega)) * RAD;
  const declinationDeg = Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude)) / RAD;
  const y = Math.tan(obliquity / 2) ** 2;
  const l = meanLongitude * RAD;
  const equationMinutes = 4 / RAD * (y * Math.sin(2 * l) - 2 * eccentricity * Math.sin(anomaly)
    + 4 * eccentricity * y * Math.sin(anomaly) * Math.cos(2 * l)
    - 0.5 * y * y * Math.sin(4 * l) - 1.25 * eccentricity ** 2 * Math.sin(2 * anomaly));
  const utcMinutes = ((timestampMs % 86400000 + 86400000) % 86400000) / 60000;
  return Object.freeze({ timestampMs, declinationDeg, subsolarLongitudeDeg: longitude(180 - (utcMinutes + equationMinutes) / 4) });
}
