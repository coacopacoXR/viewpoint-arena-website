import { expect, test } from '@playwright/test';
import { globSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

/**
 * Task 06 §2, §6, §7 — bars that are properties of the build, not of a browser:
 *  - no `TODO(copy)` survives into the shipped HTML (copy fidelity)
 *  - the JS `/` loads, gzipped and excluding the three.js chunk, stays ≤150 KB
 *  - the two self-hosted woff2 files stay ≤110 KB together
 *  - every `<img>` in the shipped HTML carries width, height and lazy loading,
 *    except the eager hero still
 *  - robots.txt, the sitemap, canonical URLs, both theme colours and the social
 *    card all exist in the output
 */
const DIST = resolve('dist');
const JS_BUDGET = 150 * 1024;
const FONT_BUDGET = 110 * 1024;
const THREE_CHUNK = /three\.module|GLTFLoader|meshopt_decoder/;

const pages = () => globSync('**/*.html', { cwd: DIST });
const gz = (file: string) => gzipSync(readFileSync(file)).length;

test('no TODO(copy) survives the build', () => {
  const offenders = pages().filter((page) =>
    readFileSync(join(DIST, page), 'utf8').includes('TODO(copy)'),
  );
  expect(offenders, 'copy placeholders shipped').toEqual([]);
});

test('the JS / loads, gzipped and without the three.js chunk, is inside 150 KB', () => {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const scripts = [
    ...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g),
  ].map((match) => match[1]);

  expect(scripts.length, 'index.html loads no JS').toBeGreaterThan(0);
  const loaded = scripts.filter((src) => !THREE_CHUNK.test(src));
  expect(loaded.length, 'the three.js chunk is in the default graph').toBe(scripts.length);

  const total = loaded.reduce((sum, src) => sum + gz(join(DIST, src.replace(/^\//, ''))), 0);
  expect(
    total,
    `JS on / is ${(total / 1024).toFixed(1)} KB gzipped, over the 150 KB budget`,
  ).toBeLessThanOrEqual(JS_BUDGET);
});

test('the self-hosted fonts stay inside 110 KB together', () => {
  const fonts = globSync('_astro/*.woff2', { cwd: DIST });
  expect(fonts.length, 'expected exactly two woff2 files').toBe(2);
  const total = fonts.reduce((sum, font) => sum + statSync(join(DIST, font)).size, 0);
  expect(
    total,
    `fonts total ${(total / 1024).toFixed(1)} KB, over the 110 KB budget`,
  ).toBeLessThanOrEqual(FONT_BUDGET);
});

test('every shipped image carries its size and loads lazily except the hero still', () => {
  for (const page of pages()) {
    const html = readFileSync(join(DIST, page), 'utf8');
    const images = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
    for (const tag of images) {
      const where = `${page}: ${tag.slice(0, 80)}`;
      expect(tag, `${where} has no width`).toMatch(/\swidth="\d+"/);
      expect(tag, `${where} has no height`).toMatch(/\sheight="\d+"/);
      const heroStill = tag.includes('hero-model-');
      expect(tag, `${where} has the wrong loading`).toContain(
        heroStill ? 'loading="eager"' : 'loading="lazy"',
      );
    }
  }
});

test('the build ships robots, a sitemap, canonical URLs, both theme colours and the card', () => {
  const robots = readFileSync(join(DIST, 'robots.txt'), 'utf8');
  expect(robots).toContain('User-agent: *');
  expect(robots).toMatch(/Sitemap: https:\/\/\S+\/sitemap-index\.xml/);
  expect(statSync(join(DIST, 'sitemap-index.xml')).size).toBeGreaterThan(0);

  const sitemap = readFileSync(join(DIST, 'sitemap-0.xml'), 'utf8');
  for (const path of ['/', '/install/', '/how-it-works/', '/changelog/']) {
    expect(sitemap, `sitemap misses ${path}`).toContain(`<loc>https://coacopacoxr.github.io${path}</loc>`);
  }
  expect(sitemap, 'the 404 sheet must not be in the sitemap').not.toContain('/404');

  for (const page of pages()) {
    const html = readFileSync(join(DIST, page), 'utf8');
    const where = `${page}:`;
    expect(html, `${where} no canonical`).toMatch(/<link rel="canonical" href="https:\/\//);
    expect(html, `${where} no light theme colour`).toContain(
      'media="(prefers-color-scheme: light)"',
    );
    expect(html, `${where} no dark theme colour`).toContain(
      'media="(prefers-color-scheme: dark)"',
    );
    expect(html, `${where} no social card`).toMatch(
      /<meta property="og:image" content="https:\/\/\S+\/og-1200x630\.png"/,
    );
  }
});
