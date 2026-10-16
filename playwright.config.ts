import { defineConfig, devices } from '@playwright/test';

/**
 * The layout test runs against a real production build, served statically by
 * scripts/serve-dist.mjs — the same bytes a static host would hand a visitor.
 * (`astro preview` allows only one instance per project, which would collide
 * with a preview the operator already has open on another port.)
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
    command: `npm run build && node scripts/serve-dist.mjs ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
