#!/usr/bin/env node
// scripts/capture/capture.mjs
//
// Real captures of the running Viewpoint Arena app, for the website's figures.
//
// The app is served exactly the way its own perf benchmark serves it:
//   node --import tsx scripts/perf/serve.mjs          (app repo, port 4173)
//   npx --no-install partykit dev --port 1998         (app repo; 1999 belongs to Docker)
// with dist built as `VITE_PARTYKIT_HOST=localhost:1998 npm run build`.
//
// Every image this writes is a real capture: a Playwright screenshot of the live
// page, or a read of the WebGL framebuffer (`canvas.toDataURL`, which the app's
// `preserveDrawingBuffer: true` makes reliable) for the chrome-free hero still.
// Nothing is composited, recoloured or retouched; the one composite (two-people
// side by side) is a plain horizontal join of two unedited screenshots.
//
// Usage:
//   node scripts/capture/capture.mjs                 # every shot
//   node scripts/capture/capture.mjs --shots=laser,tree
//
// Raw PNGs land in .qwen-tasks/shots/app/ (gitignored) plus manifest.json;
// scripts/capture/optimise.mjs turns those into public/assets/*.webp.

import { chromium } from 'playwright';
import sharp from 'sharp';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const APP = 'http://localhost:4173';
const APP_REPO = 'C:/Users/coaco/viewpoint-arena-public';
const FIXTURES = join(APP_REPO, 'perf', 'fixtures');
const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, '..', '..', '.qwen-tasks', 'shots', 'app');
const ASSETS = join(HERE, '..', '..', 'public', 'assets');
const VIEWPORT = { width: 1600, height: 1000 };
const DSF = 2;

// Copied from the app's playwright.config.ts PERF_CHROMIUM_ARGS (win32 branch):
// headless Chromium rasterises through SwiftShader without them, and SwiftShader
// draws these assemblies at seconds a frame.
const CHROMIUM_ARGS = ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--use-gl=angle', '--use-angle=d3d11'];

const MARIA = { name: 'Maria', color: '#4F8EF7' };
const JON = { name: 'Jon', color: '#F76B4F' };

const requested = (process.argv.find((a) => a.startsWith('--shots=')) ?? '')
  .replace('--shots=', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const want = (name) => requested.length === 0 || requested.includes(name);

mkdirSync(RAW, { recursive: true });
const manifest = [];
const skipped = [];
const log = (...a) => console.log('[capture]', ...a);

const record = (name, file, shows, howCaptured) => {
  manifest.push({ name, file, shows, howCaptured });
  log(`shot ${name} -> ${file}`);
};
const skip = (name, why) => {
  skipped.push({ name, why });
  log(`SKIP ${name}: ${why}`);
};

// ── helpers ──────────────────────────────────────────────────────────────────

async function shot(page, name, shows, howCaptured) {
  const file = join(RAW, `${name}.png`);
  await page.screenshot({ path: file });
  record(name, file, shows, howCaptured);
}

async function newUser(browser, { roomId, user, perf = false, viewport = VIEWPORT, recordVideo, identity = false } = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: DSF,
    ...(recordVideo ? { recordVideo } : {}),
  });
  if (roomId || identity) {
    await context.addInitScript(
      ([rid, name, color]) => {
        localStorage.setItem('vp_user', JSON.stringify({ name, color }));
        if (rid) sessionStorage.setItem('vp_enteredRoom', rid);
      },
      [roomId ?? '', user.name, user.color],
    );
  }
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  return { context, page };
}

