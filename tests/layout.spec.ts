import { expect, test } from '@playwright/test';

/**
 * Layout guarantees from DESIGN.md §3 and §7:
 *  - nothing causes horizontal scroll at 360 / 768 / 1440
 *  - one `h1` per page
 *  - the skip link is the first tab stop
 *  - `prefers-reduced-motion: reduce` means `html` never gets `.motion`
 *
 * Add every new page to PAGES.
 */
const PAGES = [
  { name: 'home', path: './' },
  { name: 'install', path: 'install' },
  { name: 'how-it-works', path: 'how-it-works' },
  { name: 'changelog', path: 'changelog' },
  { name: '404', path: '404' },
] as const;

const WIDTHS = [360, 768, 1440] as const;
const HEIGHT = 900;

for (const page of PAGES) {
  for (const width of WIDTHS) {
    test(`${page.name} at ${width}px has no horizontal scroll`, async ({ page: p }) => {
      await p.setViewportSize({ width, height: HEIGHT });
      await p.goto(page.path);
      await p.waitForLoadState('load');

      const metrics = await p.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        innerWidth: window.innerWidth,
      }));

      expect(
        metrics.scrollWidth,
        `documentElement.scrollWidth ${metrics.scrollWidth} exceeds innerWidth ${metrics.innerWidth}`,
      ).toBeLessThanOrEqual(metrics.innerWidth);
      expect(
        metrics.bodyScrollWidth,
        `body.scrollWidth ${metrics.bodyScrollWidth} exceeds innerWidth ${metrics.innerWidth}`,
      ).toBeLessThanOrEqual(metrics.innerWidth);
    });
  }

  test(`${page.name} has exactly one h1`, async ({ page: p }) => {
    await p.goto(page.path);
    await expect(p.locator('h1')).toHaveCount(1);
  });

  test(`${page.name} offers the skip link as the first tab stop`, async ({ page: p }) => {
    await p.goto(page.path);
    /* start from nothing focused, so Tab begins at the top of the document */
    await p.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    });
    await p.keyboard.press('Tab');

    const target = await p.evaluate(() => {
      const active = document.activeElement;
      return {
        href: active?.getAttribute('href'),
        text: active?.textContent?.trim(),
      };
    });

    expect(target.href).toBe('#content');
    expect(target.text).toBe('Skip to content');
  });
}

/**
 * The motion gate, checked in whatever reduced-motion state the browser is in:
 * `html.motion` must be present exactly when motion is allowed. This is what
 * keeps content visible with JS off and with reduced motion on (DESIGN.md §4).
 */
for (const page of PAGES) {
  test(`${page.name} sets html.motion only when motion is allowed`, async ({ page: p }) => {
    await p.goto(page.path);
    const prefersReduced = await p.evaluate(
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    await expect
      .poll(
        async () =>
          p.evaluate(() => document.documentElement.classList.contains('motion')),
        { timeout: 8_000 },
      )
      .toBe(!prefersReduced);
  });
}

test.describe('prefers-reduced-motion: reduce', () => {
  test.use({ reducedMotion: 'reduce' });

  test('home never gets html.motion and reveals nothing', async ({ page: p }) => {
    await p.goto('./');
    await p.waitForLoadState('load');

    await expect(
      p.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    ).resolves.toBe(true);

    await expect
      .poll(async () =>
        p.evaluate(() => document.documentElement.classList.contains('motion')),
      )
      .toBe(false);

    /* every reveal target must still be fully readable */
    const hidden = await p.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>('[data-reveal], [data-scrub-fill]'),
      ).filter((el) => Number(getComputedStyle(el).opacity) < 1).length,
    );
    expect(hidden).toBe(0);
  });
});

/**
 * Landing-page behaviour (task 02): the section index tracks the section under
 * the middle of the viewport, [02] pins only on desktop, and the [04] counters
 * settle on the value the HTML already holds.
 */
test.describe('home landing behaviour', () => {
  test('the section index highlights the section being read', async ({ page: p }) => {
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.goto('./');
    await p.locator('#features').scrollIntoViewIfNeeded();

    await expect
      .poll(async () =>
        p.evaluate(
          () =>
            document
              .querySelector('[data-index-link="features"]')
              ?.getAttribute('aria-current') ?? null,
        ),
      )
      .toBe('true');
  });

  test('[02] pins on desktop and is a plain stack below 1024px', async ({ page: p }) => {
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.goto('./');

    await expect
      .poll(async () =>
        p.evaluate(
          () => document.querySelector('[data-steps]')?.getAttribute('data-pinned') ?? null,
        ),
      )
      .toBe('true');

    await p.setViewportSize({ width: 768, height: 900 });

    await expect
      .poll(async () =>
        p.evaluate(
          () => document.querySelector('[data-steps]')?.hasAttribute('data-pinned') ?? false,
        ),
      )
      .toBe(false);
  });

  test('[04] counters settle on the final value in the HTML', async ({ page: p }) => {
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.goto('./');
    await p.locator('#privacy').scrollIntoViewIfNeeded();

    await expect
      .poll(async () => p.locator('[data-count-to="8"]').textContent())
      .toBe('8');
  });
});
