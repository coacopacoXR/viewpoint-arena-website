#!/usr/bin/env node
// scripts/make-icons.mjs
//
// Renders the favicon set from public/favicon.svg (the registration mark,
// DESIGN.md §2 colours) with sharp: a 32px PNG for browsers that want a raster
// icon and a 180px opaque apple-touch-icon for the iOS home screen. The SVG
// stays the primary icon, so nothing is added to the design.
//
// Manual, like the capture scripts; the output is committed.
// Usage: node scripts/make-icons.mjs

import sharp from 'sharp';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SVG = join(ROOT, 'public', 'favicon.svg');

/** [size, file] — the SVG already paints its own opaque --paper ground. */
const ICONS = [
  [32, 'icon-32.png'],
  [180, 'apple-touch-icon.png'],
];

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

for (const [size, name] of ICONS) {
  const out = join(ROOT, 'public', name);
  await sharp(SVG, { density: 300 }).resize(size, size).png().toFile(out);
  console.log(`[make-icons] ${name} ${size}x${size} ${kb(statSync(out).size)}`);
}
