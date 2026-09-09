import { renderTile } from '../tests/performance/baseline-renderer.mjs';
import { cases } from '../tests/performance/workload.mjs';
let checksum = 0;
for (let i = 0; i < 200; i++) for (const { request, sun } of cases(512)) checksum += renderTile(request, sun).data[3];
console.log({ checksum });
