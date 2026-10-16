import { defineConfig, devices } from '@playwright/test';

/**
 * The layout test runs against a real production build served by `astro preview`,
 * because that is the only way to measure what a visitor actually gets.
 * `SITE_BASE` is honoured so a sub-path deploy is testable too.
 */
const PORT = Number(process.env.PORT ?? 4321);
const HOST = '127.0.0.1';
const rawBase = process.env.SITE_BASE ?? '/';
const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
const baseURL = `http://${HOST}:${PORT}${base}`;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --host ${HOST} --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
