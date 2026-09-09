import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) || ['blob:', 'data:'].includes(url.protocol) ? route.continue() : route.abort();
  });
});

async function ready(page, engine = 'comparison') {
  await page.goto(`/examples/${engine}/`);
  await page.waitForFunction(() => window.twilightExample);
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
}

for (const example of ['comparison', 'maplibre']) {
  test(`${example} globe button switches the default projection in both directions`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/examples/${example}/`);
    await page.waitForFunction(() => window.twilightExample);
    const projection = () => page.evaluate(() => window.twilightExample.ml.getProjection()?.type ?? 'mercator');
    expect(await projection()).toBe('mercator');
    const button = page.getByRole('button', { name: 'Toggle globe' });
    await button.click();
    await expect.poll(projection).toBe('globe');
    await button.click();
    await expect.poll(projection).toBe('mercator');
    expect(errors).toEqual([]);
  });
}

test('both adapters render, preserve interaction and change compositing without regenerating tiles', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  const before = await page.evaluate(() => {
    const { ml, lf } = window.twilightExample;
    const id = ml.getStyle().layers.find(layer => layer.id.startsWith('earthshade-')).id;
    return { id, url: ml.getStyle().sources[id].tiles[0], panes: Object.keys(lf.getPanes()) };
  });
  await page.getByLabel('MapLibre marker', { exact: true }).click();
  await page.getByLabel('Leaflet marker', { exact: true }).click();
  await expect(page.getByLabel('MapLibre marker', { exact: true })).toHaveAttribute('data-clicked', 'true');
  await expect(page.getByLabel('Leaflet marker', { exact: true })).toHaveAttribute('data-clicked', 'true');
  await page.locator('#opacity').fill('0.5');
  expect(await page.evaluate(id => {
    const { ml, lf } = window.twilightExample;
    const pane = Object.values(lf.getPanes()).find(p => p.className.includes('earthshade-'));
    return { url: ml.getStyle().sources[id].tiles[0], opacity: ml.getPaintProperty(id, 'raster-opacity'), pointer: pane.style.pointerEvents, z: pane.style.zIndex };
  }, before.id)).toEqual({ url: before.url, opacity: .5, pointer: 'none', z: '350' });
  await page.locator('#visible').uncheck();
  expect(await page.evaluate(id => window.twilightExample.ml.getLayoutProperty(id, 'visibility'), before.id)).toBe('none');
  await page.locator('#visible').check();
  const beforeTimeImage = await page.locator('#maplibre').screenshot();
  await page.evaluate(() => {
    const { ml } = window.twilightExample;
    window.twilightRenderDone = new Promise(resolve => {
      const changed = event => {
        if (event.sourceId?.startsWith('earthshade-') && event.sourceDataType === 'content') {
          ml.off('sourcedata', changed);
          ml.once('idle', () => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
      };
      ml.on('sourcedata', changed);
    });
  });
  await page.locator('#time').fill('2026-12-21T12:00');
  await page.locator('#time').dispatchEvent('change');
  expect(await page.evaluate(id => window.twilightExample.ml.getStyle().sources[id].tiles[0], before.id)).not.toBe(before.url);
  await page.evaluate(() => window.twilightRenderDone);
  expect((await page.locator('#maplibre').screenshot()).equals(beforeTimeImage)).toBe(false);
  await page.screenshot({ path: test.info().outputPath('comparison.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('MapLibre restores fixed-time state after style replacement and supports globe', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const { ml, addMapLibre, style } = window.twilightExample;
    const errors = [];
    // Wait for the first overlay's source to finish before attaching another.
    if (!ml.isStyleLoaded()) await new Promise(resolve => ml.once('idle', resolve));
    const overlay = addMapLibre(ml, { time: Date.UTC(2000, 0, 1), beforeId: 'grid', opacity: .4, onError: e => errors.push(e.message) });
    const old = ml.getStyle().layers.filter(l => l.id.startsWith('earthshade-'));
    const id = old.find(l => l.paint['raster-opacity'] === .4).id;
    const url = ml.getStyle().sources[id].tiles[0];
    const replacement = style();
    replacement.layers = replacement.layers.filter(l => l.id !== 'grid');
    const loaded = new Promise(resolve => ml.once('style.load', resolve));
    ml.setStyle(replacement, { diff: false });
    await loaded;
    const restored = { url: ml.getStyle().sources[id].tiles[0], opacity: ml.getPaintProperty(id, 'raster-opacity'), count: ml.getStyle().layers.filter(l => l.id.startsWith('earthshade-')).length };
    ml.setProjection({ type: 'globe' });
    await new Promise(resolve => ml.once('idle', resolve));
    const projection = ml.getProjection().type;
    overlay.dispose();
    return { url, restored, projection, errors, remaining: ml.getStyle().layers.filter(l => l.id.startsWith('earthshade-')).length };
  });
  expect(result.restored).toEqual({ url: result.url, opacity: .4, count: 2 });
  expect(result.projection).toBe('globe');
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0]).toContain('disappeared');
  expect(result.remaining).toBe(1);
  await page.screenshot({ path: test.info().outputPath('globe.png'), fullPage: true });
});

test('multiple maps and overlays release only their own resources', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const { ml, lf, L, maplibre, addMapLibre, addLeaflet, style, overlays } = window.twilightExample;
    if (!ml.isStyleLoaded()) await new Promise(resolve => ml.once('idle', resolve));
    const initialPanes = Object.keys(lf.getPanes()).length;
    const extraLeaflet = addLeaflet(lf, { time: 0 });
    const extraMapLibre = addMapLibre(ml, { time: 0 });
    const immediate = addMapLibre(ml, { time: 0 });
    immediate.dispose();
    const container = () => {
      const div = document.createElement('div'); div.style.cssText = 'height:240px;width:320px'; document.body.append(div); return div;
    };
    const ml2 = new maplibre.Map({ container: container(), style: style(), zoom: 0, attributionControl: false });
    await new Promise(resolve => ml2.once('load', resolve));
    const m2 = addMapLibre(ml2, { time: 0 });
    const lf2 = L.map(container(), { attributionControl: false }).setView([0, 0], 1);
    const l2 = addLeaflet(lf2, { time: 0 });
    extraMapLibre.dispose(); extraLeaflet.dispose();
    const own = { ml: ml.getStyle().layers.filter(l => l.id.startsWith('earthshade-')).length, panes: Object.keys(lf.getPanes()).length };
    ml2.remove(); lf2.remove();
    let disposed = 0;
    for (const overlay of [m2, l2]) { try { overlay.refresh(); } catch { disposed++; } overlay.dispose(); }
    overlays.forEach(o => o.refresh());
    for (let i = 0; i < 10; i++) { const o = addLeaflet(lf, { time: 0 }); o.dispose(); }
    return { initialPanes, own, disposed, after: Object.keys(lf.getPanes()).length };
  });
  expect(result.own).toEqual({ ml: 1, panes: result.initialPanes });
  expect(result.disposed).toBe(2);
  expect(result.after).toBe(result.initialPanes);
});

test('Leaflet custom panes, unsupported CRS, hidden attachment and external layer removal', async ({ page }) => {
  await ready(page, 'leaflet');
  const result = await page.evaluate(() => {
    const { lf, L, addLeaflet } = window.twilightExample;
    const borrowed = lf.createPane('host-pane'); borrowed.style.zIndex = '425'; borrowed.style.pointerEvents = 'auto';
    const overlay = addLeaflet(lf, { pane: 'host-pane', visible: false, time: 0 });
    const layer = Object.values(lf._layers).find(l => l.options?.pane === 'host-pane');
    const hidden = layer.getContainer().style.display;
    overlay.setVisible(true);
    lf.panTo([30, 80], { animate: false }); lf.setZoom(3, { animate: false });
    lf.removeLayer(layer);
    let disposed = false;
    try { overlay.refresh(); } catch { disposed = true; }
    const div = document.createElement('div'); document.body.append(div);
    const other = L.map(div, { crs: L.CRS.Simple }).setView([0, 0], 1);
    let rejected = false;
    try { addLeaflet(other); } catch (e) { rejected = e.message.includes('EPSG:3857'); }
    other.remove();
    return { hidden, disposed, rejected, connected: borrowed.isConnected, pointer: borrowed.style.pointerEvents, z: borrowed.style.zIndex };
  });
  expect(result).toEqual({ hidden: 'none', disposed: true, rejected: true, connected: true, pointer: 'auto', z: '425' });
});

test('Leaflet canvas failures report through both error channels', async ({ page }) => {
  await ready(page, 'leaflet');
  const result = await page.evaluate(async () => {
    const { lf, addLeaflet } = window.twilightExample;
    const original = HTMLCanvasElement.prototype.getContext;
    const errors = [];
    HTMLCanvasElement.prototype.getContext = function () { return null; };
    const overlay = addLeaflet(lf, { time: 0, onError: error => errors.push(error.message) });
    const layer = Object.values(lf._layers).filter(l => l.options?.pane?.startsWith('earthshade-')).at(-1);
    let events = 0; layer.on('tileerror', () => events++);
    await new Promise(resolve => setTimeout(resolve, 0));
    HTMLCanvasElement.prototype.getContext = original;
    overlay.dispose();
    return { errors, events };
  });
  expect(result.errors.length).toBeGreaterThan(0);
  expect(result.events).toBe(result.errors.length);
  expect(result.errors[0]).toContain('canvas context');
});

test('Leaflet ignores failed tiles from an obsolete revision', async ({ page }) => {
  await ready(page, 'leaflet');
  const result = await page.evaluate(async () => {
    const { lf, addLeaflet } = window.twilightExample;
    const original = HTMLCanvasElement.prototype.getContext;
    const errors = [];
    HTMLCanvasElement.prototype.getContext = () => null;
    const overlay = addLeaflet(lf, { time: 0, onError: error => errors.push(error.message) });
    HTMLCanvasElement.prototype.getContext = original;
    overlay.refresh();
    await new Promise(resolve => setTimeout(resolve, 0));
    overlay.dispose();
    return errors;
  });
  expect(result).toEqual([]);
});

test('MapLibre failed attachment unwinds source, protocol and listeners', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const { ml, addMapLibre } = window.twilightExample;
    if (!ml.isStyleLoaded()) await new Promise(resolve => ml.once('idle', resolve));
    const before = Object.keys(ml.getStyle().sources);
    let missing = false;
    try { addMapLibre(ml, { beforeId: 'missing' }); } catch { missing = true; }
    const original = ml.addLayer;
    ml.addLayer = () => { throw new Error('simulated layer failure'); };
    let failed = false;
    try { addMapLibre(ml, { time: 0 }); } catch (e) { failed = e.message === 'simulated layer failure'; }
    ml.addLayer = original;
    return { before, after: Object.keys(ml.getStyle().sources), missing, failed };
  });
  expect(result.after).toEqual(result.before);
  expect(result.missing).toBe(true);
  expect(result.failed).toBe(true);
});

test('MapLibre aborts queued async transforms before disposal removes their protocol', async ({ page }) => {
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/^AbortError: (Twilight tile request cancelled|Obsolete Twilight revision|AbortError)$/.test(message.text().split('\n')[0])) failures.push(message.text());
  });
  await ready(page);
  const reported = await page.evaluate(async () => {
    const { ml, addMapLibre } = window.twilightExample;
    const errors = [];
    ml.setTransformRequest(async url => {
      if (url.startsWith('earthshade-')) await new Promise(resolve => setTimeout(resolve, 40));
      return { url };
    });
    for (let i = 0; i < 20; i++) {
      const overlay = addMapLibre(ml, { time: 0, onError: error => errors.push(error.message) });
      ml.jumpTo({ center: [i * 17 - 170, i - 10], zoom: i % 4 });
      await new Promise(resolve => requestAnimationFrame(resolve));
      overlay.refresh();
      await new Promise(resolve => requestAnimationFrame(resolve));
      overlay.refresh(); overlay.dispose();
    }
    await new Promise(resolve => setTimeout(resolve, 150));
    return errors;
  });
  expect(reported).toEqual([]);
  expect(failures).toEqual([]);
});

test('Leaflet canvases match the shared renderer pixels', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const { lf } = window.twilightExample;
    const { renderTile } = await import('/src/raster/index.ts');
    const { solarPosition } = await import('/src/core/index.ts');
    const layer = Object.values(lf._layers).find(l => l.options?.pane?.startsWith('earthshade-'));
    const sample = Object.values(layer._tiles).find(t => t.loaded);
    const expected = renderTile(sample.coords, solarPosition(Date.UTC(2026, 8, 9, 20)));
    const actual = sample.el.getContext('2d').getImageData(0, 0, 256, 256).data;
    let maxDifference = 0, alphaDifference = 0;
    for (let i = 0; i < actual.length; i++) {
      const difference = Math.abs(actual[i] - expected.data[i]);
      if (i % 4 === 3) alphaDifference = Math.max(alphaDifference, difference);
      else maxDifference = Math.max(maxDifference, difference);
    }
    return { maxDifference, alphaDifference, length: actual.length };
  });
  // At alpha 77/255, 8-bit premultiplication/readback can move RGB by two bytes.
  expect(result.maxDifference).toBeLessThanOrEqual(2);
  expect(result.alphaDifference).toBe(0);
  expect(result.length).toBe(256 * 256 * 4);
});

test('Leaflet batches refresh bursts and drops queued work after disposal', async ({ page }) => {
  await ready(page, 'leaflet');
  const result = await page.evaluate(async () => {
    const { lf, overlays } = window.twilightExample;
    const overlay = overlays[0];
    const layer = Object.values(lf._layers).find(l => l.options?.pane?.startsWith('earthshade-'));
    const original = layer.redraw.bind(layer);
    let redraws = 0;
    layer.redraw = () => { redraws++; return original(); };
    overlay.setTime(0); overlay.refresh(); overlay.refresh();
    overlay.setVisible(false); overlay.setVisible(true);
    await new Promise(queueMicrotask);
    const afterBurst = redraws;
    const loaded = Object.values(layer._tiles).some(tile => tile.loaded);
    overlay.refresh(); overlay.dispose();
    await new Promise(queueMicrotask);
    return { afterBurst, afterDisposal: redraws, loaded };
  });
  expect(result).toEqual({ afterBurst: 1, afterDisposal: 1, loaded: true });
});
