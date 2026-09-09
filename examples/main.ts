import { mount as mountMapLibre } from './maplibre/demo';
import { mount as mountLeaflet } from './leaflet/demo';
import { finish } from './shared';

const ml = await mountMapLibre();
const lf = await mountLeaflet();
const overlays = [ml.overlay, lf.overlay];
finish(overlays, () => ml.ml.setProjection({ type: (ml.ml.getProjection()?.type ?? 'mercator') === 'globe' ? 'mercator' : 'globe' }), () => { ml.disposeMap(); lf.disposeMap(); });
Object.assign(window, { twilightExample: { ...ml, ...lf, overlays } });
