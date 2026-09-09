// Usage: node scripts/generate-fixtures.mjs /path/to/noaa-main.js /path/to/astronomy-engine
// Downloads/installations are intentionally separate; normal tests use committed data offline.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const [noaaPath, astronomyPath] = process.argv.slice(2);
if (!noaaPath || !astronomyPath) throw new Error('Supply NOAA main.js and astronomy-engine directory paths');
const source = await readFile(noaaPath, 'utf8');
const noaa = vm.createContext({});
vm.runInContext(source, noaa);
const require = createRequire(import.meta.url);
const astronomy = require(astronomyPath);
const version = require(`${astronomyPath}/package.json`).version;
const dates = new Set(['1900-01-01T00:00:00.000Z', '2100-12-31T23:59:59.999Z', '2000-02-29T23:59:59.999Z', '2000-03-01T00:00:00.000Z', '2024-02-29T12:34:56.789Z', '2026-09-09T20:00:00.000Z']);
for (let year = 1900; year <= 2100; year += 10) {
  for (const month of [2, 5, 8, 11]) dates.add(new Date(Date.UTC(year, month, 21, 12)).toISOString());
}
const normalize = x => ((x % 360 + 540) % 360) - 180;
const vectors = [...dates].sort().map(utc => {
  const date = new Date(utc);
  const ms = date.getTime();
  const t = noaa.calcTimeJulianCent(ms / 86400000 + 2440587.5);
  const minutes = ((ms % 86400000 + 86400000) % 86400000) / 60000;
  const vector = astronomy.GeoVector(astronomy.Body.Sun, date, true);
  const eq = astronomy.EquatorFromVector(astronomy.RotateVector(astronomy.Rotation_EQJ_EQD(date), vector));
  return { utc,
    noaa: { declinationDeg: noaa.calcSunDeclination(t), subsolarLongitudeDeg: normalize(180 - (minutes + noaa.calcEquationOfTime(t)) / 4) },
    independent: { declinationDeg: eq.dec, subsolarLongitudeDeg: normalize(15 * (eq.ra - astronomy.SiderealTime(date))) },
  };
});
await mkdir('tests/fixtures', { recursive: true });
await writeFile('tests/fixtures/solar.json', JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  units: 'UTC ISO instants and degrees; east-positive longitude',
  noaa: { source: 'https://gml.noaa.gov/grad/solcalc/main.js', sha256: createHash('sha256').update(source).digest('hex'), algorithm: 'Meeus declination and equation of time', toleranceDeg: 1e-8 },
  independent: { source: 'https://github.com/cosinekitty/astronomy/tree/master/source/js', version, algorithm: 'VSOP geocentric apparent Sun, equator of date and Greenwich apparent sidereal time', toleranceDeg: 0.03 },
  vectors,
}, null, 2) + '\n');
console.log(`Generated ${vectors.length} reference vectors`);
