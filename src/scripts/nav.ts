/**
 * nav.ts — pill behaviour and the mobile menu sheet (DESIGN.md §5).
 *  - hides the pill on scroll down, shows it on scroll up (§4)
 *  - `Menu` opens a full-screen sheet: focus moves in, Tab is trapped inside,
 *    Esc closes and focus returns to the button that opened it
 *  - the sheet is `inert` while closed, so nothing in it is focusable
 */

const header = document.querySelector<HTMLElement>('[data-nav]');
const menuToggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
const sheet = document.querySelector<HTMLElement>('[data-menu-sheet]');
const closeButton = document.querySelector<HTMLButtonElement>('[data-menu-close]');

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Below this width the pill shows `Menu` instead of the links. */
const desktopQuery = window.matchMedia('(min-width: 900px)');

/* --------------------------------------------------------- hide on scroll */

const HIDE_AFTER = 120;
const THRESHOLD = 6;
let lastY = window.scrollY;
let sheetOpen = false;

function setHidden(hidden: boolean): void {
  header?.setAttribute('data-hidden', hidden ? 'true' : 'false');
}

function onScroll(): void {
  const y = window.scrollY;
  const delta = y - lastY;
  lastY = y;
  if (sheetOpen) return;
  if (y <= HIDE_AFTER) {
    setHidden(false);
  } else if (delta > THRESHOLD) {
    setHidden(true);
  } else if (delta < -THRESHOLD) {
    setHidden(false);
  }
}

window.addEventListener('scroll', onScroll, { passive: true });
setHidden(false);

/* ------------------------------------------------------------ menu sheet */

function focusables(): HTMLElement[] {
  if (!sheet) return [];
  return Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE));
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeSheet();
    return;
  }
  if (event.key !== 'Tab') return;

  const items = focusables();
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && (active === first || !sheet?.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !sheet?.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function announceMenu(open: boolean): void {
  /* motion.ts pauses Lenis while the sheet is open so the sheet can scroll */
  window.dispatchEvent(new CustomEvent('va:menu', { detail: { open } }));
}

function openSheet(): void {
  if (!sheet || !menuToggle || sheetOpen) return;
  sheetOpen = true;
  sheet.removeAttribute('inert');
  sheet.setAttribute('data-open', 'true');
  menuToggle.setAttribute('aria-expanded', 'true');
  root().setAttribute('data-nav-open', 'true');
  setHidden(false);
  announceMenu(true);
  document.addEventListener('keydown', onKeydown);
  (closeButton ?? focusables()[0])?.focus();
}

function closeSheet(): void {
  if (!sheet || !menuToggle || !sheetOpen) return;
  sheetOpen = false;
  sheet.setAttribute('data-open', 'false');
  sheet.setAttribute('inert', '');
  menuToggle.setAttribute('aria-expanded', 'false');
  root().removeAttribute('data-nav-open');
  announceMenu(false);
  document.removeEventListener('keydown', onKeydown);
  menuToggle.focus();
}

function root(): HTMLElement {
  return document.documentElement;
}

menuToggle?.addEventListener('click', () => {
  if (sheetOpen) closeSheet();
  else openSheet();
});

closeButton?.addEventListener('click', closeSheet);

/* the sheet must not stay open over the desktop pill */
desktopQuery.addEventListener('change', (event) => {
  if (event.matches) closeSheet();
});