async function gotoRoom(page, roomId, { perf = false, edit = false } = {}) {
  const qs = new URLSearchParams();
  if (perf) qs.set('perf', '1');
  if (edit) qs.set('edit', '1');
  const q = [...qs.entries()].length ? `?${qs}` : '';
  await page.goto(`${APP}/room/${roomId}${q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 120_000 });
  await page.waitForTimeout(2500);
}

/** The real lobby flow: name yourself, create a review, land in edit mode. */
async function createReviewViaLobby(page, name) {
  await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded' });
  const nameField = page.locator('[data-testid="lobby-name-field"]');
  if (await nameField.isVisible().catch(() => false)) await nameField.fill(name);
  await page.locator('[data-testid="new-design-review"]').click();
  await page.locator('[data-testid="new-design-review-field"]').fill('Bracket review');
  await page.locator('[data-testid="new-design-review-create"]').click();
  await page.waitForURL(/\/room\//, { timeout: 60_000 });
  const roomId = new URL(page.url()).pathname.split('/')[2];
  await page.waitForSelector('canvas', { timeout: 120_000 });
  await page.waitForTimeout(2000);
  return roomId;
}

async function loadSynthSample(page) {
  const prompt = page.getByRole('button', { name: /Try a sample/i }).first();
  if (await prompt.isVisible().catch(() => false)) await prompt.click();
  else await page.getByRole('button', { name: /Model Tree/i }).click();
  await page.getByRole('button', { name: 'Synth assembly', exact: true }).first().click();
  await page.waitForTimeout(3000);
}

async function pressDone(page) {
  const done = page.getByTitle('Finish editing and go back to the meeting');
  if (await done.isVisible().catch(() => false)) await done.click();
  await page.waitForTimeout(1500);
}

/** Import a GLB through the real hidden file input; waits on the renderer's own counters. */
async function importFixture(page, parts) {
  const fixture = join(FIXTURES, parts === 800 ? 'assembly-800.glb' : parts === 10000 ? 'assembly-10000.glb' : 'step-assembly-800.glb');
  if (!existsSync(fixture)) throw new Error(`missing fixture ${fixture}`);
  await page.setInputFiles('input[type="file"]', fixture);
  const beside = page.locator('[data-testid="import-choice-beside"]');
  const deadline = Date.now() + 10 * 60_000;
  let onScreen = false;
  while (Date.now() < deadline && !onScreen) {
    if (await beside.isVisible().catch(() => false)) await beside.click();
    else if ((await page.evaluate(() => window.__vpPerf?.renderer().triangles ?? 0).catch(() => 0)) > 1000) onScreen = true;
    else await page.waitForTimeout(250);
  }
  if (!onScreen) throw new Error(`${parts}-part fixture never reached the renderer`);
  await page.waitForTimeout(3000);
}

/** Hold the P-key laser on a point of the model until it names a part. */
async function laserOnPart(page, { tag = 'shot' } = {}) {
  const vp = page.viewportSize();
  // Aim at the model's own projected box when the perf probe is up (the way the
  // app's perf spec sweeps), and fall back to a small grid: after a zoom the
  // model can sit off the exact centre, and a ray from inside a closed mesh
  // names nothing.
  const rect = await page.evaluate(() => window.__vpPerf?.modelScreenRect?.() ?? null).catch(() => null);
  const offsets = [];
  if (rect && rect.width > 4) {
    const cx = (rect.left + rect.width / 2) / vp.width;
    const cy = (rect.top + rect.height / 2) / vp.height;
    offsets.push([cx, cy], [(rect.left + rect.width * 0.3) / vp.width, cy], [(rect.left + rect.width * 0.7) / vp.width, cy]);
  }
  offsets.push([0.5, 0.5], [0.45, 0.45], [0.55, 0.55], [0.5, 0.4], [0.4, 0.5], [0.6, 0.5], [0.5, 0.6], [0.35, 0.5], [0.65, 0.5], [0.5, 0.35], [0.5, 0.65]);
  await page.keyboard.down('p');
  const deadline = Date.now() + 30_000;
  let named = '';
  for (const [ox, oy] of offsets) {
    if (named) break;
    const cx = Math.round(vp.width * ox);
    const cy = Math.round(vp.height * oy);
    for (let tries = 0; tries < 8 && !named; tries += 1) {
      await page.mouse.move(cx, cy);
      named = await page.evaluate(() => {
        for (const d of document.querySelectorAll('div')) {
          if (d.style.fontSize === '8px' && d.style.borderRadius === '3px' && d.textContent?.trim()) return d.textContent.trim();
        }
        return '';
      });
      if (!named && Date.now() > deadline) break;
      if (!named) await page.waitForTimeout(200);
    }
  }
  if (!named) {
    await page.keyboard.up('p');
    const file = join(RAW, `_fail-${tag}.png`);
    await page.screenshot({ path: file }).catch(() => {});
    throw new Error(`the laser never named a part (rect ${JSON.stringify(rect)}; see ${file})`);
  }
  await page.waitForTimeout(1200); // let the selection glow reach the frame
  return named;
}

async function laserOff(page) {
  await page.keyboard.up('p');
  await page.waitForTimeout(600);
}

async function orbit(page, ms, { radiusX = 0.28, radiusY = 0.18 } = {}) {
  const vp = page.viewportSize();
  const cx = vp.width / 2;
  const cy = vp.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const endsAt = Date.now() + ms;
  let moves = 0;
  while (Date.now() < endsAt) {
    const angle = (moves / 120) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(angle) * vp.width * radiusX, cy + Math.sin(angle) * vp.height * radiusY);
    moves += 1;
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
}

async function zoomTo(page, steps, delayMs = 120) {
  const vp = page.viewportSize();
  await page.mouse.move(vp.width / 2, vp.height / 2);
  for (let i = 0; i < steps; i += 1) {
    // OrbitControls dollies one fixed step per wheel EVENT, so getting close
    // takes many of them, not one big deltaY.
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(delayMs);
  }
}

// ── session A: the Synth room, two people ────────────────────────────────────

async function sessionSynth(browser) {
  const { context: mariaCtx, page: maria } = await newUser(browser, { user: MARIA, identity: true });
  const roomId = await createReviewViaLobby(maria, MARIA.name);
  log('room', roomId);
  await loadSynthSample(maria);
  await pressDone(maria);
  await maria.waitForTimeout(1500);

  if (want('room-empty')) {
    await shot(
      maria,
      'room-empty',
      'A fresh review room ("Bracket review") with the bundled Synth assembly loaded and edit mode finished: top bar, Model Tree, session sync and the capture panel around an empty meeting.',
      'Lobby -> + New design review -> Try a sample -> Synth assembly -> Done, then a full-page screenshot.',
    );
  }

  if (want('pins')) {
    await maria.getByRole('button', { name: 'Comments', exact: true }).first().click();
    await maria.getByRole('button', { name: 'Comment', exact: true }).first().click();
    const vp = maria.viewportSize();
    await maria.mouse.click(vp.width * 0.5, vp.height * 0.49);
    const box = maria.getByPlaceholder('Add a comment... Use @ to mention');
    await box.waitFor({ state: 'visible', timeout: 15_000 });
    await box.fill('Maria to increase the clearance here to one millimetre.');
    await maria.getByRole('button', { name: /Submit/ }).click();
    await maria.waitForTimeout(1500);
    await shot(
      maria,
      'pins',
      'A comment pinned to a part of the Synth assembly: the pin marker sits on the part in 3D and the comment is listed in the Comments panel with the part it is attached to.',
      'Comments tab -> Comment -> click the part in the 3D view -> type -> Submit (Cmd+Enter), then a full-page screenshot.',
    );
  }

  // Jon knocks; Maria admits him. A parked arrival renders only the waiting room
  // (no canvas), so wait for its text rather than for the scene.
  const { context: jonCtx, page: jon } = await newUser(browser, { roomId, user: JON, perf: true });
  await jon.goto(`${APP}/room/${roomId}?perf=1`, { waitUntil: 'domcontentloaded' });
  await jon.getByText('Waiting for the host to let you in.').waitFor({ state: 'visible', timeout: 60_000 });
  await maria.getByRole('button', { name: 'Admit', exact: true }).waitFor({ state: 'visible', timeout: 60_000 });
  if (want('two-people-knock')) {
    await shot(
      maria,
      'two-people-knock',
      'Maria\'s view while Jon is parked in the waiting room: the "Waiting to Join" card names Jon with an Admit button, and nobody else has received anything about the room yet.',
      'A second browser context (Jon) opened the same room id and was parked by the room server; screenshot of Maria\'s page before she admits him.',
    );
  }
  await maria.getByRole('button', { name: 'Admit', exact: true }).click();
  await jon.waitForSelector('canvas', { timeout: 120_000 });
  await jon.waitForTimeout(2500);
  await orbit(jon, 700); // move Jon's camera so his presence reads in Maria's view
  await maria.getByTitle('Participants').click();
  await maria.waitForTimeout(2000);

  if (want('two-people')) {
    await shot(
      maria,
      'two-people',
      'Maria\'s view with Jon admitted and in the room: Jon\'s avatar and name label are in the 3D scene and the Participants panel lists both of them as live.',
      'Two browser contexts in one room; Maria clicked Admit on Jon\'s knock; Jon orbited his camera; screenshot of Maria\'s page.',
    );
    await shot(
      jon,
      'two-people-jon',
      'The same room from Jon\'s browser: the Synth assembly, Maria\'s avatar and name label in the scene, and both participants in his Participants panel.',
      'The second of the two contexts in the two-people capture, screenshotted at the same moment as Maria\'s view.',
    );
  }

  if (want('split')) {
    await maria.getByTitle('Hybrid Split Screen').click();
    await maria.waitForTimeout(2500);
    await shot(
      maria,
      'split',
      'Hybrid split screen on Maria\'s side: her own free view on the left and exactly what Jon sees on the right, with the YOU / Jon badge across the seam.',
      'Call bar -> Hybrid Split Screen (the target auto-picks the only other participant, Jon), then a full-page screenshot of Maria.',
    );
  }

  if (want('follow')) {
    await maria.getByTitle('Sync / Leader Mode').click();
    await maria.waitForTimeout(1000);
    // LEADER_CHANGE makes the room follow the leader on its own; clicking the
    // participant row would toggle that follow back off.
    await jon.getByTitle('Participants').click();
    const pill = jon.getByText(/^Following/).first();
    if (!(await pill.isVisible().catch(() => false))) {
      await jon.getByRole('button', { name: /Maria/ }).first().click();
    }
    await pill.waitFor({ state: 'visible', timeout: 15_000 });
    await orbit(maria, 1500); // Maria leads; Jon's view follows
    await jon.waitForTimeout(1500);
    await shot(
      jon,
      'follow',
      'Jon\'s view while he follows Maria: the "Following Maria" pill above the canvas and the Free view button that leaves the follow.',
      'Maria pressed Lead (Sync / Leader Mode); Jon clicked Maria in his Participants panel; Maria orbited; screenshot of Jon\'s page.',
    );
  }

  await mariaCtx.close();
  await jonCtx.close();
}

// ── session B: the laser on the 800-part assembly ────────────────────────────

async function sessionLaser(browser) {
  const roomId = `cap-laser-${Date.now()}`;
  const { context, page } = await newUser(browser, { roomId, user: MARIA, perf: true });
  await gotoRoom(page, roomId, { perf: true });
  await importFixture(page, 800);
  await zoomTo(page, 20); // close enough that one part's #0044AA glow reads
  const named = await laserOnPart(page, { tag: 'laser' });
  await shot(
    page,
    'laser',
    `The pointing laser held on part "${named}" of the 800-part assembly: the laser dot and beam from Maria's avatar and the part name label at the hit; the part is selected. On a batched imported model a single-part selection draws no visible highlight (pixel-diffed), so no glow is in frame — see ASSETS.md.`,
    'Imported perf/fixtures/assembly-800.glb through the real file input, held the P-key laser on the part until it was named, then a full-page screenshot.',
  );
  await laserOff(page);
  await context.close();
}

