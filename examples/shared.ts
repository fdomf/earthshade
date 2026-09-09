import './style.css';
import { DEFAULT_PALETTE, type Palette } from 'earthshade/raster';
import { TWILIGHT_BANDS, solarPosition } from 'earthshade/core';

interface ExampleOverlay {
  setTime(time: Date | 'live'): void;
  setVisible(visible: boolean): void;
  setBandVisible(band: keyof Palette, visible: boolean): void;
  setOpacity(opacity: number): void;
  dispose(): void;
}

export const fixed = Date.UTC(2026, 8, 9, 20);
const maps = document.querySelector('#maps')!;
document.querySelector('#controls')!.innerHTML = `
  <label>Time (UTC) <input id="time" type="datetime-local" value="2026-09-09T20:00" step="60" min="1900-01-01T00:00" max="2100-12-31T23:59" aria-describedby="time-error" required></label>
  <label><input id="live" type="checkbox"> Live</label>
  <label><input id="visible" type="checkbox" checked> Shading</label>
  <label>Opacity <input id="opacity" type="range" min="0" max="1" step="0.05" value="1"></label>
  <button id="globe" type="button">Toggle globe</button><span id="time-error" role="alert"></span>
  <fieldset id="bands"><legend>Visible bands</legend>
    <label><input id="band-civil" type="checkbox" checked> Civil twilight</label>
    <label><input id="band-nautical" type="checkbox" checked> Nautical twilight</label>
    <label><input id="band-astronomical" type="checkbox" checked> Astronomical twilight</label>
    <label><input id="band-night" type="checkbox" checked> Night</label>
  </fieldset>`;
for (const band of TWILIGHT_BANDS) {
  const color = band.id === 'day' ? [196, 216, 218, 255] : DEFAULT_PALETTE[band.id];
  const item = document.createElement('span');
  item.className = 'legend-item';
  item.dataset.band = band.id;
  const dot = document.createElement('i'); dot.className = 'swatch';
  dot.style.background = `rgba(${color[0]},${color[1]},${color[2]},${color[3]! / 255})`;
  item.append(dot, band.id); document.querySelector('#legend')!.append(item);
}
export function container(name: string): HTMLDivElement {
  const section = document.createElement('section');
  const title = document.createElement('h2'); title.textContent = name;
  const div = document.createElement('div'); div.className = 'map'; div.id = name.toLowerCase();
  section.append(title, div); maps.append(section); return div;
}


const nav = document.createElement('nav');
nav.setAttribute('aria-label', 'Examples');
for (const [engine, title] of [['comparison', 'Comparison'], ['maplibre', 'MapLibre'], ['leaflet', 'Leaflet']]) {
  const link = document.createElement('a');
  link.href = `../${engine}/`; link.textContent = title!;
  if (document.body.dataset.engine === engine) link.setAttribute('aria-current', 'page');
  nav.append(link);
}
document.querySelector('header')!.append(nav);

export function finish(overlays: ExampleOverlay[], toggleGlobe?: () => void, disposeMaps?: () => void): void {
  const time = document.querySelector<HTMLInputElement>('#time')!;
  const live = document.querySelector<HTMLInputElement>('#live')!;
  const error = document.querySelector<HTMLElement>('#time-error')!;
  function setTime(): void {
    const value = live.checked ? 'live' : new Date(`${time.value}Z`);
    try {
      if (value !== 'live') {
        if (!time.value || !time.validity.valid) throw new RangeError('Invalid date');
        solarPosition(value); // Validate before updating either map.
      }
    } catch {
      live.checked = time.disabled;
      time.setAttribute('aria-invalid', 'true');
      error.textContent = 'Enter a valid UTC date from 1900 through 2100. The map time has not changed.';
      return;
    }
    overlays.forEach(overlay => overlay.setTime(value));
    time.disabled = live.checked;
    time.removeAttribute('aria-invalid'); error.textContent = '';
  }
  time.onchange = setTime; live.onchange = setTime;
  document.querySelector<HTMLInputElement>('#visible')!.onchange = event => overlays.forEach(overlay => overlay.setVisible((event.target as HTMLInputElement).checked));
  for (const band of ['civil', 'nautical', 'astronomical', 'night'] as const) {
    const input = document.querySelector<HTMLInputElement>(`#band-${band}`)!;
    input.onchange = () => {
      overlays.forEach(overlay => overlay.setBandVisible(band, input.checked));
      document.querySelector<HTMLElement>(`.legend-item[data-band="${band}"]`)!.dataset.hidden = String(!input.checked);
    };
  }
  document.querySelector<HTMLInputElement>('#opacity')!.oninput = event => overlays.forEach(overlay => overlay.setOpacity(Number((event.target as HTMLInputElement).value)));
  const globe = document.querySelector<HTMLButtonElement>('#globe')!;
  if (toggleGlobe) globe.onclick = toggleGlobe;
  else globe.remove();
  window.addEventListener('pagehide', event => {
    // A cached page resumes these same controllers when the user navigates back.
    if (!event.persisted) {
      overlays.forEach(overlay => overlay.dispose());
      disposeMaps?.();
    }
  });
}
