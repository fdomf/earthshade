import { defineConfig } from '@playwright/test';
const duration = Number(process.env.SOAK_DURATION_MS ?? 300000);
if (!Number.isFinite(duration) || duration < 10000) throw new Error('SOAK_DURATION_MS must be at least 10000');
export default defineConfig({
  testDir: './tests/soak', workers: 1, fullyParallel: false,
  timeout: duration + 180000,
  use: { baseURL: 'http://127.0.0.1:4174', viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--enable-unsafe-swiftshader'] } },
  webServer: { command: 'npm run build:examples && npx vite preview --host 127.0.0.1 --port 4174 --strictPort', url: 'http://127.0.0.1:4174/examples/comparison/', reuseExistingServer: false, timeout: 120000 },
});