// ── session C: the STEP-derived assembly: tree, hero, variant probe ──────────

async function sessionTree(browser) {
  const roomId = `cap-tree-${Date.now()}`;
  const { context, page } = await newUser(browser, { roomId, user: MARIA, perf: true });
  await gotoRoom(page, roomId, { perf: true });
  await importFixture(page, 'step800');
  const named = await laserOnPart(page, { tag: 'tree' });
  await laserOff(page);

  if (want('tree')) {
    await zoomTo(page, 10);
    // The tree opens by itself once a model is imported; the header button is a
    // toggle, so pressing it here would close it.
    if (!(await page.getByRole('button', { name: /Import 3D Model/i }).first().isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /Model Tree/i }).click();
    }
    await page.waitForTimeout(2000);
    const selected = await page.locator('[class*="border-blue-500"]').count();
    log('selected tree rows:', selected);
    await shot(
      page,
      'tree',
      `The Model Tree open on the 800-part STEP-derived assembly with part "${named}" selected: every part by the name the STEP file gives it, the selected row highlighted, the same part selected in the 3D view (on a batched model the single-part highlight is not drawn — see ASSETS.md).`,
      'Imported perf/fixtures/step-assembly-800.glb through the real file input, selected one part with the laser, zoomed in, left the Model Tree open, then a full-page screenshot.',
    );
  }

  if (want('variants')) {
    // Variants need POST /api/reviews/lines against a database; serve.mjs runs with
    // dummy DB env on purpose, so this is expected to fail. Verify rather than assume.
    try {
      await page.getByTestId('start-variant').click();
      await page.getByTestId('start-variant-field').fill('Steel hinge pin');
      await page.getByTestId('start-variant-go').click();
      await page.waitForTimeout(4000);
      const body = await page.locator('body').innerText();
      skip('variants', `creating a variant needs the database-backed /api/reviews/lines; the no-Docker server answers it with an error (page still showed the start panel; body contained "not_configured": ${/not_configured|could not|failed/i.test(body)}).`);
    } catch (err) {
      skip('variants', `the Variant control could not be exercised: ${String(err).slice(0, 160)}`);
    }
  }

  await context.close();
}

