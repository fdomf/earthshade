import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const protocols = new Map();
const engine = mock.module('maplibre-gl', { namedExports: {
  addProtocol: (id, handler) => protocols.set(id, handler),
  removeProtocol: id => protocols.delete(id),
} });
const { addTwilight } = await import('../dist/maplibre/index.js');

function fixture() {
  const sources = new Map();
  const layers = new Map();
  const events = new Map();
  const encodes = [];
  const tileLoads = [];
  const doc = new EventTarget();
  doc.hidden = false;
  doc.createElement = () => ({
    getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }),
    toBlob: callback => encodes.push(callback),
  });
  const map = {
    isStyleLoaded: () => true,
    getStyle: () => ({ version: 8 }),
    getContainer: () => ({ ownerDocument: doc }),
    getSource: id => sources.get(id),
    getLayer: id => layers.get(id),
    addSource: (id, source) => sources.set(id, { ...source, setTiles(tiles) { this.tiles = tiles; },
      loadTile(tile) {
        const abort = new AbortController(); tile.abortController = abort; tileLoads.push(abort);
        return new Promise((resolve, reject) => abort.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }));
      },
    }),
    removeSource: id => sources.delete(id),
    addLayer: layer => layers.set(layer.id, layer),
    removeLayer: id => layers.delete(id),
    on: (name, callback) => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(callback); },
    off: (name, callback) => events.get(name)?.delete(callback),
    fire: name => { for (const callback of events.get(name) ?? []) callback(); },
    setLayoutProperty() {}, setPaintProperty() {},
  };
  const request = id => ({ url: sources.get(id).tiles[0].replace('{z}/{x}/{y}', '0/0/0') });
  return { map, encodes, sources, layers, events, request, tileLoads };
}

test('refresh and disposal abort overlapping source loads before they reach the protocol queue', async () => {
  const f = fixture(), overlay = addTwilight(f.map, { time: 0 });
  const source = [...f.sources.values()][0], tile = {};
  for (const end of [() => overlay.refresh(), () => overlay.dispose()]) {
    const first = source.loadTile(tile), second = source.loadTile(tile);
    // Simulate an earlier engine completion deleting the newer request field.
    delete tile.abortController;
    const checks = [assert.rejects(first, { name: 'AbortError' }), assert.rejects(second, { name: 'AbortError' })];
    end(); await Promise.all(checks);
    assert.ok(f.tileLoads.every(abort => abort.signal.aborted));
  }
  assert.equal(protocols.size, 0);
});

test('protocol cancellation before rendering, during encoding, after revision and disposal', async () => {
  const f = fixture();
  const errors = [];
  const overlay = addTwilight(f.map, { time: 0, onError: error => errors.push(error) });
  const id = [...f.sources.keys()][0];
  const handler = protocols.get(id);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(handler(f.request(id), aborted), { name: 'AbortError' });
  assert.equal(f.encodes.length, 0);
  const controller = new AbortController();
  const pending = handler(f.request(id), controller);
  assert.equal(f.encodes.length, 1);
  controller.abort();
  let staleReads = 0;
  f.encodes.shift()({ arrayBuffer() { staleReads++; return Promise.resolve(new ArrayBuffer(0)); } });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(staleReads, 0, 'cancelled encodes must not start reading their Blob');
  const old = f.request(id);
  const revision = handler(old, new AbortController());
  overlay.refresh();
  f.encodes.shift()(new Blob(['png']));
  await assert.rejects(revision, { name: 'AbortError' });
  await assert.rejects(handler(old, new AbortController()), { name: 'AbortError' });
  const removed = handler(f.request(id), new AbortController());
  overlay.dispose();
  f.encodes.shift()(null);
  await assert.rejects(removed, { name: 'AbortError' });
  assert.equal(errors.length, 0);
  assert.equal(protocols.has(id), false);
  assert.equal(f.sources.size, 0);
  assert.equal(f.layers.size, 0);
  assert.ok([...f.events.values()].every(set => set.size === 0));
});

test('protocol validates URLs and reports failed encodes; attachment failure unwinds ownership', async () => {
  const f = fixture();
  const errors = [];
  const overlay = addTwilight(f.map, { time: 0, onError: error => errors.push(error.message) });
  const id = [...f.sources.keys()][0];
  const handler = protocols.get(id);
  await assert.rejects(handler({ url: `${id}://0/0/0/0?bad=true` }, new AbortController()), /Invalid/);
  const failed = handler(f.request(id), new AbortController());
  f.encodes.shift()(null);
  await assert.rejects(failed, /encoding failed/);
  assert.equal(errors.length, 2);
  overlay.dispose();
  f.map.addLayer = () => { throw new Error('attachment failure'); };
  const before = protocols.size;
  assert.throws(() => addTwilight(f.map, { time: 0 }), /attachment failure/);
  assert.equal(protocols.size, before);
  assert.equal(f.sources.size, 0);
});

test('protocol snapshots and registrations are independent across maps', async () => {
  const a = fixture(), b = fixture();
  const one = addTwilight(a.map, { time: 0 });
  const two = addTwilight(b.map, { time: 0 });
  const idA = [...a.sources.keys()][0], idB = [...b.sources.keys()][0];
  assert.notEqual(idA, idB);
  one.dispose();
  assert.ok(protocols.has(idB));
  const success = protocols.get(idB)(b.request(idB), new AbortController());
  b.encodes.shift()(new Blob(['png']));
  assert.equal(new TextDecoder().decode((await success).data), 'png');
  two.dispose();
});

// Keep the mock scoped to this test module's process; no production globals are patched.
process.once('exit', () => engine.restore());
