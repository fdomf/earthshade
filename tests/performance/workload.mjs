import { solarPosition } from '../../dist/core/index.js';

export function cases(size) {
  return [
    [0, 0, 0, '2026-09-09T20:00:00Z'],
    [1, 0, 2, '2026-06-21T12:00:00Z'],
    [2, 3, 2, '2026-12-21T00:00:00Z'],
    [-1, 1, 2, '2000-02-29T18:00:00Z'],
  ].map(([x, y, z, time]) => ({ request: { x, y, z, size }, sun: solarPosition(new Date(time)), time }));
}
export function summary(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { p50Ms: sorted[Math.ceil(sorted.length * .5) - 1], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] };
}
export function compare(baseline, candidate, { warmups = 30, rounds = 80 } = {}) {
  let checksum = 0;
  const results = [];
  for (const size of [256, 512]) {
    const workload = cases(size);
    for (const { request, sun } of workload) {
      const a = baseline(request, sun).data, b = candidate(request, sun).data;
      if (a.length !== b.length || a.some((byte, i) => byte !== b[i])) throw new Error('Renderer bytes differ');
    }
    const batch = render => {
      const start = performance.now();
      for (const { request, sun } of workload) checksum += render(request, sun).data[size * size * 2 + 3];
      return (performance.now() - start) / workload.length;
    };
    for (let i = 0; i < warmups; i++) { batch(baseline); batch(candidate); }
    const oldTimes = [], newTimes = [], ratios = [];
    for (let i = 0; i < rounds; i++) {
      // Alternate AB/BA to reduce systematic thermal/scheduling order bias.
      let a, b;
      if (i % 2) { b = batch(candidate); a = batch(baseline); }
      else { a = batch(baseline); b = batch(candidate); }
      oldTimes.push(a); newTimes.push(b); ratios.push(a / b);
    }
    results.push({ size, warmups, rounds, tilesPerBatch: workload.length, workload,
      baseline: summary(oldTimes), candidate: summary(newTimes),
      medianSpeedup: summary(ratios).p50Ms, rawBaselineMs: oldTimes, rawCandidateMs: newTimes });
  }
  return { checksum, results };
}