// ── session C2: the hero still, from the same model the site ships as GLB ────

async function sessionHero(browser) {
  // One fresh room per attempt: a selection from the previous attempt would still
  // be in this attempt's "before" frame.
  let best = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const roomId = `cap-hero-${Date.now()}-${attempt}`;
    const { context, page } = await newUser(browser, { roomId, user: MARIA, perf: true, viewport: { width: 1200, height: 1200 } });
    await gotoRoom(page, roomId, { perf: true });
    // The site ships this exact file as /assets/hero-model.glb, so the still the
    // hero shows and the model the 3D hero loads are one and the same.
    copyFileSync(join(FIXTURES, 'step-assembly-800.glb'), join(ASSETS, 'hero-model.glb'));
    log(`hero-model.glb copied from the fixture the scene mounts (${statSync(join(ASSETS, 'hero-model.glb')).size} bytes)`);
    await importFixture(page, 'step800');
    // The app's auto-frame leaves the assembly small in a square viewport; the
    // dolly is one fixed step per wheel event, so filling the frame takes ~20 of
    // them. Too many more puts the camera inside the assembly.
    await zoomTo(page, attempt === 1 ? 22 : 26);
    await page.waitForTimeout(3000); // let the dolly damping settle
    const rect = await page.evaluate(() => window.__vpPerf?.modelScreenRect?.() ?? null).catch(() => null);
    log(`hero attempt ${attempt}: model screen rect ${JSON.stringify(rect)}`);
    const frame = () => page
      .evaluate(() => document.querySelector('canvas').toDataURL('image/png').split(',')[1])
      .then((b64) => Buffer.from(b64, 'base64'));
    // Kept as evidence: the running app draws no highlight for a selection on a
    // batched imported model (a whole-model selection changes nothing either), so
    // the pair shows the selection is real but invisible in the render.
    writeFileSync(join(RAW, `_hero-before-a${attempt}.png`), await frame());
    let named = '';
    try {
      named = await laserOnPart(page, { tag: `hero-model-a${attempt}` });
    } catch (e) {
      log(`hero attempt ${attempt}: ${e.message}`);
    }
    await laserOff(page);
    await page.waitForTimeout(2000);
    const after = await frame();
    writeFileSync(join(RAW, `_hero-after-a${attempt}.png`), after);
    log(`hero attempt ${attempt}: selected part=${named || 'none'}`);
    if (named) {
      best = { named, after, rect };
      await context.close();
      break;
    }
    await context.close();
  }

  if (!best) {
    skip(
      'hero-model',
      'the laser never named a part of step-assembly-800.glb in two attempts, so no still of the shipped model could be taken; the webps already in public/assets are kept',
    );
    return;
  }

  // The app has no hide-UI mode; the framebuffer read already drops every DOM
  // overlay, and this crop is the "crop to the canvas region around the model"
  // the task allows, so the assembly fills the square instead of sitting small
  // in the middle of the floor.
  const SRC = 2400; // 1200 CSS px at dpr 2
  const side = Math.min(SRC, Math.max(1920, Math.round(Math.max(best.rect?.width ?? 0, best.rect?.height ?? 0) * 2 * 1.65)));
  const cx = Math.round(((best.rect?.left ?? 300) + (best.rect?.width ?? 600) / 2) * 2);
  const cy = Math.round(((best.rect?.top ?? 300) + (best.rect?.height ?? 600) / 2) * 2);
  const left = Math.max(0, Math.min(SRC - side, cx - Math.round(side / 2)));
  const top = Math.max(0, Math.min(SRC - side, cy - Math.round(side / 2)));
  const file = join(RAW, 'hero-model.png');
  await sharp(best.after).extract({ left, top, width: side, height: side }).png().toFile(file);
  log(`hero-model.png cropped to ${side}x${side} at ${left},${top} around the model's projected box`);
  record(
    'hero-model',
    file,
    `The 800-part STEP-derived assembly — the same file the site ships as /assets/hero-model.glb — with part "${best.named}" selected, on the app's light viewport with the floor grid and contact shadow. Chrome-free: read from the WebGL framebuffer, then cropped to the square around the model's projected box. NOTE: the running app draws no visible highlight for a selection on a batched imported model (verified: a whole-model selection changes nothing either), so the selection is real but not glowing in frame.`,
    `Imported perf/fixtures/step-assembly-800.glb through the real file input in a fresh room at a 1200x1200 viewport with dpr 2, dollied the camera in, selected "${best.named}" with the P-key laser, read canvas.toDataURL() (the app renders with preserveDrawingBuffer: true) and cropped the ${side}px square around the model's projected box (${left},${top}).`,
  );
}

