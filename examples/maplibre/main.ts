import { mount } from './demo';
import { finish } from '../shared';

const demo = await mount();
const overlays = [demo.overlay];
finish(overlays, () => demo.ml.setProjection({ type: (demo.ml.getProjection()?.type ?? 'mercator') === 'globe' ? 'mercator' : 'globe' }), demo.disposeMap);
Object.assign(window, { twilightExample: { ...demo, overlays } });
