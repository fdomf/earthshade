import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('measure pixel generation and bitmap creation separately', async ({ page }, info) => {
  await page.goto('/examples/leaflet/');
  await page.waitForFunction(() => window.twilightExample);
  const result = await page.evaluate(async () => {
    const { renderTile } = await import('/src/raster/index.ts');
    const { solarPosition } = await import('/src/core/index.ts');
    const sun = solarPosition(Date.UTC(2026, 8, 9, 20));
    const summarize = a => { a.sort((x, y) => x - y); return { p50Ms: a[Math.floor(a.length * .5)], p95Ms: a[Math.floor(a.length * .95)] }; };
    const measurements = [];
    for (const size of [256, 512]) {
      const pixels = [], bitmapCreation = [];
      let width = 0;
      for (let i = 0; i < 35; i++) {
        const start = performance.now();
        const tile = renderTile({ x: 0, y: 0, z: 0, size }, sun);
        const rendered = performance.now();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d'); const data = ctx.createImageData(size, size); data.data.set(tile.data); ctx.putImageData(data, 0, 0);
        const bitmapStart = performance.now();
        const bitmap = await createImageBitmap(canvas);
        width = bitmap.width;
        bitmap.close();
        if (i >= 5) { pixels.push(rendered - start); bitmapCreation.push(performance.now() - bitmapStart); }
      }
      measurements.push({ size, samples: 30, render: summarize(pixels), bitmap: summarize(bitmapCreation), bitmapWidth: width });
    }
    return { userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], devicePixelRatio, time: sun.timestampMs, tile: '0/0/0', measurements };
  });
  expect(result.measurements.every(m => m.bitmapWidth === m.size)).toBe(true);
  const path = info.outputPath('benchmark.json');
  await writeFile(path, JSON.stringify(result, null, 2));
  await info.attach('tile-benchmark', { path, contentType: 'application/json' });
});