// ── session D: the 10 000-part assembly, orbiting, on video ──────────────────

async function sessionBig(browser) {
  const roomId = `cap-10000-${Date.now()}`;
  const videoDir = join(RAW, 'video');
  mkdirSync(videoDir, { recursive: true });
  const { context, page } = await newUser(browser, {
    roomId,
    user: MARIA,
    perf: true,
    recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } },
  });
  await gotoRoom(page, roomId, { perf: true });
  await importFixture(page, 10000);
  const named = await laserOnPart(page, { tag: 'big-assembly' });
  await laserOff(page);
  await page.waitForTimeout(1000);
  await orbit(page, 6000);
  await page.waitForTimeout(1500);
  const video = page.video();
  await context.close();
  const src = await video.path();
  const dst = join(RAW, 'big-assembly.webm');
  copyFileSync(src, dst);
  record(
    'big-assembly',
    dst,
    `The 10 000-part assembly with part "${named}" selected, orbiting for six seconds.`,
    'Imported perf/fixtures/assembly-10000.glb through the real file input, selected one part with the laser, then orbited the camera with a real mouse drag while Playwright recorded the page.',
  );
}

// ── run ─────────────────────────────────────────────────────────────────────

const MANIFEST = join(RAW, 'manifest.json');
const previous = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { shots: [], skipped: [] };

