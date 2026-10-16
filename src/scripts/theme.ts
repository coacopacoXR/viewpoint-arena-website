/**
 * theme.ts — the nav theme toggle (DESIGN.md §2).
 * The inline head script in `Base.astro` sets `data-theme` before first paint;
 * this module owns the toggle and keeps the button's accessible name pointing
 * at the theme it will switch *to* (CONTENT.md NAV).
 * localStorage is only ever touched inside try/catch.
 */
import { THEME_KEY } from '../lib/site';

type Theme = 'light' | 'dark';

const root = document.documentElement;
const media = window.matchMedia('(prefers-color-scheme: dark)');
const toggles = Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]'),
);

function systemTheme(): Theme {
  return media.matches ? 'dark' : 'light';
}

function currentTheme(): Theme {
  const attr = root.getAttribute('data-theme');
  return attr === 'dark' || attr === 'light' ? attr : systemTheme();
}

function render(): void {
  const current = currentTheme();
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  for (const button of toggles) {
    const label =
      next === 'dark'
        ? (button.dataset.themeLabelDark ?? 'Switch to dark theme')
        : (button.dataset.themeLabelLight ?? 'Switch to light theme');
    button.setAttribute('aria-label', label);
    button.setAttribute('data-theme-state', current);
  }
}

function toggle(): void {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* private mode or blocked storage: the toggle still works for this page */
  }
  render();
}

for (const button of toggles) {
  button.addEventListener('click', toggle);
}

/* No override stored? Then the OS decides, and the labels must follow it. */
media.addEventListener('change', () => {
  if (!root.hasAttribute('data-theme')) render();
});

render();
