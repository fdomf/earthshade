import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { cpus, loadavg } from 'node:os';

test('sustained refresh, navigation, styles and disposal', async ({ page, browser }) => {
  const duration = Number(process.env.SOAK_DURATION_MS ?? 300000);
  const errors = [], checkpoints = [];
  let expectedCancellations = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    if (/^AbortError: (Twilight tile request cancelled|Obsolete Twilight revision|AbortError)$/.test(message.text().split('\n')[0])) expectedCancellations++;
    else errors.push(message.text());
  });
  await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.addInitScript(() => {
    const listeners = new Set();
    const add = document.addEventListener.bind(document), remove = document.removeEventListener.bind(document);
    document.addEventListener = (type, listener, options) => { if (type === 'visibilitychange') listeners.add(listener); return add(type, listener, options); };
    document.removeEventListener = (type, listener, options) => { if (type === 'visibilitychange') listeners.delete(listener); return remove(type, listener, options); };
    const lags = [];
    let last = performance.now(), count = 0, maxLag = 0;
    const timer = setInterval(() => {
      const now = performance.now(), lag = Math.max(0, now - last - 100);
      last = now; maxLag = Math.max(maxLag, lag); lags[count++ % 4096] = lag;
    }, 100);
    window.soak = { listeners, lags, metrics: () => ({ maxLag, samples: count }), stop: () => clearInterval(timer) };
  });
  await page.goto('/examples/comparison/');
  await page.waitForFunction(() => window.twilightExample);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  const settle = () => page.evaluate(async () => {
    const { ml } = window.twilightExample;
    await new Promise(resolve => setTimeout(resolve, 100));
    if (!ml.loaded()) await new Promise(resolve => ml.once('idle', resolve));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  async function checkpoint(cycle) {
    await page.evaluate(async () => {
      const { ml, lf, overlays, style } = window.twilightExample;
      overlays.forEach(o => { o.setTime(0); o.setVisible(true); o.setOpacity(1); });
      ml.jumpTo({ center: [0, 15], zoom: .6 }); lf.setView([15, 0], 1, { animate: false });
      const loaded = new Promise(resolve => ml.once('style.load', resolve));
      ml.setStyle(style(), { diff: false }); await loaded;
    });
    await settle();
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = await cdp.send('Runtime.getHeapUsage');
    const dom = await cdp.send('Memory.getDOMCounters');
    const owned = await page.evaluate(() => {
      const { ml, lf } = window.twilightExample;
      return { layers: ml.getStyle().layers.filter(l => l.id.startsWith('earthshade-')).length,
        sources: Object.keys(ml.getStyle().sources).filter(id => id.startsWith('earthshade-')).length,
        panes: Object.keys(lf.getPanes()).filter(id => id.startsWith('earthshade-')).length,
        visibilityListeners: window.soak.listeners.size };
    });
    checkpoints.push({ cycle, elapsedMs: Date.now() - start, heap, dom, owned });
    console.log(`Soak cycle ${cycle}: heap ${(heap.usedSize / 1048576).toFixed(1)} MiB, ${dom.nodes} DOM nodes`);
    expect(owned).toEqual(checkpoints[0].owned);
    expect(owned.layers).toBe(1); expect(owned.sources).toBe(1); expect(owned.panes).toBe(1);
    expect(errors).toEqual([]);
  }
  const start = Date.now(), startLoad = loadavg();
  let cycles = 0;
  try {
    await checkpoint(0);
    do {
      await page.evaluate(async cycle => {
        const { ml, lf, overlays, addMapLibre, addLeaflet, maplibre, L, style } = window.twilightExample;
        const onError = error => { throw error; };
        const extra = [addMapLibre(ml, { time: 'live', refreshIntervalMs: 1000, onError }), addLeaflet(lf, { time: 'live', refreshIntervalMs: 1000, onError })];
        for (const o of overlays) {
          o.setTime(cycle % 3 ? Date.UTC(2000 + cycle % 80, cycle % 12, 1, cycle % 24) : 'live');
          o.setPalette({ civil: [160, 140, 120, 77], nautical: [90, 80, 70, 102], astronomical: [33, 33, 33, 128], night: [0, 0, 0, 166] });
          o.refresh(); o.refresh(); o.setVisible(false); o.setVisible(true); o.setOpacity(.5);
        }
        ml.jumpTo({ center: [(cycle * 37) % 360 - 180, cycle % 100 - 50], zoom: cycle % 4 });
        lf.setView([cycle % 100 - 50, (cycle * 37) % 360 - 180], 1 + cycle % 3, { animate: false });
        if (cycle % 5 === 0) {
          const loaded = new Promise(resolve => ml.once('style.load', resolve));
          ml.setStyle(style(), { diff: false }); await loaded;
          ml.setProjection({ type: cycle % 10 ? 'globe' : 'mercator' });
        }
        // Leave live controllers attached long enough to exercise their timers periodically.
        await new Promise(resolve => setTimeout(resolve, cycle % 10 === 0 ? 1200 : 100));
        extra.forEach(o => o.dispose());
        for (const o of extra) {
          let rejected = false; try { o.refresh(); } catch { rejected = true; }
          if (!rejected) throw new Error('Disposed controller remained active');
          o.dispose();
        }
        if (cycle % 20 === 0) {
          const containers = [0, 1].map(() => { const div = document.createElement('div'); div.style.cssText = 'height:200px;width:300px'; document.body.append(div); return div; });
          const a = new maplibre.Map({ container: containers[0], style: style(), attributionControl: false });
          await new Promise(resolve => a.once('load', resolve));
          const b = L.map(containers[1]).setView([0, 0], 1);
          const attached = [addMapLibre(a, { time: 'live', refreshIntervalMs: 1000 }), addLeaflet(b, { time: 'live', refreshIntervalMs: 1000 })];
          a.remove(); b.remove(); attached.forEach(o => o.dispose()); containers.forEach(div => div.remove());
        }
      }, cycles);
      cycles++;
      if (cycles % 20 === 0) await checkpoint(cycles);
    } while (Date.now() - start < duration || cycles < 40);
    await checkpoint(cycles);
    // Exclude initial engine/cache warmup. Same view and ownership at every checkpoint.
    const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const usable = checkpoints.slice(1), width = Math.min(3, Math.floor(usable.length / 2));
    expect(width, 'need enough checkpoints for a heap comparison').toBeGreaterThan(0);
    const first = usable.slice(0, width), last = usable.slice(-width);
    const growth = median(last.map(x => x.heap.usedSize)) - median(first.map(x => x.heap.usedSize));
    expect(growth, 'post-GC heap growth, excludes native/GPU memory').toBeLessThan(8 * 1048576);
    const nodeGrowth = median(last.map(x => x.dom.nodes)) - median(first.map(x => x.dom.nodes));
    expect(nodeGrowth, 'DOM retention after returning to the same view').toBeLessThan(500);
    expect(errors).toEqual([]);
  } finally {
    const responsiveness = await page.evaluate(() => {
      window.soak.stop();
      const samples = [...window.soak.lags].sort((a, b) => a - b);
      return { ...window.soak.metrics(), retainedSamples: samples.length, p95LagMs: samples[Math.ceil(samples.length * .95) - 1] };
    }).catch(error => ({ unavailable: error.message }));
    const report = { utc: new Date().toISOString(), browser: browser.version(), cpu: cpus()[0]?.model,
      startLoad, endLoad: loadavg(), requestedMs: duration, elapsedMs: Date.now() - start, cycles, errors, expectedCancellations, responsiveness, checkpoints,
      limitation: 'Desktop Chromium, software WebGL. Post-GC JS heap and DOM only; no native/GPU memory or physical-device claim.' };
    await writeFile(test.info().outputPath('soak.json'), JSON.stringify(report, null, 2));
    await test.info().attach('soak', { body: JSON.stringify(report), contentType: 'application/json' });
    await page.evaluate(() => { const { ml, lf, overlays } = window.twilightExample; overlays.forEach(o => o.dispose()); ml.remove(); lf.remove(); }).catch(() => {});
  }
});