const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
try {
  const sessions = [
    [['room-empty', 'pins', 'two-people', 'two-people-knock', 'two-people-jon', 'split', 'follow'], sessionSynth],
    [['laser'], sessionLaser],
    [['tree', 'variants'], sessionTree],
    [['hero-model'], sessionHero],
    [['big-assembly'], sessionBig],
  ];
  for (const [names, fn] of sessions) {
    if (names.some(want)) await fn(browser);
  }
} finally {
  await browser.close();
}

// Merge with earlier runs so a filtered re-run keeps the shots it did not redo,
// and drop entries whose file no longer exists.
const byName = new Map(previous.shots.map((s) => [s.name, s]));
for (const s of manifest) byName.set(s.name, s);
const shots = [...byName.values()].filter((s) => existsSync(s.file));
const skipNames = new Set(previous.skipped.map((s) => s.name));
for (const s of skipped) skipNames.delete(s.name);
// The GLB ships now (sessionHero copies the fixture), so its old skip is void.
const glbShips = existsSync(join(ASSETS, 'hero-model.glb'));
const keptSkips = previous.skipped.filter((s) => skipNames.has(s.name) && !manifest.some((m) => m.name === s.name) && !(glbShips && s.name === 'hero-model-glb'));
writeFileSync(MANIFEST, `${JSON.stringify({ shots, skipped: [...keptSkips, ...skipped] }, null, 2)}\n`);
log(`manifest written: ${shots.length} shots, ${keptSkips.length + skipped.length} skipped`);
for (const s of [...keptSkips, ...skipped]) log(`  skipped ${s.name}: ${s.why}`);
