/** UTC instant, as a Date or Unix milliseconds; 1900 through 2100 inclusive. */
export type TimeInput = Date | number;
export type TwilightBand = 'day' | 'civil' | 'nautical' | 'astronomical' | 'night';
export interface SolarPosition {
  readonly timestampMs: number;
  readonly declinationDeg: number;
  /** East-positive longitude in [-180, 180). */
  readonly subsolarLongitudeDeg: number;
}
export interface GeographicPoint {
  /** Latitude in [-90, 90] degrees. */
  readonly latitudeDeg: number;
  /** East-positive degrees; world copies are normalized. */
  readonly longitudeDeg: number;
}
