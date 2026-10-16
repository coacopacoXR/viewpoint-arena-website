// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

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
    /* Five pages, ~31 KB of CSS: inlining it costs a few gzipped kilobytes per
       page and buys back the two render-blocking requests a phone would
       otherwise wait for (task 06 §1). */
    inlineStylesheets: 'always',
  },
  integrations: [
    sitemap({
      /* the 404 sheet is for visitors who get lost, not for crawlers */
      filter: (page) => !/\/404\/?$/.test(page),
    }),
  ],
});
