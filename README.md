# Viewpoint Arena — website

The site for [Viewpoint Arena](https://github.com/coacopacoXR/viewpoint-arena), a self-hosted
room where a small team reviews a 3D model together. Built with Astro (static output),
TypeScript (strict) and plain scoped CSS. Motion is GSAP + ScrollTrigger + SplitText + Lenis;
the lazy hero model uses three.js. No analytics, no cookies, no third-party requests at
runtime — fonts are self-hosted.

## Run it

```sh
npm install
npm run dev          # http://localhost:4321
npm run build        # → dist/
npm run preview      # serve dist/
npm run check        # astro check (TypeScript + Astro types)
npm run test:layout  # Playwright: no horizontal scroll, one h1, skip link, reduced motion
```

`npm run test:layout` builds first, then serves `dist/` and runs Chromium against it. The
first time, install the browser: `npx playwright install chromium`.

## Deploying under a sub-path

`base` comes from the `SITE_BASE` environment variable (default `/`), so the same source
builds for a GitHub Pages project site:

```sh
SITE_BASE=/viewpoint-arena-website/ npm run build
```

Every internal link and asset URL goes through `src/lib/links.ts` (`withBase` / `pageUrl`),
so nothing has to be rewritten by hand.

## Deploy

GitHub Pages: `.github/workflows/deploy.yml` builds on push to `site/astro` and publishes
`dist/` with `actions/deploy-pages`, setting `SITE_BASE=/viewpoint-arena-website/` unless a
`CNAME` file exists (a custom domain is served from `/`). Point the repo's Pages setting at
GitHub Actions and nothing else needs configuring.

Vercel: import the repository and `vercel.json` takes it from there — `npm run build`,
`outputDirectory: dist`, clean URLs, and a year of immutable caching for `/_astro/*` and
`/assets/*`. Both hosts build fine without the sibling app checkout: the changelog prebuild
keeps the committed copy when `viewpoint-arena-public` is absent.

## Where the content comes from

Nothing on this site is invented. The copy is authored from the app repository
(`viewpoint-arena`): its `README.md`, `docs/INSTALL.md`, `perf/results/`, and
`CHANGELOG.md`. Every claim carries a provenance tag — `SRC · docs/INSTALL.md §6b`,
`SRC · perf/results/README.md · e09eb99` — which links to the exact file (and, where a
number is quoted, the exact revision) in the app repo. Screenshots and video are real
captures from the running app, never mock-ups.

## Layout

```
src/
  components/   design-system components (Nav, Footer, Display, SectionHead, SrcTag,
                Button, Command, SpecTable, Limit, Figure, Stat, Marquee)
  layouts/      Base.astro — head, theme script, skip link, blueprint layer, nav, footer
  lib/          site copy constants, base-aware link helpers, shared prop types
  fonts/        the two variable woff2, subset by scripts/fonts/subset.mjs
  pages/        /, /install, /how-it-works, /changelog, 404, robots.txt
  scripts/      motion.ts (one motion entry) + tiny nav / theme / copy / video modules
  styles/       tokens.css, base.css, fonts.css, motion.css
tests/          layout, assets, a11y and build specs
```

Design tokens live in `src/styles/tokens.css` and are the only source of colours, type
sizes, spacing and easing. Do not hardcode values in components.
