import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:4173', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --port 4173', url: 'http://127.0.0.1:4173/examples/comparison/', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--enable-unsafe-swiftshader'] } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], launchOptions: { firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disabled': false } } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], launchOptions: { args: ['--enable-unsafe-swiftshader'] } } },
  ],
});
