import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 20000,
  expect: { timeout: 5000 },
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: 'node tests/browser/server.mjs',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
  },
});
