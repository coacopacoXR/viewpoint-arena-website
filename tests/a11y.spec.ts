import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Task 06 §3 — accessibility bars, on the built site:
 *  - axe on every page in both colour schemes, zero serious/critical findings
 *  - keyboard: every tab stop on `/` shows a visible focus ring (§4, §7)
 *  - the mobile menu sheet traps Tab and closes on Escape, returning focus
 *    to the button that opened it (DESIGN.md §5, src/scripts/nav.ts)
 *
 * Add every new page to PAGES.
 */
const PAGES = ['./', 'install', 'how-it-works', 'changelog', '404'] as const;

for (const scheme of ['light', 'dark'] as const) {
  for (const path of PAGES) {
    test(`${path} in ${scheme} has no serious or critical axe violations`, async ({
      page: p,
    }) => {
      await p.emulateMedia({ colorScheme: scheme });
      await p.setViewportSize({ width: 1440, height: 900 });
      await p.goto(path);
      await p.waitForLoadState('load');
      /* let the lazy figures and the hero gate settle, so the DOM axe sees is
         the one a visitor gets */
      await p.waitForTimeout(1_200);

      const results = await new AxeBuilder({ page: p }).analyze();
      const blocking = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );

      expect(
        blocking.map(
          (violation) =>
            `${violation.id} (${violation.impact}): ${violation.nodes
              .map((node) => node.html)
              .join(' | ')}`,
        ),
        `${path} in ${scheme} has blocking axe violations`,
      ).toEqual([]);
    });
  }
}

test('home: every tab stop shows a visible focus ring', async ({ page: p }) => {
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto('./');
  await p.waitForLoadState('load');
  await p.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });

  const seen: string[] = [];
  for (let step = 0; step < 40; step += 1) {
    await p.keyboard.press('Tab');
    const focus = await p.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      const style = getComputedStyle(el);
      return {
        label: `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0] || '(none)'}`,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
      };
    });
    if (focus === null) break;

    seen.push(focus.label);
    const ringed =
      (focus.outlineStyle !== 'none' && Number.parseFloat(focus.outlineWidth) > 0) ||
      focus.boxShadow !== 'none';
    expect(ringed, `${focus.label} takes focus with no visible ring`).toBe(true);
  }

  expect(seen.length, 'the page has almost no tab stops').toBeGreaterThan(5);
});

test('home at 360px: the menu sheet traps Tab and closes on Escape', async ({ page: p }) => {
  await p.setViewportSize({ width: 360, height: 740 });
  await p.goto('./');
  await p.waitForLoadState('load');

  const sheet = p.locator('[data-menu-sheet]');
  await p.locator('[data-menu-toggle]').click();
  await expect(sheet).toHaveAttribute('data-open', 'true');

  /* opening the sheet moves focus into it */
  expect(
    await p.evaluate(
      () => document.querySelector('[data-menu-sheet]')?.contains(document.activeElement) ?? false,
    ),
    'focus did not move into the sheet',
  ).toBe(true);

  /* a full circuit of Tab and Shift+Tab must never leave the sheet */
  for (let step = 0; step < 14; step += 1) {
    await p.keyboard.press(step % 3 === 2 ? 'Shift+Tab' : 'Tab');
    expect(
      await p.evaluate(
        () =>
          document.querySelector('[data-menu-sheet]')?.contains(document.activeElement) ?? false,
      ),
      `tab stop ${step} escaped the sheet`,
    ).toBe(true);
  }

  await p.keyboard.press('Escape');
  await expect(sheet).toHaveAttribute('data-open', 'false');
  await expect(sheet).toHaveAttribute('inert', '');
  expect(
    await p.evaluate(() => document.activeElement?.hasAttribute('data-menu-toggle') ?? false),
    'Escape did not return focus to the Menu button',
  ).toBe(true);
});
