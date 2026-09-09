import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Runtime, controller } from '../dist/internal/controller.js';
import { DEFAULT_PALETTE, renderTile } from '../dist/raster/index.js';

function setup(t, options = {}) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.UTC(2026, 8, 9) });
  const doc = new EventTarget();
  doc.hidden = false;
  const calls = { redraw: 0, opacity: 0, visibility: 0, dispose: 0 };
  const hooks = Object.fromEntries(Object.keys(calls).map(key => [key, () => calls[key]++]));
  const runtime = new Runtime({ refreshIntervalMs: 1000, ...options }, hooks, doc);
  runtime.start();
  t.after(() => runtime.dispose());
  return { runtime, doc, calls };
}

test('live/fixed time, hidden overlay and hidden document scheduling', t => {
  const { runtime, doc, calls } = setup(t);
  const initial = runtime.snapshot.sun.timestampMs;
  t.mock.timers.tick(1000);
  assert.equal(runtime.snapshot.sun.timestampMs, initial + 1000);
  const fixed = new Date('2000-02-29T23:59:59Z');
  runtime.setTime(fixed);
  fixed.setTime(0);
  t.mock.timers.tick(10000);
  runtime.refresh();
  assert.equal(runtime.snapshot.sun.timestampMs, Date.UTC(2000, 1, 29, 23, 59, 59));
  runtime.setTime('live');
  assert.equal(runtime.snapshot.sun.timestampMs, Date.now());
  runtime.setVisible(false);
  const hidden = calls.redraw;
  t.mock.timers.tick(5000);
  assert.equal(calls.redraw, hidden);
  runtime.setVisible(true);
  assert.equal(runtime.snapshot.sun.timestampMs, Date.now());
  doc.hidden = true;
  doc.dispatchEvent(new Event('visibilitychange'));
  const background = calls.redraw;
  t.mock.timers.tick(5000);
  assert.equal(calls.redraw, background);
  doc.hidden = false;
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(runtime.snapshot.sun.timestampMs, Date.now());
  t.mock.timers.tick(1000);
  assert.equal(calls.redraw, background + 2);
});

test('palette ownership, compositing-only opacity, validation and disposal', t => {
  const { runtime, doc, calls } = setup(t, { time: Date.UTC(2020, 0, 1) });
  const first = runtime.snapshot;
  runtime.setOpacity(.5);
  assert.equal(runtime.snapshot, first);
  assert.equal(calls.opacity, 1);
  const palette = structuredClone(DEFAULT_PALETTE);
  runtime.setPalette(palette);
  palette.night[3] = 0;
  assert.equal(runtime.snapshot.palette.night[3], 166);
  for (const action of [() => runtime.setOpacity(NaN), () => runtime.setTime(new Date(NaN)), () => runtime.setVisible(1), () => runtime.setPalette({})]) {
    const before = runtime.snapshot;
    assert.throws(action);
    assert.equal(runtime.snapshot, before);
  }
  const api = controller(runtime);
  api.dispose();
  api.dispose();
  const before = calls.redraw;
  t.mock.timers.tick(10000);
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls.redraw, before);
  assert.equal(calls.dispose, 1);
  for (const method of ['setTime', 'setVisible', 'setBandVisible', 'setOpacity', 'setPalette', 'refresh']) assert.throws(() => api[method](), /disposed/);
});

test('band visibility masks only selected pixels and restores configured colors', t => {
  const { runtime, calls } = setup(t, { time: Date.UTC(2026, 8, 9, 20) });
  const api = controller(runtime);
  const tile = { x: 0, y: 0, z: 0 };
  const original = runtime.snapshot;
  const before = renderTile(tile, original.sun, original.palette).data;
  for (const band of Object.keys(DEFAULT_PALETTE)) {
    api.setBandVisible(band, false);
    const hidden = runtime.snapshot;
    api.setBandVisible(band, false);
    assert.equal(runtime.snapshot, hidden, 'repeated selection does not redraw');
    const after = renderTile(tile, hidden.sun, hidden.palette).data;
    let affected = 0;
    for (let i = 0; i < before.length; i++) {
      const masked = i % 4 === 3 && before[i] === DEFAULT_PALETTE[band][3];
      assert.equal(after[i], masked ? 0 : before[i]);
      if (masked) affected++;
    }
    assert.ok(affected > 0, `${band} must be present in the sampled tile`);
    assert.deepEqual(original.palette, DEFAULT_PALETTE, 'old snapshots stay immutable');
    api.setBandVisible(band, true);
    assert.deepEqual(runtime.snapshot.palette, DEFAULT_PALETTE);
  }
  api.setBandVisible('civil', false);
  api.setBandVisible('night', false);
  const palette = structuredClone(DEFAULT_PALETTE);
  palette.civil = [12, 34, 56, 123];
  api.setPalette(palette);
  palette.civil[3] = 42;
  api.setVisible(false);
  api.setTime(0);
  api.refresh();
  api.setVisible(true);
  assert.equal(runtime.snapshot.palette.civil[3], 0);
  assert.equal(runtime.snapshot.palette.night[3], 0);
  api.setBandVisible('civil', true);
  assert.deepEqual(runtime.snapshot.palette.civil, [12, 34, 56, 123]);
  assert.equal(runtime.snapshot.palette.night[3], 0);
  const saved = runtime.snapshot;
  const redraws = calls.redraw;
  for (const band of ['day', 'unknown', '__proto__', 'toString', null, {}, undefined]) {
    assert.throws(() => api.setBandVisible(band, false), /band must/);
  }
  assert.throws(() => api.setBandVisible('civil', 0), /boolean/);
  assert.throws(() => api.setPalette({}));
  assert.equal(runtime.snapshot, saved);
  assert.equal(calls.redraw, redraws);
});

test('invalid initial options create no scheduled work', t => {
  const { doc } = setup(t, { visible: false });
  for (const options of [{ refreshIntervalMs: 999 }, { refreshIntervalMs: 2 ** 31 }, { refreshIntervalMs: 1000.5 }, { opacity: -1 }, { visible: 0 }, { onError: true }, { time: 'invalid' }]) assert.throws(() => new Runtime(options, {}, doc));
  for (const key of ['refreshIntervalMs', 'opacity', 'visible', 'palette', 'time', 'onError']) assert.throws(() => new Runtime({ [key]: null }, {}, doc));
});
