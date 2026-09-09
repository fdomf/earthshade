import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { addTwilight as addLeaflet } from '@fdomf/earthshade/leaflet';
import { container, fixed } from '../shared';
import { graticule } from '../geography';

export async function mount() {
  const lf = L.map(container('Leaflet'), { attributionControl: false }).setView([15, 0], 1);
  let removed = false;
  lf.once('unload', () => { removed = true; });
  L.geoJSON(graticule, { style: { color: '#77989d', weight: 1 }, interactive: false }).addTo(lf);
  const marker = L.marker([0, 0], { icon: L.divIcon({ className: 'marker', iconSize: [22, 22] }), keyboard: true }).addTo(lf);
  marker.on('click', () => { marker.getElement()!.dataset.clicked = 'true'; });
  marker.getElement()!.setAttribute('aria-label', 'Leaflet marker');
  const overlay = addLeaflet(lf, { time: fixed });
  return { lf, L, addLeaflet, overlay, disposeMap: () => { if (!removed) lf.remove(); } };
}
