import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solarPosition, solarElevation, classifyTwilight } from '../dist/core/index.js';
import { renderTile, DEFAULT_PALETTE } from '../dist/raster/index.js';

const sun = solarPosition(Date.UTC(2026, 8, 22, 18));
const colorAt = (tile, x, y) => [...tile.data.slice((y * tile.width + x) * 4, (y * tile.width + x + 1) * 4)];

test('world copies have identical pixels and independent storage', () => {
  const tile = renderTile({ x: 0, y: 0, z: 1 }, sun);
  for (const x of [-4, -2, 2, 4]) assert.deepEqual(renderTile({ x, y: 0, z: 1 }, sun).data, tile.data);
  const next = renderTile({ x: 0, y: 0, z: 1 }, sun);
  tile.data.fill(255);
  assert.notDeepEqual(tile.data, next.data);
  assert.ok(Object.isFrozen(DEFAULT_PALETTE) && Object.values(DEFAULT_PALETTE).every(Object.isFrozen));
});

test('tile seams and dateline sample the expected geographic pixel centers', () => {
  for (const [x, y, z] of [[0, 0, 0], [0, 1, 2], [1, 1, 2], [3, 1, 2], [0, 2, 2]]) {
    for (const size of [256, 512]) {
      const tile = renderTile({ x, y, z, size }, sun);
      for (const col of [0, 1, size / 2, size - 2, size - 1]) for (const row of [0, 1, size / 2, size - 2, size - 1]) {
        const longitudeDeg = (x + (col + .5) / size) / 2 ** z * 360 - 180;
        const latitudeDeg = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + (row + .5) / size) / 2 ** z))) * 180 / Math.PI;
        const band = classifyTwilight(solarElevation({ latitudeDeg, longitudeDeg }, sun));
        assert.deepEqual(colorAt(tile, col, row), band === 'day' ? [0, 0, 0, 0] : DEFAULT_PALETTE[band]);
      }
    }
  }
});

test('512 parent pixels exactly match its four 256 children at identical locations', () => {
  const parent = renderTile({ x: 0, y: 0, z: 0, size: 512 }, sun);
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) {
    const child = renderTile({ x, y, z: 1 }, sun);
    for (let row = 0; row < 256; row++) {
      assert.deepEqual(child.data.slice(row * 1024, (row + 1) * 1024), parent.data.slice(((y * 256 + row) * 512 + x * 256) * 4, ((y * 256 + row) * 512 + x * 256 + 256) * 4));
    }
  }
});

test('bad tiles, snapshots and palettes are rejected', () => {
  for (const tile of [{ x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 }, { x: .1, y: 0, z: 0 }, { x: 0, y: 0, z: 23 }, { x: 0, y: 0, z: .1 }, { x: Infinity, y: 0, z: 0 }, { x: 0, y: 0, z: 0, size: 1024 }]) assert.throws(() => renderTile(tile, sun));
  for (const color of [[0, 0, 0, -1], [0, 0, 0, 256], [0, 0, 0, .5], [0, 0, 0], [0, NaN, 0, 0]]) assert.throws(() => renderTile({ x: 0, y: 0, z: 0 }, sun, { ...DEFAULT_PALETTE, night: color }));
  assert.throws(() => renderTile({ x: 0, y: 0, z: 0 }, { ...sun, timestampMs: NaN }));
});
