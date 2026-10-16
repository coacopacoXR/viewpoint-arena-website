// @ts-check
import { defineConfig } from 'astro/config';

/**
 * `SITE_BASE` lets the same build serve from a GitHub Pages project site
 * (e.g. SITE_BASE=/viewpoint-arena-website/) without editing any link.
 * Every internal link and asset URL goes through `src/lib/links.ts`.
 */
const base = process.env.SITE_BASE || '/';

export default defineConfig({
  site: 'https://coacopacoxr.github.io',
  base,
  output: 'static',
  devToolbar: { enabled: false },
  build: {
    inlineStylesheets: 'auto',
  },
});
