import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { solarPosition, solarElevation, classifyTwilight, TWILIGHT_BANDS } from '../dist/core/index.js';

test('NOAA regression vectors and independent Astronomy Engine vectors', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/solar.json', import.meta.url)));
  for (const row of fixture.vectors) {
    const sun = solarPosition(new Date(row.utc));
    for (const reference of ['noaa', 'independent']) {
      const tolerance = reference === 'noaa' ? 1e-8 : 0.03;
      assert.ok(Math.abs(sun.declinationDeg - row[reference].declinationDeg) < tolerance, `${row.utc} ${reference} declination`);
      const difference = ((sun.subsolarLongitudeDeg - row[reference].subsolarLongitudeDeg + 540) % 360) - 180;
      assert.ok(Math.abs(difference) < tolerance, `${row.utc} ${reference} longitude: ${difference}`);
    }
  }
});

test('thresholds belong to the brighter band, including each side', () => {
  for (const [boundary, brighter, darker] of [[0, 'day', 'civil'], [-6, 'civil', 'nautical'], [-12, 'nautical', 'astronomical'], [-18, 'astronomical', 'night']]) {
    assert.equal(classifyTwilight(boundary), brighter);
    assert.equal(classifyTwilight(boundary + 1e-9), brighter);
    assert.equal(classifyTwilight(boundary - 1e-9), darker);
  }
  assert.equal(classifyTwilight(90), 'day');
  assert.equal(classifyTwilight(-90), 'night');
  assert.ok(Object.isFrozen(TWILIGHT_BANDS) && TWILIGHT_BANDS.every(Object.isFrozen));
});

test('subsolar, antipodal and geographic polar geometry', () => {
  const sun = solarPosition(Date.UTC(2026, 5, 21, 12));
  assert.ok(Math.abs(solarElevation({ latitudeDeg: sun.declinationDeg, longitudeDeg: sun.subsolarLongitudeDeg }, sun) - 90) < 1e-5);
  assert.ok(Math.abs(solarElevation({ latitudeDeg: -sun.declinationDeg, longitudeDeg: sun.subsolarLongitudeDeg + 180 }, sun) + 90) < 1e-5);
  assert.equal(classifyTwilight(solarElevation({ latitudeDeg: 90, longitudeDeg: 0 }, sun)), 'day');
  assert.equal(classifyTwilight(solarElevation({ latitudeDeg: -90, longitudeDeg: 0 }, sun)), 'night');
  assert.equal(solarElevation({ latitudeDeg: 20, longitudeDeg: -30 }, sun), solarElevation({ latitudeDeg: 20, longitudeDeg: 690 }, sun));
});

test('supported date range, immutable snapshots and invalid input', () => {
  const date = new Date('2026-09-09T00:00:00Z');
  const sun = solarPosition(date);
  date.setTime(0);
  assert.equal(sun.timestampMs, Date.UTC(2026, 8, 9));
  assert.ok(Object.isFrozen(sun));
  for (const value of [NaN, Infinity, -Infinity, new Date(NaN), '2026-09-09', Date.UTC(1899, 11, 31), Date.UTC(2101, 0, 1)]) assert.throws(() => solarPosition(value), RangeError);
  for (const value of [NaN, Infinity, -91, 91, '0']) assert.throws(() => classifyTwilight(value), RangeError);
  assert.doesNotThrow(() => solarPosition(Date.UTC(1900, 0, 1)));
  assert.doesNotThrow(() => solarPosition(Date.UTC(2101, 0, 1) - 1));
  assert.throws(() => solarElevation({ latitudeDeg: 91, longitudeDeg: 0 }, sun));
  assert.throws(() => solarElevation({ latitudeDeg: 0, longitudeDeg: NaN }, sun));
  assert.throws(() => solarElevation({ latitudeDeg: 0, longitudeDeg: 0 }, { ...sun, declinationDeg: NaN }));
});
