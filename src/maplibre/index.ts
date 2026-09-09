import * as maplibregl from 'maplibre-gl';
import type { Map, RasterTileSource } from 'maplibre-gl';
import { renderTile } from '../raster/index.js';
import { controller, Runtime, type OverlayOptions, type TwilightController } from '../internal/controller.js';
import { encode, instanceId, paint } from '../internal/canvas.js';

export type { OverlayOptions, TwilightController, TimeMode } from '../internal/controller.js';
export interface MapLibreOptions extends OverlayOptions {
  /** Existing layer to insert before. Missing at initial attachment throws. */
  beforeId?: string;
}

function cancelled(message: string): Error {
  // MapLibre recognizes Error instances with this name; DOMException inheritance
  // differs between browser and Node environments.
  return Object.assign(new Error(message), { name: 'AbortError' });
}

/** Attach after initial style load. Use the same MapLibre module instance as the map.
 * Each attachment owns its protocol, source, layer, listeners and timer.
 * Missing anchors after style replacement append and report once through onError.
 */
export function addTwilight(map: Map, options: MapLibreOptions = {}): TwilightController {
  const beforeId = options.beforeId;
  // getStyle is undefined until the style is initialized. isStyleLoaded also waits
  // for every source tile, which would reject back-to-back overlay attachments.
  if (!map.getStyle()) throw new Error('Attach Twilight after the MapLibre style has loaded');
  if (beforeId !== undefined && !map.getLayer(beforeId)) throw new Error(`Twilight beforeId layer not found: ${beforeId}`);
  const doc = map.getContainer().ownerDocument;
  const id = instanceId();
  let registered = false;
  let removing = false;
  let warnedAnchor = false;
  let restoring = false;
  const pending = new Set<AbortController>();
  const sourceRequests = new Set<AbortController>();
  const cancel = () => {
    const reason = cancelled('Twilight tile request cancelled');
    for (const request of sourceRequests) request.abort(reason);
    for (const request of pending) request.abort(reason);
    sourceRequests.clear(); pending.clear();
  };
  const template = () => `${id}://${runtime.snapshot.revision}/{z}/{x}/{y}`;
  const runtime = new Runtime(options, {
    redraw() {
      cancel();
      (map.getSource(id) as RasterTileSource | undefined)?.setTiles([template()]);
    },
    visibility(visible) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none'); },
    opacity(opacity) { if (map.getLayer(id)) map.setPaintProperty(id, 'raster-opacity', opacity); },
    dispose() {
      cancel();
      map.off('style.load', styleLoaded);
      map.off('remove', removed);
      try {
        if (!removing) {
          if (map.getLayer(id)) map.removeLayer(id);
          if (map.getSource(id)) map.removeSource(id);
        }
      } finally { if (registered) maplibregl.removeProtocol(id); }
    },
  }, doc);

  function restore(): void {
    if (runtime.disposed || restoring) return;
    restoring = true;
    try {
      if (!map.getSource(id)) {
        map.addSource(id, { type: 'raster', tiles: [template()], tileSize: 256, minzoom: 0, maxzoom: 22 });
        const source = map.getSource(id) as RasterTileSource;
        const loadTile = source.loadTile.bind(source);
        source.loadTile = async tile => {
          const loading = loadTile(tile);
          // RasterTileSource creates this controller synchronously, before its
          // async request transform and image queue. Track every invocation:
          // overlapping engine reloads can overwrite tile.abortController.
          const abort = tile.abortController;
          const release = () => { if (abort) sourceRequests.delete(abort); };
          if (abort && !abort.signal.aborted) {
            sourceRequests.add(abort);
            // The engine may drop an aborted queued image without settling its
            // promise. Release tracking on abort as well as normal completion.
            abort.signal.addEventListener('abort', release, { once: true });
          }
          try { return await loading; }
          finally { release(); abort?.signal.removeEventListener('abort', release); }
        };
      }
      if (!map.getLayer(id)) {
        const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
        map.addLayer({ id, type: 'raster', source: id,
          paint: { 'raster-opacity': runtime.opacity, 'raster-fade-duration': 0 },
          layout: { visibility: runtime.visible ? 'visible' : 'none' },
        }, before);
        if (beforeId !== undefined && !before && !warnedAnchor) {
          warnedAnchor = true;
          runtime.report(new Error(`Twilight anchor ${beforeId} disappeared; overlay appended`));
        }
      }
    } finally { restoring = false; }
  }
  function styleLoaded(): void {
    try { restore(); } catch (error) { map.fire('error', { error: runtime.report(error) }); }
  }
  function removed(): void { removing = true; runtime.dispose(); }

  try {
    maplibregl.addProtocol(id, async (request, abort) => {
      const snapshot = runtime.snapshot;
      const check = () => {
        if (abort.signal.aborted || runtime.disposed || snapshot !== runtime.snapshot) throw cancelled('Twilight tile request cancelled');
      };
      pending.add(abort);
      try {
        check();
        const match = new RegExp(`^${id}://(\\d+)/(\\d+)/(-?\\d+)/(-?\\d+)$`).exec(request.url);
        if (!match) throw new Error('Invalid Twilight tile URL');
        if (Number(match[1]) !== snapshot.revision) throw cancelled('Obsolete Twilight revision');
        const pixels = renderTile({ z: Number(match[2]), x: Number(match[3]), y: Number(match[4]) }, snapshot.sun, snapshot.palette);
        check();
        const canvas = doc.createElement('canvas');
        paint(canvas, pixels);
        check();
        const data = await encode(canvas, check);
        check();
        return { data };
      } catch (error) {
        // An encoder can fail after cancellation; stale errors are cancellation too.
        check();
        if (error instanceof Error && error.name === 'AbortError') throw error;
        throw runtime.report(error);
      } finally { pending.delete(abort); }
    });
    registered = true;
    restore();
    map.on('style.load', styleLoaded);
    map.on('remove', removed);
    runtime.start();
    return controller(runtime);
  } catch (error) { runtime.dispose(); throw error; }
}
