#!/usr/bin/env node
// scripts/capture/optimise.mjs
//
// Turns the raw captures in .qwen-tasks/shots/ into the files the site ships in
// public/assets/: webp stills at 640/1280/1920 wide (quality 78, never upscaled),
// the two-people side-by-side composite (a plain horizontal join, no edits), and
// the orbit video as H.264 mp4 at 1280 wide with a poster still.
//
// Re-runnable: reads the manifests capture.mjs and docker-capture.mjs write and
// overwrites whatever it produces. Prints a table and writes
// .qwen-tasks/shots/optimised.json for ASSETS.md.

import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, isAbsolute, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '..', '..', '.qwen-tasks', 'shots');
const OUT = join(HERE, '..', '..', 'public', 'assets');
const WIDTHS = [640, 1280, 1920];
// meeting-cards-panel is a portrait element capture the site never shows wider
// than 1280, and 1920 would only upscale its 678 px-wide source.
const MAX_WIDTH = { 'meeting-cards-panel': 1280 };
const QUALITY = 78;
const VIDEO_BUDGET = { 'big-assembly': 2.5 * 1024 * 1024, boardroom: 2 * 1024 * 1024 };
// boardroom.webm starts with the recording context's own waiting-room card, which
// spells the third participant's name — a name the site must not invent. The cut
// begins once that context is admitted and the call view is live (verified frame
// by frame); everything before it is dropped rather than shipped.
const VIDEO_START = { boardroom: 12 };
const POSTER_AT = { 'big-assembly': 3, boardroom: 2 };

mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[optimise]', ...a);
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

// app/manifest.json is an object ({ shots, skipped }); docker/manifest.json is a
// bare array. `file` is absolute in the app manifest and relative to its own
// directory in the docker one, so both are resolved here.
const manifests = ['app/manifest.json', 'docker/manifest.json']
  .map((rel) => join(SHOTS, rel))
  .filter((f) => existsSync(f))
  .map((f) => {
    const parsed = JSON.parse(readFileSync(f, 'utf8'));
    return { dir: dirname(f), shots: (Array.isArray(parsed) ? parsed : parsed.shots) ?? [] };
  });

const resolveFile = (dir, file) => (isAbsolute(file) ? file : join(dir, file));
const stills = manifests.flatMap((m) => m.shots
  .filter((s) => s.file.endsWith('.png'))
  .map((s) => ({ ...s, file: resolveFile(m.dir, s.file) })));
const videos = manifests.flatMap((m) => m.shots
  .filter((s) => s.file.endsWith('.webm'))
  .map((s) => ({ ...s, file: resolveFile(m.dir, s.file) })));

const produced = [];

async function webpSet(src, name) {
  const meta = await sharp(src).metadata();
  const rows = [];
  for (const w of WIDTHS.filter((x) => x <= (MAX_WIDTH[name] ?? Infinity))) {
    if (meta.width < w) continue; // never upscale a real capture
    const file = join(OUT, `${name}-${w}.webp`);
    await sharp(src).resize({ width: w, withoutEnlargement: true }).webp({ quality: QUALITY }).toFile(file);
    rows.push({ file, width: w, height: Math.round((meta.height * w) / meta.width), bytes: statSync(file).size });
  }
  produced.push({ name, kind: 'still', intrinsic: { width: meta.width, height: meta.height }, files: rows });
  log(`${name}: ${meta.width}x${meta.height} -> ${rows.map((r) => `${basename(r.file)} ${kb(r.bytes)}`).join(', ')}`);
  return rows;
}

for (const s of stills) {
  if (!existsSync(s.file)) {
    log(`missing ${s.file} — skipped`);
    continue;
  }
  await webpSet(s.file, s.name);
}

// two-people composite: the two windows side by side, untouched.
const maria = join(SHOTS, 'app', 'two-people.png');
const jon = join(SHOTS, 'app', 'two-people-jon.png');
if (existsSync(maria) && existsSync(jon)) {
  const a = sharp(maria);
  const b = sharp(jon);
  const [ma, mb] = await Promise.all([a.metadata(), b.metadata()]);
  const height = Math.max(ma.height, mb.height);
  const raw = join(SHOTS, 'app', 'two-people-composite.png');
  await sharp({
    create: { width: ma.width + mb.width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([
      { input: await sharp(maria).png().toBuffer(), left: 0, top: 0 },
      { input: await sharp(jon).png().toBuffer(), left: ma.width, top: 0 },
    ])
    .png()
    .toFile(raw);
  await webpSet(raw, 'two-people-composite');
} else {
  log('two-people composite skipped: a source window is missing');
}

function encodeVideo(srcWebm, name) {
  const mp4 = join(OUT, `${name}.mp4`);
  const budget = VIDEO_BUDGET[name] ?? 2.5 * 1024 * 1024;
  const start = VIDEO_START[name] ?? 0;
  let crf = 32;
  for (;;) {
    execFileSync(
      'ffmpeg',
      ['-y', '-loglevel', 'error', ...(start ? ['-ss', String(start)] : []), '-i', srcWebm, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-an', '-movflags', '+faststart', mp4],
      { stdio: 'pipe' },
    );
    const size = statSync(mp4).size;
    log(`${name}.mp4 crf ${crf}${start ? ` from t=${start}s` : ''}: ${kb(size)}`);
    if (size <= budget || crf >= 42) return { mp4, size };
    crf += 4;
  }
}

for (const v of videos) {
  if (!existsSync(v.file)) {
    log(`missing ${v.file} — skipped`);
    continue;
  }
  const name = basename(v.file, '.webm');
  const { mp4, size } = encodeVideo(v.file, name);
  const posterPng = join(dirname(v.file), `${name}-poster-src.png`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(POSTER_AT[name] ?? 3), '-i', mp4, '-frames:v', '1', posterPng], { stdio: 'pipe' });
  const rows = await webpSet(posterPng, `${name}-poster`);
  produced.push({ name, kind: 'video', file: mp4, bytes: size, poster: rows });
}

// The hero GLB is produced by capture.mjs; just report it.
const glb = join(OUT, 'hero-model.glb');
if (existsSync(glb)) {
  produced.push({ name: 'hero-model-glb', kind: 'glb', file: glb, bytes: statSync(glb).size });
  log(`hero-model.glb: ${kb(statSync(glb).size)}`);
}

writeFileSync(join(SHOTS, 'optimised.json'), `${JSON.stringify(produced, null, 2)}\n`);
log(`done: ${produced.length} assets in ${OUT}`);
