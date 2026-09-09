import { mkdtemp, writeFile, readFile, readdir, rm, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve('.');
const temp = await mkdtemp(join(tmpdir(), 'earthshade-consumers-'));
function run(command, args, cwd) {
  try { return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { process.stderr.write(error.stdout ?? ''); process.stderr.write(error.stderr ?? ''); throw error; }
}
try {
  const pack = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temp], root))[0];
  const tarball = join(temp, pack.filename);
  assert.ok(pack.files.some(f => f.path === 'dist/core/index.js'));
  assert.ok(pack.files.some(f => f.path === 'LICENSE'));
  assert.ok(pack.files.some(f => f.path === 'README.md'));
  assert.ok(!pack.files.some(f => /^(docs\/|CHANGELOG\.md$|CONTRIBUTING\.md$)/.test(f.path)));
  assert.ok(!pack.files.some(f => /node_modules|^tests\//.test(f.path)));
  const version = JSON.parse(await readFile(join(root, 'node_modules/typescript/package.json'))).version;
  const leafletTypes = JSON.parse(await readFile(join(root, 'node_modules/@types/leaflet/package.json'))).version;
  const scenarios = {
    core: [],
    maplibre: ['maplibre-gl@6.8.0'],
    leaflet: ['leaflet@1.9.4', `@types/leaflet@${leafletTypes}`],
  };
  for (const [name, peers] of Object.entries(scenarios)) {
    const cwd = await mkdtemp(join(temp, `${name}-`));
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball, `typescript@${version}`, ...peers], cwd);
    const modules = await readdir(join(cwd, 'node_modules'));
    if (name !== 'maplibre') assert.ok(!modules.includes('maplibre-gl'));
    if (name !== 'leaflet') assert.ok(!modules.includes('leaflet'));
    const imports = name === 'core' ? `
      import { solarPosition, solarElevation, classifyTwilight } from 'earthshade';
      import { TWILIGHT_BANDS } from 'earthshade/core';
      import { renderTile } from 'earthshade/raster';
      const sun = solarPosition(0);
      const band: string = classifyTwilight(solarElevation({ latitudeDeg: 0, longitudeDeg: 0 }, sun));
      const pixels: Uint8ClampedArray = renderTile({ x: 0, y: 0, z: 0 }, sun).data;
      void [band, pixels, TWILIGHT_BANDS];
    ` : `
      import { addTwilight, type TwilightController } from 'earthshade/${name}';
      import type { Map } from '${name === 'maplibre' ? 'maplibre-gl' : 'leaflet'}';
      export function attach(map: Map): TwilightController {
        const overlay = addTwilight(map, { time: new Date(), opacity: .5 });
        overlay.setBandVisible('civil', false);
        // @ts-expect-error Daylight is always transparent.
        overlay.setBandVisible('day', false);
        return overlay;
      }
    `;
    await writeFile(join(cwd, 'consumer.ts'), imports);
    await writeFile(join(cwd, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
      target: 'ES2022', module: name === 'maplibre' ? 'ESNext' : 'NodeNext',
      moduleResolution: name === 'maplibre' ? 'Bundler' : 'NodeNext', strict: true,
      lib: name === 'core' ? ['ES2022'] : ['ES2022', 'DOM'],
      types: name === 'maplibre' ? ['geojson'] : [], noEmit: true, skipLibCheck: false,
    }, include: ['consumer.ts'] }));
    run(process.execPath, ['node_modules/typescript/bin/tsc'], cwd);
    if (name === 'core') {
      run(process.execPath, ['--input-type=module', '-e', `
        import assert from 'node:assert/strict';
        assert.equal(typeof window, 'undefined');
        assert.equal(typeof document, 'undefined');
        const {solarPosition} = await import('earthshade');
        const {renderTile} = await import('earthshade/raster');
        assert.equal(renderTile({x:0,y:0,z:0},solarPosition(0)).data.length,262144);
      `], cwd);
    } else if (name === 'maplibre') {
      run(process.execPath, ['--input-type=module', '-e', "await import('earthshade/maplibre')"], cwd);
    }
    console.log(`Packed ${name} consumer: declarations and peer isolation passed`);
  }
  console.log(`Tarball: ${pack.size} compressed bytes; ${pack.files.length} files`);
  // Preserve the exact artifact installed by the consumer checks for publishing.
  if (process.argv[2]) {
    const destination = resolve(process.argv[2]);
    await mkdir(destination, { recursive: true });
    await copyFile(tarball, join(destination, 'package.tgz'));
  }
} finally { await rm(temp, { recursive: true, force: true }); }
