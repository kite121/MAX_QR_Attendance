import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'line',
  webServer: process.env.E2E_PRODUCTION_BASE_URL
    ? undefined
    : {
        command: `"${process.execPath}" node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort`,
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: false,
      },
  projects: [
    { name: 'demo-backend', testMatch: 'real-backend.spec.ts' },
    {
      name: 'production',
      testMatch: 'production-entry.spec.ts',
      use: { baseURL: process.env.E2E_PRODUCTION_BASE_URL ?? 'http://127.0.0.1:4173' },
    },
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8080',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          args: ['--no-sandbox'],
        }
      : undefined,
  },
});
