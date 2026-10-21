import { expect, test, type Page } from '@playwright/test';

/**
 * Task 05: the real assets and the 3D hero.
 *
 *  - every image ships alt text, intrinsic size, a srcset and `sizes`, and is
 *    lazy unless it is the hero still (DESIGN.md §7)
 *  - every video is muted, inline, looping, `preload="none"` with a poster, and
 *    is described by its wrapper (DESIGN.md §5)
 *  - every asset URL the HTML names actually resolves
 *  - the 3D hero only wakes up where §5 allows it, and three.js is never part of
 *    the default JS: a phone-sized coarse-pointer page must not request it
 */
const PAGES = ['./', 'install', 'how-it-works', 'changelog', '404'] as const;

/** three.js, its loader and the model are the only files the lazy hero fetches. */
const THREE_CHUNK = /three\.module|GLTFLoader|meshopt_decoder|hero-model\.glb/;

interface ImageFacts {
  alt: string | null;
  width: string | null;
  height: string | null;
  loading: string | null;
  decoding: string | null;
  fetchpriority: string | null;
  srcset: string | null;
  sizes: string | null;
  src: string;
}

function imagesOn(page: Page): Promise<ImageFacts[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLImageElement>('img')).map((img) => ({
      alt: img.getAttribute('alt'),
      width: img.getAttribute('width'),
      height: img.getAttribute('height'),
      loading: img.getAttribute('loading'),
      decoding: img.getAttribute('decoding'),
      fetchpriority: img.getAttribute('fetchpriority'),
      srcset: img.getAttribute('srcset'),
      sizes: img.getAttribute('sizes'),
      src: img.currentSrc || img.src,
    })),
  );
}

/** Every URL the markup names, fetched or not: srcsets, posters, sources. */
function referencedAssets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found = new Set<string>();
    const addSrcset = (value: string | null) => {
      for (const candidate of (value ?? '').split(',')) {
        const url = candidate.trim().split(/\s+/)[0];
        if (url) found.add(new URL(url, document.baseURI).href);
      }
    };
    for (const img of document.querySelectorAll<HTMLImageElement>('img')) {
      if (img.src) found.add(img.src);
      addSrcset(img.getAttribute('srcset'));
    }
    for (const source of document.querySelectorAll<HTMLSourceElement>('picture source')) {
      addSrcset(source.getAttribute('srcset'));
    }
    for (const video of document.querySelectorAll<HTMLVideoElement>('video')) {
      const poster = video.getAttribute('poster');
      if (poster) found.add(new URL(poster, document.baseURI).href);
      for (const source of video.querySelectorAll('source')) {
        const src = source.getAttribute('src');
        if (src) found.add(new URL(src, document.baseURI).href);
      }
    }
    return [...found];
  });
}

for (const path of PAGES) {
  test(`${path}: images are described, sized and lazy except the hero still`, async ({
    page: p,
  }) => {
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.goto(path);
    await p.waitForLoadState('load');

    const images = await imagesOn(p);
    if (path === './') expect(images.length, 'home has no images').toBeGreaterThan(8);

    for (const img of images) {
      const where = `${path} → ${img.src.split('/').pop()}`;
      expect((img.alt ?? '').trim().length, `${where}: missing alt`).toBeGreaterThan(20);
      expect(Number(img.width), `${where}: missing width`).toBeGreaterThan(0);
      expect(Number(img.height), `${where}: missing height`).toBeGreaterThan(0);
      expect(img.decoding, `${where}: not decoded async`).toBe('async');
      expect(img.sizes, `${where}: missing sizes`).toBeTruthy();
      expect(img.srcset, `${where}: missing srcset`).toBeTruthy();

      const heroStill = img.src.includes('hero-model-');
      expect(img.loading, `${where}: wrong loading`).toBe(heroStill ? 'eager' : 'lazy');
      expect(img.fetchpriority, `${where}: wrong fetchpriority`).toBe(
        heroStill ? 'high' : null,
      );
      /* §7: srcset at 640/1280/1920, and never a width the capture lacks */
      const widths = (img.srcset ?? '')
        .split(',')
        .map((entry) => entry.trim().split(/\s+/)[1])
        .filter(Boolean);
      for (const width of widths) {
        expect(['640w', '1280w', '1920w'], `${where}: ${width} is not a shipped width`).toContain(
          width,
        );
      }
    }
  });

  test(`${path}: every asset URL it names resolves`, async ({ page: p }) => {
    await p.setViewportSize({ width: 1440, height: 900 });
    const broken: string[] = [];
    p.on('response', (response) => {
      if (response.status() >= 400) broken.push(`${response.status()} ${response.url()}`);
    });
    await p.goto(path);
    await p.waitForLoadState('load');

    /* srcsets and posters are not all fetched on load, so ask for them */
    const urls = await referencedAssets(p);
    if (path === './') expect(urls.length, 'home names no assets').toBeGreaterThan(8);

    for (const url of urls) {
      const response = await p.request.get(url);
      expect(response.status(), `broken asset ${url}`).toBe(200);
    }
    expect(broken, `${path} requested something missing`).toEqual([]);
  });
}

