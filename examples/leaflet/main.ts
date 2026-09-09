import { mount } from './demo';
import { finish } from '../shared';

const demo = await mount();
const overlays = [demo.overlay];
finish(overlays, undefined, demo.disposeMap);
Object.assign(window, { twilightExample: { ...demo, overlays } });
