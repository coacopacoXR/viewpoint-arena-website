#!/usr/bin/env node
// scripts/fonts/subset.mjs
//
// Trims the two self-hosted variable fonts (DESIGN.md §1) to the characters this
// site can actually render, so the pair stays inside §7's 110 KB budget: the
// @fontsource-variable latin files are 88 KB + 39.5 KB, and most of that is
// glyphs and axis deltas the sheet never uses.
//
// Manual, like the capture scripts. It writes into src/fonts/ and the output is
// committed, so `astro dev` and `astro build` both work with no extra step.
// Re-run it whenever copy changes — it reads every character in src/ and in the
// last build, so a new character is picked up automatically.
//
// Deliberately NOT included: the Latin-1 and Latin Extended-A accented letters.
// They cost ~30 KB of Archivo's two-axis deltas, which puts the pair over the
// budget, and today's copy uses none of them. Adding one is a re-run away (the
// character set is read from the source, not typed in here); until then such a
// character falls back to the system stack.
//
// Usage: node scripts/fonts/subset.mjs            (after npm run build, ideally)

import subsetFont from 'subset-font';
import { existsSync, globSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const OUT = join(ROOT, 'src', 'fonts');
const BUDGET = 110 * 1024;

/** [label, source inside node_modules, output file] */
const FACES = [
  [
    'Archivo Variable (wght 100–900, wdth 62–125)',
    '@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2',
    'archivo-latin-var.woff2',
  ],
  [
    'JetBrains Mono Variable (wght 100–800)',
    '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
    'jetbrains-mono-latin-var.woff2',
  ],
];

/**
 * Safety net beyond what the source contains: ASCII, the no-break space that
 * `&nbsp;` renders, and the typographic marks a drawing sheet is likely to use.
 * These are cheap (the fonts carry few of them); accented letters are not, and
 * are left out on purpose — see the note at the top.
 */
const EXTRA_RANGES = [
  [0x0020, 0x007e], // ASCII
  [0x00a0, 0x00a0], // no-break space
  [0x00a7, 0x00a7], // §
  [0x00a9, 0x00a9], // ©
  [0x00ae, 0x00ae], // ®
  [0x00b0, 0x00b1], // ° ±
  [0x00b7, 0x00b7], // ·
  [0x00a3, 0x00a3], // £
  [0x00d7, 0x00d7], // ×
  [0x00f7, 0x00f7], // ÷
  [0x2010, 0x2015], // hyphens and dashes
  [0x2018, 0x201e], // curly quotes
  [0x2020, 0x2026], // dagger, bullet, ellipsis
  [0x2030, 0x2033], // per mille, prime
  [0x2039, 0x203a], // single guillemets
  [0x20ac, 0x20ac], // €
  [0x2122, 0x2122], // ™
  [0x2190, 0x2199], // arrows
  [0x2212, 0x2212], // minus
  [0x2248, 0x2248], // ≈
  [0x2260, 0x2260], // ≠
  [0x2264, 0x2265], // ≤ ≥
  [0x25a0, 0x25a0], // ■
  [0x25aa, 0x25aa], // ▪
  [0x25cf, 0x25cf], // ●
];

/** Every character the site renders, from source and from the last build. */
function sourceText() {
  const patterns = ['src/**/*.{astro,ts,css,md}', 'public/**/*.svg'];
  if (existsSync(join(ROOT, 'dist'))) patterns.push('dist/**/*.html');
  const files = patterns.flatMap((pattern) => globSync(pattern, { cwd: ROOT }));
  return files.map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
}

const chars = new Set(sourceText());
for (const [from, to] of EXTRA_RANGES) {
  for (let code = from; code <= to; code += 1) chars.add(String.fromCodePoint(code));
}
const text = [...chars].join('');

mkdirSync(OUT, { recursive: true });
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
let total = 0;

for (const [label, src, out] of FACES) {
  const file = join(ROOT, 'node_modules', src);
  const before = statSync(file).size;
  const buffer = await subsetFont(readFileSync(file), text, { targetFormat: 'woff2' });
  writeFileSync(join(OUT, out), buffer);
  total += buffer.length;
  console.log(
    `[subset-fonts] ${label}\n  ${kb(before)} -> ${kb(buffer.length)}  src/fonts/${out}`,
  );
}

console.log(
  `[subset-fonts] ${chars.size} code points · total ${kb(total)} · budget ${kb(BUDGET)}: ${
    total <= BUDGET ? 'PASS' : 'OVER'
  }`,
);
if (total > BUDGET) process.exitCode = 1;
