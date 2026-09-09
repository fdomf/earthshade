import { createServer } from 'vite';
import { chromium, firefox, webkit } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { cpus, loadavg } from 'node:os';
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
  server: { host: '127.0.0.1', port: 4176, strictPort: true } });
await server.listen();
const reports = [];
try {
  // Serial isolated pages: no map engine, tile workers or simultaneous browser tests.
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      await page.goto('http://127.0.0.1:4176/tests/performance/');
      await page.waitForFunction(() => window.runBenchmark);
      const startLoad = loadavg();
      const report = { name, version: browser.version(), cpu: cpus()[0]?.model, utc: new Date().toISOString(), startLoad,
        ...await page.evaluate(() => window.runBenchmark()), endLoad: loadavg() };
      reports.push(report);
      console.log(JSON.stringify({ name, results: report.pixels.results.map(({ size, baseline, candidate, medianSpeedup }) => ({ size, baseline, candidate, medianSpeedup })), encoding: report.encoding }));
    } finally { await browser.close(); }
  }
} finally {
  const path = process.argv[2] ?? 'test-results/browser-paired.json';
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(reports, null, 2) + '\n');
  await server.close();
}
