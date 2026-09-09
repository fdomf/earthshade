import { preview } from 'vite';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const server = await preview({ preview: { host: '127.0.0.1', port: 4175, strictPort: true } });
let browser;
try {
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  for (const example of ['maplibre', 'leaflet', 'comparison']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(`http://127.0.0.1:4175/examples/${example}/`);
    await page.waitForFunction(() => window.twilightExample, undefined, { timeout: 30000 });
    assert.match(await page.title(), /Earthshade/);
    assert.equal(await page.locator('#bands input:checked').count(), 4);
    await page.locator('#band-civil').uncheck();
    await page.locator('#band-civil').check();
    await page.evaluate(async () => {
      const { ml } = window.twilightExample;
      if (ml && !ml.loaded()) await new Promise(resolve => ml.once('idle', resolve));
    });
    assert.deepEqual(errors, [], `${example} production browser errors`);
    const count = await page.evaluate(() => {
      const { ml, lf, overlays } = window.twilightExample;
      overlays.forEach(o => { o.setTime(0); o.setOpacity(.5); o.setBandVisible('night', false); });
      const count = overlays.length;
      overlays.forEach(o => o.dispose());
      ml?.remove(); lf?.remove();
      return count;
    });
    assert.equal(count, example === 'comparison' ? 2 : 1);
    console.log(`Built ${example} example: loads, including local engine worker; controllers work`);
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
