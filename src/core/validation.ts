import type { SolarPosition, TimeInput } from './types.js';

export const RAD = Math.PI / 180;
export const MIN_TIMESTAMP = Date.UTC(1900, 0, 1);
export const MAX_TIMESTAMP = Date.UTC(2101, 0, 1);

export function finite(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
}

export function inRange(value: number, min: number, max: number, name: string): number {
  finite(value, name);
  if (value < min || value > max) throw new RangeError(`${name} must be in [${min}, ${max}]`);
  return value;
}

export function timestamp(time: TimeInput): number {
  const ms = time instanceof Date ? time.getTime() : time;
  finite(ms, 'time');
  if (ms < MIN_TIMESTAMP || ms >= MAX_TIMESTAMP) throw new RangeError('time must be within UTC years 1900–2100');
  return ms;
}

export function longitude(degrees: number): number {
  finite(degrees, 'longitudeDeg');
  return ((degrees % 360 + 540) % 360) - 180;
}

export function validateSun(sun: SolarPosition): void {
  timestamp(sun.timestampMs);
  inRange(sun.declinationDeg, -90, 90, 'declinationDeg');
  finite(sun.subsolarLongitudeDeg, 'subsolarLongitudeDeg');
}
