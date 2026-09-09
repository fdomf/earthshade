import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTile } from '../dist/raster/index.js';
import { solarPosition } from '../dist/core/index.js';
import { renderTile as baseline } from './performance/baseline-renderer.mjs';

test('optimized renderer preserves every RGBA byte across dates, world copies and palettes', () => {
  let seed = 123456789;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < 40; i++) {
    const z = i % 10, n = 2 ** z;
    const request = { z, x: Math.floor(random() * n * 4) - n * 2, y: Math.floor(random() * n), size: i % 2 ? 512 : 256 };
    const sun = solarPosition(Date.UTC(1900 + i * 5, i % 12, 1 + i % 28, i % 24));
    const palette = i % 3 ? undefined : Object.fromEntries(['civil', 'nautical', 'astronomical', 'night'].map(band => [band, [0, 0, 0, 0].map(() => Math.floor(random() * 256))]));
    assert.deepEqual(renderTile(request, sun, palette), baseline(request, sun, palette));
  }
  const palette = { civil: [255, 1, 29, 0], nautical: [1, 255, 12, 255], astronomical: [72, 3, 255, 1], night: [4, 5, 6, 0] };
  const request = { x: 0, y: 0, z: 0, size: 512 }, sun = solarPosition(0);
  assert.deepEqual(renderTile(request, sun, palette), baseline(request, sun, palette));
});
