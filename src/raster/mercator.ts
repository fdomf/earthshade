import { inRange } from '../core/validation.js';

export interface TileRequest {
  /** Integer horizontal coordinate; wraps across world copies. */
  readonly x: number;
  /** Integer vertical coordinate in [0, 2 ** z). */
  readonly y: number;
  /** Integer zoom in [0, 22]. */
  readonly z: number;
  /** Sample resolution for the same geographic footprint. Default 256. */
  readonly size?: 256 | 512;
}

export function normalizeTile(tile: TileRequest): Required<TileRequest> {
  inRange(tile.z, 0, 22, 'z');
  if (!Number.isInteger(tile.z) || !Number.isSafeInteger(tile.x) || !Number.isSafeInteger(tile.y)) {
    throw new RangeError('tile x, y and z must be safe integers');
  }
  const n = 2 ** tile.z;
  inRange(tile.y, 0, n - 1, 'y');
  const size = tile.size === undefined ? 256 : tile.size;
  if (size !== 256 && size !== 512) throw new RangeError('tile size must be 256 or 512');
  return { x: (tile.x % n + n) % n, y: tile.y, z: tile.z, size };
}
