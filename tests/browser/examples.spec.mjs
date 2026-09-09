import { test, expect } from '@playwright/test';

for (const engine of ['comparison', 'maplibre', 'leaflet']) {
  test(`${engine} Earthshade band switches redraw and retain selections`, async ({ page }) => {
    // This journey waits for several complete map renders; software WebKit can
    // exceed the default budget. Responsiveness is measured by the soak suite.
    test.setTimeout(90_000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`/examples/${engine}/`);
    await page.waitForFunction(() => window.twilightExample);
    await expect(page).toHaveTitle(/Earthshade/);
    const settle = () => page.evaluate(async () => {
      const { ml } = window.twilightExample;
      if (ml && !ml.loaded()) await new Promise(resolve => ml.once('idle', resolve));
    });
    await settle();
    const bandNames = ['civil', 'nautical', 'astronomical', 'night'];
    for (const band of bandNames) {
      await page.locator(`#band-${band}`).uncheck();
      await expect(page.locator(`.legend-item[data-band="${band}"]`)).toHaveAttribute('data-hidden', 'true');
    }
    await settle();
    const clearMap = engine !== 'leaflet' ? await page.locator('#maplibre').screenshot() : null;
    if (engine !== 'maplibre') {
      expect(await page.evaluate(() => {
        const { lf } = window.twilightExample;
        const layer = Object.values(lf._layers).find(l => l.options?.pane?.startsWith('earthshade-'));
        const canvas = layer.createTile({ x: 0, y: 0, z: 0 }, () => {});
        return canvas.getContext('2d').getImageData(0, 0, 256, 256).data.every((v, i) => i % 4 !== 3 || v === 0);
      })).toBe(true);
    }
    await page.locator('#visible').uncheck();
    await page.locator('#time').fill('2026-12-21T12:00');
    await page.locator('#time').dispatchEvent('change');
    await page.locator('#visible').check();
    for (const band of bandNames) await expect(page.locator(`#band-${band}`)).not.toBeChecked();
    await page.locator('#band-civil').check();
    for (const band of bandNames.slice(1)) await expect(page.locator(`#band-${band}`)).not.toBeChecked();
    await settle();
    if (clearMap) expect((await page.locator('#maplibre').screenshot()).equals(clearMap)).toBe(false);
    if (engine !== 'maplibre') {
      expect(await page.evaluate(() => {
        const { lf } = window.twilightExample;
        const layer = Object.values(lf._layers).find(l => l.options?.pane?.startsWith('earthshade-'));
        const canvas = layer.createTile({ x: 0, y: 0, z: 0 }, () => {});
        const pixels = canvas.getContext('2d').getImageData(0, 0, 256, 256).data;
        return [...new Set(pixels.filter((v, i) => i % 4 === 3))].sort((a, b) => a - b);
      })).toEqual([0, 77]); // Only civil twilight has been restored.
    }
    expect(errors).toEqual([]);
  });

  test(`${engine} rejects invalid dates and recovers without uncaught errors`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`/examples/${engine}/`);
    await page.waitForFunction(() => window.twilightExample);
    await page.evaluate(() => {
      window.timeCalls = [];
      window.twilightExample.overlays.forEach((overlay, i, overlays) => {
        overlays[i] = { ...overlay, setTime(value) { window.timeCalls.push(`${i}:${Number(value)}`); overlay.setTime(value); } };
      });
    });
    for (const value of ['', '1899-12-31T23:59', '2101-01-01T00:00']) {
      await page.locator('#time').fill(value);
      await page.locator('#time').dispatchEvent('change');
      await expect(page.getByRole('alert')).toContainText('map time has not changed');
      await expect(page.locator('#time')).toHaveAttribute('aria-invalid', 'true');
      expect(await page.evaluate(() => window.timeCalls.length)).toBe(0);
    }
    await page.locator('#time').fill('2000-02-29T12:00');
    await page.locator('#time').dispatchEvent('change');
    await expect(page.locator('#time-error')).toBeEmpty();
    expect(await page.evaluate(() => [...new Set(window.timeCalls)])).toEqual(
      Array.from({ length: engine === 'comparison' ? 2 : 1 }, (_, i) => `${i}:${Date.UTC(2000, 1, 29, 12)}`));
    await page.locator('#live').check();
    await expect(page.locator('#time')).toBeDisabled();
    await page.locator('#live').uncheck();
    await expect(page.locator('#time')).toBeEnabled();
    await expect(page.locator('nav a[aria-current="page"]')).toHaveAttribute('href', `../${engine}/`);
    await expect(page.getByRole('navigation', { name: 'Examples' }).getByRole('link')).toHaveCount(3);
    expect(errors).toEqual([]);
  });
}

for (const engine of ['maplibre', 'leaflet']) {
  test(`${engine} standalone does not load the other engine`, async ({ page }) => {
    const requests = [];
    page.on('request', r => requests.push(r.url()));
    await page.goto(`/examples/${engine}/`);
    await page.waitForFunction(() => window.twilightExample);
    const other = engine === 'maplibre' ? 'leaflet' : 'maplibre-gl';
    expect(requests.filter(url => url.includes(other))).toEqual([]);
  });
}

test('demo navigation supports Back and preserves controllers on a cached page', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/examples/comparison/');
  await page.waitForFunction(() => window.twilightExample);
  // Exercise the persisted-page lifecycle even when the test browser disables BFCache.
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.twilightExample.overlays.forEach(o => o.refresh());
  });
  await page.getByRole('navigation', { name: 'Examples' }).getByRole('link', { name: 'Leaflet', exact: true }).click();
  await page.waitForFunction(() => window.twilightExample);
  await expect(page.locator('#maplibre')).toHaveCount(0);
  await page.goBack();
  await page.waitForFunction(() => window.twilightExample);
  await page.locator('#time').fill('2026-12-21T12:00');
  await page.locator('#time').dispatchEvent('change');
  await expect(page.locator('#time-error')).toBeEmpty();
  expect(await page.evaluate(() => window.twilightExample.overlays.length)).toBe(2);
  expect(errors).toEqual([]);
});