test('home: videos are muted, inline, looping, poster-backed and described', async ({
  page: p,
}) => {
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto('./');

  const videos = await p.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLVideoElement>('video')).map((video) => ({
      muted: video.hasAttribute('muted'),
      playsinline: video.hasAttribute('playsinline'),
      loop: video.hasAttribute('loop'),
      preload: video.getAttribute('preload'),
      poster: video.getAttribute('poster') ?? '',
      autoplay: video.hasAttribute('autoplay'),
      wrapperLabel: video.parentElement?.getAttribute('aria-label') ?? '',
      wrapperRole: video.parentElement?.getAttribute('role') ?? '',
      src: video.querySelector('source')?.getAttribute('src') ?? '',
    })),
  );

  expect(videos.length).toBe(1);
  for (const video of videos) {
    expect(video.muted, video.src).toBe(true);
    expect(video.playsinline, video.src).toBe(true);
    expect(video.loop, video.src).toBe(true);
    expect(video.preload, video.src).toBe('none');
    expect(video.autoplay, `${video.src} must not autoplay`).toBe(false);
    expect(video.poster, `${video.src} has no poster`).toMatch(/\.webp$/);
    expect(video.wrapperRole, video.src).toBe('img');
    expect(video.wrapperLabel.trim().length, video.src).toBeGreaterThan(20);
  }

  /* `preload="none"` means neither mp4 is on the wire before it is in view */
  const requested: string[] = [];
  p.on('request', (request) => requested.push(request.url()));
  await p.reload();
  await p.waitForLoadState('load');
  expect(requested.filter((url) => url.endsWith('.mp4')), 'a video was fetched on load').toEqual(
    [],
  );
});

test('home: the slot with no capture keeps its pending mat', async ({ page: p }) => {
  await p.goto('./');
  await expect(p.locator('.figure__pending')).toHaveText(/ASSET PENDING · variants/);
});

test('home: captions are FIG-numbered, in one gapless sequence down the page', async ({
  page: p,
}) => {
  await p.goto('./');
  const captions = await p.locator('.figure__caption, .hero-model__caption').allTextContents();
  const numbered = captions.filter((text) => text.startsWith('FIG.'));

  expect(numbered.length).toBeGreaterThan(2);
  for (const caption of numbered) {
    expect(caption).toMatch(/^FIG\. \d\d — \S/);
  }
  /* task 06 §0: one sequence in document order, no repeats and no gaps */
  const numbers = numbered.map((caption) => Number(caption.slice(5, 7)));
  expect(numbers).toEqual(numbers.map((_, index) => index));
  expect(numbered.some((text) => text.includes('text-to-speech reading a script'))).toBe(true);
  expect(numbered.some((text) => text.includes("Chromium's built-in test camera"))).toBe(true);
});

/**
 * A phone-sized coarse-pointer page must never ask for three.js: that is the
 * mobile Lighthouse guarantee (DESIGN.md §5, §7).
 */
test.describe('phone-sized, coarse pointer', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });

  test('home keeps the hero still and never fetches three.js', async ({ page: p }) => {
    const requested: string[] = [];
    p.on('request', (request) => requested.push(request.url()));

    await p.goto('./');
    await p.waitForLoadState('load');
    await p.waitForTimeout(2_000);

    expect(await p.evaluate(() => window.matchMedia('(pointer: fine)').matches)).toBe(false);
    expect(await p.locator('[data-hero]').getAttribute('data-hero')).not.toBe('live');
    expect(
      requested.filter((url) => THREE_CHUNK.test(url)),
      'three.js or the GLB was requested on a phone-sized page',
    ).toEqual([]);
    /* the canvas stays transparent, so the still is what the visitor sees */
    expect(await p.locator('[data-hero-canvas]').evaluate((el) => getComputedStyle(el).opacity)).toBe(
      '0',
    );
  });
});

test.describe('prefers-reduced-motion: reduce', () => {
  test.use({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });

  test('home never starts the 3D hero', async ({ page: p }) => {
    const requested: string[] = [];
    p.on('request', (request) => requested.push(request.url()));

    await p.goto('./');
    await p.waitForLoadState('load');
    await p.waitForTimeout(2_000);

    await expect(p.locator('[data-hero]')).toHaveAttribute('data-hero', 'still');
    expect(requested.filter((url) => THREE_CHUNK.test(url))).toEqual([]);
  });
});

