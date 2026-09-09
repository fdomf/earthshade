import { cpus, platform, arch, loadavg } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { renderTile } from '../dist/raster/index.js';
import { renderTile as baseline } from '../tests/performance/baseline-renderer.mjs';
import { compare } from '../tests/performance/workload.mjs';
const startLoad = loadavg(), start = performance.now(), cpuStart = process.cpuUsage();
const result = compare(baseline, renderTile);
function readOptional(path) { try { return readFileSync(path, 'utf8').trim(); } catch { return null; } }
const report = { node: process.version, platform: `${platform()} ${arch()}`, cpu: cpus()[0]?.model,
  logicalCpus: cpus().length, utc: new Date().toISOString(), startLoad, endLoad: loadavg(),
  cpuAffinity: readOptional('/proc/self/status')?.match(/^Cpus_allowed_list:\s*(.*)$/m)?.[1] ?? null,
  cpu0Governor: readOptional('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor'),
  wallMs: performance.now() - start, cpuUsage: process.cpuUsage(cpuStart), ...result };
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, results: report.results.map(({ rawBaselineMs, rawCandidateMs, workload, ...r }) => r) }, null, 2));
