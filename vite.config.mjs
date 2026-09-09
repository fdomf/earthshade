import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  plugins: [{
    name: 'verify-standalone-engine-isolation',
    generateBundle(_options, bundle) {
      for (const engine of ['maplibre', 'leaflet']) {
        const entry = Object.values(bundle).find(item => item.type === 'chunk' && item.isEntry && item.name === engine);
        if (!entry) this.error(`Missing ${engine} entry`);
        const seen = new Set(), modules = [];
        const visit = chunk => {
          if (seen.has(chunk.fileName)) return;
          seen.add(chunk.fileName); modules.push(...Object.keys(chunk.modules));
          for (const id of [...chunk.imports, ...chunk.dynamicImports]) {
            const dependency = bundle[id];
            if (dependency?.type === 'chunk') visit(dependency);
          }
        };
        visit(entry);
        const forbidden = engine === 'maplibre' ? '/node_modules/leaflet/' : '/node_modules/maplibre-gl/';
        if (modules.some(id => id.includes(forbidden))) this.error(`${engine} standalone includes the other engine`);
      }
    },
  }],
  worker: { format: 'es' },
  // Preserve MapLibre 6's relative worker URL during development.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  resolve: { dedupe: ['maplibre-gl', 'leaflet'] },
  build: {
    outDir: 'examples-dist',
    rollupOptions: { input: {
      comparison: resolve('examples/comparison/index.html'),
      maplibre: resolve('examples/maplibre/index.html'),
      leaflet: resolve('examples/leaflet/index.html'),
    } },
  },
});
