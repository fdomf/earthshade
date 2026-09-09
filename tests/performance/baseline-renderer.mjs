// Frozen pre-optimization renderer, retained only for reproducible performance and byte-equivalence checks.
import { classifySine } from '../../dist/core/twilight.js';
import { longitude, RAD, validateSun } from '../../dist/core/validation.js';
import { normalizeTile } from '../../dist/raster/mercator.js';
import { copyPalette, DEFAULT_PALETTE } from '../../dist/raster/palette.js';
/** Render XYZ Web Mercator pixel centers without DOM, network or clock access.
 * Invalid coordinates, solar positions or RGBA bytes throw before pixel allocation.
 */
export function renderTile(request, sun, palette = DEFAULT_PALETTE) {
    const { x, y, z, size } = normalizeTile(request);
    validateSun(sun);
    const colors = copyPalette(palette);
    const data = new Uint8ClampedArray(size * size * 4);
    const columns = new Float64Array(size);
    const n = 2 ** z;
    const delta = sun.declinationDeg * RAD;
    const sinDelta = Math.sin(delta);
    const cosDelta = Math.cos(delta);
    const sunLongitude = longitude(sun.subsolarLongitudeDeg);
    for (let col = 0; col < size; col++) {
        const lambda = (x + (col + 0.5) / size) / n * 360 - 180;
        columns[col] = cosDelta * Math.cos((lambda - sunLongitude) * RAD);
    }
    for (let row = 0; row < size; row++) {
        const mercator = Math.PI * (1 - 2 * (y + (row + 0.5) / size) / n);
        const sinPhi = Math.tanh(mercator);
        const cosPhi = 1 / Math.cosh(mercator);
        for (let col = 0; col < size; col++) {
            const band = classifySine(sinPhi * sinDelta + cosPhi * columns[col]);
            if (band !== 'day')
                data.set(colors[band], (row * size + col) * 4);
        }
    }
    return { width: size, height: size, data };
}
