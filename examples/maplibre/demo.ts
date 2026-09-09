import * as maplibre from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { addTwilight as addMapLibre } from '@fdomf/earthshade/maplibre';
import { container, fixed } from '../shared';
import { style } from '../geography';

export async function mount() {
  maplibre.setWorkerUrl(workerUrl);
  const ml = new maplibre.Map({ container: container('MapLibre'), style: style(), center: [0, 15], zoom: 0.6, attributionControl: false });
  ml.addControl(new maplibre.NavigationControl());
  let removed = false;
  ml.once('remove', () => { removed = true; });
  const marker = document.createElement('button'); marker.className = 'marker'; marker.title = 'Interactive marker';
  marker.setAttribute('aria-label', 'MapLibre marker'); marker.addEventListener('click', () => { marker.dataset.clicked = 'true'; });
  new maplibre.Marker({ element: marker }).setLngLat([0, 0]).addTo(ml);
  await new Promise<void>(resolve => ml!.on('load', () => resolve()));
  const overlay = addMapLibre(ml, { time: fixed });
  return { ml, maplibre, addMapLibre, style, overlay, disposeMap: () => { if (!removed) ml.remove(); } };
}
