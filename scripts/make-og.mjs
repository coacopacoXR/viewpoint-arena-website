#!/usr/bin/env node
// scripts/make-og.mjs
//
// Builds the 1200x630 social card (DESIGN.md §7 / task 06) from real material:
// the hero-model capture on the right, the sheet's paper ground, blueprint
// columns and registration mark on the left, and the site's own copy set in the
// site's own face. No text is invented — the eyebrow, the headline and the
// footer line are the strings the landing page already uses.
//
// sharp does the compositing and the encode. The type layer is rasterised by
// Chromium, because that is the only way to be sure of the Archivo variable
// axes (wdth 68, wght 820): librsvg would fall back to whatever fontconfig
// finds. Everything is drawn at 2x and reduced once, so the edges stay crisp.
//
// Manual, like the capture scripts; the output is committed.
// Usage: node scripts/make-og.mjs

import sharp from 'sharp';
import { chromium } from '@playwright/test';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'public', 'og-1200x630.png');

const W = 1200;
const H = 630;
const S = 2; // supersample
const PANEL = 620; // paper panel width, in card units
const MARGIN = 64; // the sheet's page margin at its largest (§3)

/* DESIGN.md §2 — the only colours on the card. */
const PAPER = '#F1EEE6';
const PAPER_2 = '#E7E3D8';
const INK = '#121211';
const INK_2 = '#4C4A45';
const RULE = 'rgb(18 18 17 / .14)';
const GRID = 'rgb(0 68 170 / .06)';

/* Copy, verbatim from src/lib/site.ts and the landing hero. */
const EYEBROW = 'SELF-HOSTED 3D DESIGN REVIEW · 0.1.0 PREVIEW';
const HEADLINE = ['REVIEW THE MODEL.', 'NOT A SCREEN SHARE.'];
const FOOTER_LINE = '0.1.0 preview · Apache-2.0 · Self-hosted, on purpose.';

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

/* ---------------------------------------------------------------- type layer */

/** The subset fonts, as data URIs, so Chromium needs no file:// access. */
function fontFace(file, family, weight, stretch) {
  const b64 = readFileSync(join(ROOT, 'src', 'fonts', file)).toString('base64');
  return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${b64}) format('woff2-variations');font-weight:${weight};font-stretch:${stretch};font-style:normal}`;
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFace('archivo-latin-var.woff2', 'Archivo Variable', '100 900', '62% 125%')}
${fontFace('jetbrains-mono-latin-var.woff2', 'JetBrains Mono Variable', '100 800', '100% 100%')}
html,body{margin:0;background:transparent}
.card{position:relative;width:${W}px;height:${H}px;padding:${MARGIN}px 0 0 ${MARGIN}px;box-sizing:border-box}
.eyebrow{margin:0;font:500 17px/1.4 'JetBrains Mono Variable',monospace;letter-spacing:.04em;color:${INK_2}}
.headline{margin:26px 0 0;font-family:'Archivo Variable',sans-serif;font-weight:820;font-stretch:68%;
  font-size:60px;line-height:.9;letter-spacing:-.035em;text-transform:uppercase;color:${INK}}
.foot{position:absolute;left:${MARGIN}px;bottom:${MARGIN - 12}px;margin:0;max-width:${PANEL - 2 * MARGIN + 40}px;
  font:500 15px/1.5 'JetBrains Mono Variable',monospace;letter-spacing:.04em;color:${INK_2}}
.mark{position:absolute;top:${MARGIN - 12}px;left:${PANEL - MARGIN + 12}px;font:500 17px/1 'JetBrains Mono Variable',monospace;color:${INK_2}}
</style></head><body><div class="card">
<p class="eyebrow">${EYEBROW}</p>
<h1 class="headline">${HEADLINE[0]}<br>${HEADLINE[1]}</h1>
<span class="mark">+</span>
<p class="foot">${FOOTER_LINE}</p>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: S,
});
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
const typeLayer = await page.screenshot({ omitBackground: true });
await browser.close();

/* ------------------------------------------------------------------- ground */

/** Paper panel with blueprint columns, and the --paper-2 mat the still sits on. */
const sheet = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W * S}" height="${H * S}" viewBox="0 0 ${W} ${H}">
  <rect x="0" y="0" width="${PANEL}" height="${H}" fill="${PAPER}"/>
  <rect x="${PANEL}" y="0" width="${W - PANEL}" height="${H}" fill="${PAPER_2}"/>
  <g stroke="${GRID}" stroke-width="1">
    ${Array.from({ length: Math.floor(PANEL / 56) }, (_, i) => `<line x1="${i * 56}" y1="0" x2="${i * 56}" y2="${H}"/>`).join('')}
  </g>
  <line x1="${PANEL}" y1="0" x2="${PANEL}" y2="${H}" stroke="${RULE}" stroke-width="1"/>
</svg>`,
);

/* The still is a square with the model centred; crop to its middle 55% so the
   model fills the right-hand mat. Sizes come from the file, not assumptions. */
const STILL = join(ROOT, 'public', 'assets', 'hero-model-1280.webp');
const { width: SRC } = await sharp(STILL).metadata();
const STILL_BOX = Math.round(SRC * 0.55);
const stillSide = W - PANEL;
const stillTop = Math.round((H - stillSide) / 2);
const stillLayer = await sharp(STILL)
  .extract({
    left: Math.round((SRC - STILL_BOX) / 2),
    top: Math.round((SRC - STILL_BOX) / 2),
    width: STILL_BOX,
    height: STILL_BOX,
  })
  .resize(stillSide * S, stillSide * S)
  .toBuffer();

/* sharp resizes before it composites, so the 2x layers go on the 2x ground and
   the card is reduced in a second pass. */
const composed = await sharp({
  create: { width: W * S, height: H * S, channels: 3, background: PAPER },
})
  .composite([
    { input: sheet, top: 0, left: 0 },
    { input: stillLayer, top: stillTop * S, left: PANEL * S },
    { input: typeLayer, top: 0, left: 0 },
  ])
  .png()
  .toBuffer();

await sharp(composed).resize(W, H).png({ compressionLevel: 9 }).toFile(OUT);

console.log(`[make-og] ${OUT} — ${W}x${H}, ${kb(statSync(OUT).size)}`);
console.log(`[make-og] paper panel ${PANEL}px, still cropped to its middle ${STILL_BOX}px square`);