test.describe('desktop, motion allowed', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('home loads the model, draws it and keeps the canvas decorative', async ({ page: p }) => {
    const requested: string[] = [];
    p.on('request', (request) => requested.push(request.url()));

    await p.goto('./');
    /* the model sits below the fold at 1440×900, and the gate waits for it to
       be on screen (§5: hydrated on idle + in view) */
    await p.locator('[data-hero]').scrollIntoViewIfNeeded();
    await expect(p.locator('[data-hero]')).toHaveAttribute('data-hero', 'live', {
      timeout: 30_000,
    });

    expect(
      requested.some((url) => url.endsWith('hero-model.glb')),
      'the GLB was not fetched',
    ).toBe(true);
    await expect(p.locator('[data-hero-canvas]')).toHaveAttribute('aria-hidden', 'true');
    await expect(p.locator('[data-hero-hint]')).toHaveText(/HOVER A PART|TAP A PART/);
    /* the cross-fade has finished: the canvas is up and the still is gone */
    await expect(p.locator('[data-hero-canvas]')).toHaveCSS('opacity', '1');
    await expect(p.locator('[data-hero] img')).toHaveCSS('opacity', '0');

    /* the still stays in the accessibility tree and describes what is visible */
    const alt = await p.locator('[data-hero] img').getAttribute('alt');
    expect((alt ?? '').length).toBeGreaterThan(40);

    /* the turntable is running: two frames 700 ms apart cannot be identical */
    const box = await p.locator('[data-hero-canvas]').boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
    const before = await p.screenshot({ clip });
    await p.waitForTimeout(700);
    const after = await p.screenshot({ clip });
    expect(before.equals(after), 'the hero canvas is not animating').toBe(false);
  });

  test('home lights the part under the pointer, by the name the file gives it', async ({
    page: p,
  }) => {
    await p.goto('./');
    await p.locator('[data-hero]').scrollIntoViewIfNeeded();
    await expect(p.locator('[data-hero]')).toHaveAttribute('data-hero', 'live', {
      timeout: 30_000,
    });

    const box = await p.locator('[data-hero-canvas]').boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    /* sweep across the middle of the assembly until a part is lit */
    let lit = '';
    for (let step = 0; step < 14 && !lit; step += 1) {
      await p.mouse.move(box.x + box.width * (0.28 + step * 0.035), box.y + box.height * 0.5);
      await p.waitForTimeout(120);
      lit = (await p.locator('[data-hero]').getAttribute('data-hero-part')) ?? '';
    }

    expect(lit, 'no part was ever lit under the pointer').toMatch(/^(Part|Fastener|Module)/);
    /* the highlight is the app's SELECTION_HIGHLIGHT, #0044aa at intensity 0.5 */
    expect(await p.locator('[data-hero]').getAttribute('data-hero-glow')).toBe('0044aa');

    /* a tap holds a selection, and leaving the frame does not clear it. The
       turntable is still running, so the held part need not be the same one. */
    await p.mouse.down();
    await p.mouse.up();
    await p.mouse.move(4, 4);
    await p.waitForTimeout(300);
    expect(await p.locator('[data-hero]').getAttribute('data-hero-part')).toMatch(
      /^(Part|Fastener|Module)/,
    );
  });
});

test('how-it-works: the drawing names app, and nginx reaches the database itself', async ({
  page: p,
}) => {
  await p.goto('how-it-works');

  const flows = (await p.locator('.arch__flowline').allTextContents()).join('\n');
  expect(flows).toContain('nginx → app');
  expect(flows).toContain('app → api');
  expect(flows).toContain('rest · realtime');

  for (const variant of ['wide', 'stack'] as const) {
    const svg = p.locator(`.arch__svg--${variant}`);
    const text = (await svg.textContent()) ?? '';
    expect(text, `${variant}: no app box`).toContain('app');
    expect(text, `${variant}: no app sub-label`).toContain('static files');
    expect(text, `${variant}: no /api sub-label`).toContain('proxies /api');
    expect(text, `${variant}: no rest · realtime label`).toContain('rest · realtime');
    expect(text, `${variant}: lost the Database box`).toContain('Postgres / Supabase');
  }
});

/**
 * Task 06 §0: every label in the drawing sits inside its box with padding, in
 * both variants — the optional externals' two-word names used to cross their
 * dashed boxes. Measured in SVG units, so it holds at any rendered width.
 */
for (const [width, variant] of [
  [1440, 'wide'],
  [360, 'stack'],
] as const) {
  test(`how-it-works at ${width}px: every ${variant} label sits inside its box`, async ({
    page: p,
  }) => {
    await p.setViewportSize({ width, height: 900 });
    await p.goto('how-it-works');

    const outside = await p.evaluate(
      (name) => {
        const svg = document.querySelector(`.arch__svg--${name}`);
        if (!svg) return ['the variant is not in the DOM'];
        const offenders: string[] = [];
        for (const node of svg.querySelectorAll('.arch__node')) {
          const box = node.querySelector('rect')?.getBBox();
          if (!box) continue;
          for (const label of node.querySelectorAll('text')) {
            const text = label.getBBox();
            const pad = 4;
            if (
              text.x < box.x + pad ||
              text.x + text.width > box.x + box.width - pad ||
              text.y < box.y + pad / 2 ||
              text.y + text.height > box.y + box.height - pad / 2
            ) {
              offenders.push(
                `"${label.textContent?.trim()}" ${text.width.toFixed(0)}x${text.height.toFixed(
                  0,
                )} in a ${box.width}x${box.height} box`,
              );
            }
          }
        }
        return offenders;
      },
      variant,
    );

    expect(outside, `${variant}: labels outside their boxes`).toEqual([]);
  });
}
