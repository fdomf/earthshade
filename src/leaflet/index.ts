import L from 'leaflet';
import type { Coords, DoneCallback, Map } from 'leaflet';
import { renderTile } from '../raster/index.js';
import { controller, Runtime, type OverlayOptions, type TwilightController } from '../internal/controller.js';
import { instanceId, paint } from '../internal/canvas.js';
import { finite } from '../core/validation.js';

export type { OverlayOptions, TwilightController, TimeMode } from '../internal/controller.js';
export interface LeafletOptions extends OverlayOptions {
  /** Existing host pane; not modified or removed. Default: a unique owned pane. */
  pane?: string;
  /** Default 350, below markers and popups in a standard Leaflet map. */
  zIndex?: number;
}

/** Browser-only entry point. Requires Leaflet's standard EPSG:3857 CRS.
 * Canvas failures emit tileerror and reach onError. Removing the map or overlay
 * layer disposes the controller; hiding it only suspends rendering and its timer.
 */
export function addTwilight(map: Map, options: LeafletOptions = {}): TwilightController {
  if (map.options.crs !== L.CRS.EPSG3857) throw new Error('Twilight requires the standard Leaflet EPSG:3857 CRS');
  if (options.pane !== undefined && !map.getPane(options.pane)) throw new Error(`Twilight pane not found: ${options.pane}`);
  const zIndex = finite(options.zIndex === undefined ? 350 : options.zIndex, 'zIndex');
  const doc = map.getContainer().ownerDocument;
  const paneName = options.pane ?? instanceId();
  let ownedPane: HTMLElement | undefined;
  let layer: L.GridLayer | undefined;
  let redrawQueued = false;
  function redraw(): void {
    if (redrawQueued) return;
    redrawQueued = true;
    queueMicrotask(() => {
      redrawQueued = false;
      if (!runtime.disposed && runtime.visible) layer?.redraw();
    });
  }
  const unloaded = new WeakSet<HTMLElement>();
  const tileUnloaded = (event: L.TileEvent) => { unloaded.add(event.tile); };
  const runtime = new Runtime(options, {
    redraw() { if (runtime.visible) redraw(); },
    visibility(visible) {
      if (layer?.getContainer()) layer.getContainer()!.style.display = visible ? '' : 'none';
      if (visible) redraw();
    },
    opacity(opacity) { layer?.setOpacity(opacity); },
    dispose() {
      map.off('unload', removed);
      layer?.off('remove', removed);
      if (layer && map.hasLayer(layer)) map.removeLayer(layer);
      layer?.off('tileunload', tileUnloaded);
      ownedPane?.remove();
      // Leaflet has no removePane API; also release its private pane registry entry.
      const panes = map.getPanes();
      if (ownedPane && panes[paneName] === ownedPane) delete panes[paneName];
    },
  }, doc);
  function removed(): void { runtime.dispose(); }

  class TwilightGrid extends L.GridLayer {
    onAdd(map: Map): this {
      super.onAdd(map);
      const container = this.getContainer();
      if (container) {
        container.style.pointerEvents = 'none';
        container.style.display = runtime.visible ? '' : 'none';
      }
      return this;
    }

    createTile(coords: Coords, done: DoneCallback): HTMLElement {
      const snapshot = runtime.snapshot;
      const canvas = doc.createElement('canvas');
      canvas.width = canvas.height = 256;
      let failure: Error | undefined;
      try {
        if (!runtime.disposed && runtime.visible) paint(canvas, renderTile(coords, snapshot.sun, snapshot.palette));
      } catch (error) { failure = error instanceof Error ? error : new Error(String(error)); }
      // Leaflet must register the returned element before completion; pixels are computed synchronously.
      queueMicrotask(() => {
        if (runtime.disposed || snapshot !== runtime.snapshot || unloaded.has(canvas)) return;
        if (failure) runtime.report(failure);
        done(failure, canvas);
      });
      return canvas;
    }
  }

  try {
    if (options.pane === undefined) {
      ownedPane = map.createPane(paneName);
      ownedPane.style.zIndex = String(zIndex);
      ownedPane.style.pointerEvents = 'none';
    }
    layer = new TwilightGrid({ pane: paneName, zIndex, tileSize: 256, minZoom: 0, maxZoom: 22, opacity: runtime.opacity,
      attribution: '', noWrap: false, keepBuffer: 1 });
    layer.on('remove', removed);
    layer.on('tileunload', tileUnloaded);
    map.on('unload', removed);
    layer.addTo(map);
    const container = layer.getContainer();
    if (container) { container.style.pointerEvents = 'none'; container.style.display = runtime.visible ? '' : 'none'; }
    runtime.start();
    return controller(runtime);
  } catch (error) { runtime.dispose(); throw error; }
}
