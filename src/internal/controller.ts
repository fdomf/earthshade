import { solarPosition, type SolarPosition, type TimeInput } from '../core/index.js';
import { inRange, timestamp } from '../core/validation.js';
import { copyPalette, DEFAULT_PALETTE, type Palette } from '../raster/palette.js';

export type TimeMode = 'live' | TimeInput;
export interface OverlayOptions {
  /** Defaults to live; fixed timestamps schedule no automatic updates. */
  time?: TimeMode;
  /** Integer milliseconds in [1000, 2147483647]. Default 60000. */
  refreshIntervalMs?: number;
  visible?: boolean;
  /** Engine layer opacity in [0, 1], multiplied by palette alpha once. */
  opacity?: number;
  palette?: Palette;
  /** Asynchronous errors; MapLibre also rejects its tile request, Leaflet emits tileerror. */
  onError?: (error: Error) => void;
}
export interface TwilightController {
  /** Changes time immediately. Invalid input throws without changing state. */
  setTime(time: TimeMode): void;
  /** Hiding suspends the live timer; showing resamples live time. */
  setVisible(visible: boolean): void;
  /** Hides one non-day band without changing its configured color or the other bands. */
  setBandVisible(band: keyof Palette, visible: boolean): void;
  /** Changes compositing only; does not regenerate pixels. */
  setOpacity(opacity: number): void;
  /** Copies and validates colors, then redraws. */
  setPalette(palette: Palette): void;
  /** Redraws the selected time without advancing fixed time. */
  refresh(): void;
  /** Idempotent. Other methods throw after disposal. */
  dispose(): void;
}
export interface Snapshot {
  readonly revision: number;
  readonly sun: SolarPosition;
  readonly palette: Palette;
}
interface Hooks {
  redraw(): void;
  visibility(visible: boolean): void;
  opacity(opacity: number): void;
  dispose(): void;
}

function boolean(value: boolean): boolean {
  if (typeof value !== 'boolean') throw new TypeError('visible must be boolean');
  return value;
}

/** Shared state; importing this module never accesses a browser global. */
export class Runtime implements TwilightController {
  snapshot: Snapshot;
  visible: boolean;
  opacity: number;
  disposed = false;
  private mode: 'live' | number;
  private readonly interval: number;
  private readonly onError: ((error: Error) => void) | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private started = false;
  private palette: Palette;
  private readonly hiddenBands = new Set<keyof Palette>();

  constructor(options: OverlayOptions, private readonly hooks: Hooks, private readonly doc: Document) {
    this.mode = options.time === undefined || options.time === 'live' ? 'live' : timestamp(options.time);
    this.interval = inRange(options.refreshIntervalMs === undefined ? 60000 : options.refreshIntervalMs, 1000, 2147483647, 'refreshIntervalMs');
    if (!Number.isInteger(this.interval)) throw new RangeError('refreshIntervalMs must be an integer');
    this.visible = boolean(options.visible === undefined ? true : options.visible);
    this.opacity = inRange(options.opacity === undefined ? 1 : options.opacity, 0, 1, 'opacity');
    if (options.onError !== undefined && typeof options.onError !== 'function') throw new TypeError('onError must be a function');
    this.onError = options.onError;
    this.palette = copyPalette(options.palette === undefined ? DEFAULT_PALETTE : options.palette);
    this.snapshot = Object.freeze({ revision: 0, sun: solarPosition(this.mode === 'live' ? Date.now() : this.mode), palette: this.palette });
  }

  start(): void {
    this.assertActive();
    if (this.started) return;
    this.started = true;
    this.doc.addEventListener('visibilitychange', this.visibilityChange);
    this.schedule();
  }

  report(error: unknown): Error {
    const normalized = error instanceof Error ? error : new Error(String(error));
    this.onError?.(normalized);
    return normalized;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Twilight overlay has been disposed');
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    this.clearTimer();
    if (this.started && !this.disposed && this.mode === 'live' && this.visible && !this.doc.hidden) {
      this.timer = setTimeout(() => {
        try { this.refresh(); } catch (error) { this.report(error); } finally { this.schedule(); }
      }, this.interval);
    }
  }

  private visibilityChange = (): void => {
    try {
      if (!this.doc.hidden && this.visible && this.mode === 'live') this.refresh();
    } catch (error) { this.report(error); } finally { this.schedule(); }
  };

  private update(sun: SolarPosition, palette = this.snapshot.palette): void {
    this.snapshot = Object.freeze({ revision: this.snapshot.revision + 1, sun, palette });
    this.hooks.redraw();
  }

  setTime(time: TimeMode): void {
    this.assertActive();
    const mode = time === 'live' ? 'live' : timestamp(time);
    const sun = solarPosition(mode === 'live' ? Date.now() : mode);
    this.mode = mode;
    try { this.update(sun); } finally { this.schedule(); }
  }

  setVisible(visible: boolean): void {
    this.assertActive();
    boolean(visible);
    if (visible === this.visible) return;
    this.visible = visible;
    try {
      if (visible && this.mode === 'live') this.refresh();
      this.hooks.visibility(visible);
    } finally { this.schedule(); }
  }

  setOpacity(opacity: number): void {
    this.assertActive();
    this.opacity = inRange(opacity, 0, 1, 'opacity');
    this.hooks.opacity(opacity);
  }

  private effectivePalette(): Palette {
    const colors = { ...this.palette };
    for (const band of this.hiddenBands) {
      const [r, g, b] = colors[band];
      colors[band] = Object.freeze([r, g, b, 0] as const);
    }
    return Object.freeze(colors);
  }

  setBandVisible(band: keyof Palette, visible: boolean): void {
    this.assertActive();
    if (typeof band !== 'string' || !Object.hasOwn(DEFAULT_PALETTE, band)) {
      throw new TypeError('band must be civil, nautical, astronomical, or night');
    }
    boolean(visible);
    if (visible === !this.hiddenBands.has(band)) return;
    const sun = solarPosition(this.mode === 'live' ? Date.now() : this.mode);
    if (visible) this.hiddenBands.delete(band);
    else this.hiddenBands.add(band);
    this.update(sun, this.effectivePalette());
  }

  setPalette(palette: Palette): void {
    this.assertActive();
    const copied = copyPalette(palette);
    const sun = solarPosition(this.mode === 'live' ? Date.now() : this.mode);
    this.palette = copied;
    this.update(sun, this.effectivePalette());
  }

  refresh(): void {
    this.assertActive();
    this.update(solarPosition(this.mode === 'live' ? Date.now() : this.mode));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimer();
    this.doc.removeEventListener('visibilitychange', this.visibilityChange);
    this.hooks.dispose();
  }
}

/** Do not expose internal snapshot/lifecycle methods on the public controller. */
export function controller(runtime: Runtime): TwilightController {
  return Object.freeze({
    setTime: runtime.setTime.bind(runtime),
    setVisible: runtime.setVisible.bind(runtime),
    setBandVisible: runtime.setBandVisible.bind(runtime),
    setOpacity: runtime.setOpacity.bind(runtime),
    setPalette: runtime.setPalette.bind(runtime),
    refresh: runtime.refresh.bind(runtime),
    dispose: runtime.dispose.bind(runtime),
  });
}
