/**
 * motion.ts — the single motion entry point (DESIGN.md §4).
 *
 * One `matchMedia('(prefers-reduced-motion: reduce)')` check gates everything,
 * and it is live: flipping the OS setting tears the whole system down (or
 * builds it back up) without a reload.
 *
 * Rules this file obeys:
 *  - Content is visible with JS off. Start states live in `styles/motion.css`
 *    behind `html.motion`, a class only this file adds.
 *  - Reveals animate `transform` / `opacity` / `background-size` only, so they
 *    can never cause layout shift.
 *  - One easing family: `expo.out` for entrances, `power2.inOut` / `none` for
 *    anything scrubbed by the scroll position.
 *  - Tearing down clears every inline style and restores final values, so a
 *    reduced-motion page looks exactly like a JS-off page.
 *
 * Data attributes handled:
 *   data-reveal="lines|up|fade"   entrance
 *   data-scrub-fill               outline text that fills with ink on scroll
 *   data-count-from / -to         counter, final value already in the HTML
 *   data-marquee                  band whose speed follows scroll velocity
 *   data-steps                    [02] pinned step stack, counter scrubs 01→04
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, SplitText);

const root = document.documentElement;
const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Entrances (§4: 0.5–0.9s, stagger 0.05–0.08s, expo-out). */
const DURATION = 0.7;
const STAGGER = 0.06;
const ENTRANCE_EASE = 'expo.out';
/** Scrubbed work uses power2.inOut, or `none` where it tracks the scroll 1:1. */
const SCRUB_EASE = 'power2.inOut';

let lenis: Lenis | null = null;
let context: gsap.Context | null = null;
let raf: ((time: number) => void) | null = null;
const splits: SplitText[] = [];
const marquees: gsap.core.Tween[] = [];
const counters: { el: HTMLElement; to: string }[] = [];
const stepCounters: { el: HTMLElement; initial: string }[] = [];

/* ------------------------------------------------------------------ helpers */

/** `10 002`, `1 974`, `207.7` → 10002, 1974, 207.7 */
function parseNumber(text: string): number {
  return Number.parseFloat(text.replace(/[^\d.-]/g, ''));
}

/** Render `value` the way CONTENT.md wrote the target: same decimals, same
 *  thousands separator. The HTML always holds the final value, so this only
 *  ever has to imitate it. */
function formatLike(value: number, template: string): string {
  const decimals = (template.split('.')[1] ?? '').replace(/\D/g, '').length;
  /* whatever separates the digits in the source string is the separator */
  const separator = template.replace(/[\d.]/g, '').charAt(0);
  const fixed = value.toFixed(decimals);
  const [int, dec] = fixed.split('.');
  const grouped = separator
    ? int.replace(/\B(?=(\d{3})+(?!\d))/g, separator)
    : int;
  return dec ? `${grouped}.${dec}` : grouped;
}

/* ------------------------------------------------------------------- pieces */

function setupReveals(): void {
  for (const el of gsap.utils.toArray<HTMLElement>('[data-reveal="up"]')) {
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: DURATION,
      ease: ENTRANCE_EASE,
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  }

  for (const el of gsap.utils.toArray<HTMLElement>('[data-reveal="fade"]')) {
    gsap.to(el, {
      opacity: 1,
      duration: DURATION,
      ease: ENTRANCE_EASE,
      scrollTrigger: { trigger: el, start: 'top 92%', once: true },
    });
  }

  /* §4 [01]: paragraphs reveal line by line, masked. SplitText's `aria: auto`
     puts `aria-label` on the original element and `aria-hidden` on the pieces,
     which is right for a heading (it may be named) and prohibited on a `<p>`
     (aria-prohibited-attr), where the masked lines stay in the accessibility
     tree and read in order instead. */
  for (const el of gsap.utils.toArray<HTMLElement>('[data-reveal="lines"]')) {
    const nameable = el.matches('h1, h2, h3, h4, h5, h6');
    /* `Display` sets the intended name as one span per line; SplitText would
       otherwise derive it from `textContent`, which glues the lines together. */
    const intended = nameable
      ? Array.from(el.children)
          .map((line) => line.textContent?.trim() ?? '')
          .filter(Boolean)
          .join(' ')
      : '';
    const split = new SplitText(el, {
      type: 'lines',
      mask: 'lines',
      linesClass: 'split-line',
      autoSplit: true,
      aria: nameable ? 'auto' : 'none',
    });
    if (intended) el.setAttribute('aria-label', intended);
    splits.push(split);
    gsap.from(split.lines, {
      yPercent: 105,
      duration: 0.8,
      ease: ENTRANCE_EASE,
      stagger: STAGGER,
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  }
}

function setupScrubFills(): void {
  for (const el of gsap.utils.toArray<HTMLElement>('[data-scrub-fill]')) {
    /* §4 hero: the outline fills over the first 40vh of page scroll, because
       the hero is already on screen when the page loads. Everything else fills
       as its own element travels through the viewport. */
    const fromPageTop = el.dataset.scrubFill === 'page';
    gsap.fromTo(
      el,
      { backgroundSize: '0% 100%' },
      {
        backgroundSize: '100% 100%',
        ease: 'none',
        scrollTrigger: fromPageTop
          ? { start: 0, end: () => window.innerHeight * 0.4, scrub: true }
          : { trigger: el, start: 'top 85%', end: 'top 45%', scrub: true },
      },
    );
  }
}

function setupCounters(): void {
  for (const el of gsap.utils.toArray<HTMLElement>('[data-count-to]')) {
    const to = el.dataset.countTo;
    const from = el.dataset.countFrom;
    if (to === undefined || from === undefined) continue;
    const startValue = parseNumber(from);
    const endValue = parseNumber(to);
    if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) continue;

    counters.push({ el, to });
    const state = { value: startValue };
    gsap.to(state, {
      value: endValue,
      ease: SCRUB_EASE,
      scrollTrigger: { trigger: el, start: 'top 90%', end: 'top 40%', scrub: true },
      onUpdate: () => {
        el.textContent = formatLike(state.value, to);
      },
    });
  }
}

function setupMarquees(): void {
  for (const el of gsap.utils.toArray<HTMLElement>('[data-marquee]')) {
    const track = el.querySelector<HTMLElement>('.marquee__track');
    if (!track) continue;
    /* two identical groups in the track: -50% is exactly one loop */
    marquees.push(
      gsap.to(track, { xPercent: -50, duration: 30, ease: 'none', repeat: -1 }),
    );
  }
}

/** §4: marquee speed follows scroll velocity, direction flips with scroll. */
function updateMarquees(): void {
  if (marquees.length === 0) return;
  const velocity = lenis?.velocity ?? 0;
  const boost = Math.min(Math.abs(velocity) / 6, 5);
  for (const tween of marquees) {
    tween.timeScale(gsap.utils.interpolate(tween.timeScale(), 1 + boost, 0.08));
    tween.reversed(velocity < 0);
  }
}

/** §4 [02]: four steps, pinned on ≥1024px. The counter scrubs 01→04 while the
 *  matching text and figure swap in.
 *
 *  One value — the active index — drives all three: the counter prints it, and
 *  the panel it selects is the only opaque one. It flips at the centre of each
 *  swap, which is the instant the outgoing panel reaches 0 opacity, so the
 *  counter can never name a step that is not on screen.
 *
 *  The swap is sequential, not a cross-fade: the outgoing panel finishes
 *  leaving before the incoming one starts arriving, so two steps' text can
 *  never overlap at partial opacity. A short slide keeps the gap between them
 *  from reading as a blink.
 *
 *  Below 1024px — and after teardown — the section is exactly the plain stack
 *  the HTML already is. */
function setupSteps(): void {
  const host = document.querySelector<HTMLElement>('[data-steps]');
  if (!host) return;
  const stage = host.querySelector<HTMLElement>('[data-steps-stage]');
  const counter = host.querySelector<HTMLElement>('[data-steps-counter]');
  const panels = gsap.utils.toArray<HTMLElement>('[data-step]', host);
  if (!stage || !counter || panels.length < 2) return;

  stepCounters.push({ el: counter, initial: counter.textContent ?? '' });

  const last = panels.length - 1;
  /** One swap in step units. The outgoing panel leaves over `HALF` of it. */
  const SWAP = 0.3;
  const HALF = SWAP / 2;
  /** The incoming panel starts this much early, so it is at 0.25 opacity at
   *  the instant the outgoing one reaches 0 — never above ~0.3 while both are
   *  on screen, and never a fully empty frame at the boundary either. */
  const LEAD = HALF * 0.25;
  /** The timeline's own duration: boundary `i` sits at time `i`. */
  const TOTAL = last + HALF - LEAD;

  const mm = gsap.matchMedia();
  mm.add('(min-width: 1024px)', () => {
    /* the component's CSS keys the stacked layout off this attribute */
    host.dataset.pinned = 'true';
    gsap.set(panels, {
      opacity: (index) => (index === 0 ? 1 : 0),
      yPercent: (index) => (index === 0 ? 0 : 3),
    });

    let active = -1;
    /** The single source of truth for counter, text and figure. */
    const show = (index: number): void => {
      const next = Math.min(last, Math.max(0, Math.floor(index)));
      if (next === active) return;
      active = next;
      counter.textContent = String(next + 1).padStart(2, '0');
    };
    show(0);

    const fromProgress = (progress: number): void => show(progress * TOTAL);

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: host,
        start: 'top top',
        end: () => `+=${window.innerHeight * last}`,
        pin: stage,
        scrub: true,
        invalidateOnRefresh: true,
        onUpdate: (self) => fromProgress(self.progress),
        onRefresh: (self) => fromProgress(self.progress),
      },
    });

    /* boundary i sits at time i: out over [i-HALF, i], in over [i-LEAD, i-LEAD+HALF] */
    for (let i = 1; i <= last; i += 1) {
      tl.to(
        panels[i - 1],
        { opacity: 0, yPercent: -3, duration: HALF, ease: 'none' },
        i - HALF,
      ).fromTo(
        panels[i],
        { opacity: 0, yPercent: 3 },
        { opacity: 1, yPercent: 0, duration: HALF, ease: 'none', immediateRender: false },
        i - LEAD,
      );
    }

    return () => {
      delete host.dataset.pinned;
      active = -1;
      show(0);
    };
  });
}

/* ------------------------------------------------------------------ Lenis */

function startLenis(): void {
  lenis = new Lenis({ autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
  raf = (time: number) => {
    lenis?.raf(time * 1000);
    updateMarquees();
  };
  gsap.ticker.add(raf);
  /* the ticker drives scrolling now, so never let it try to catch up */
  gsap.ticker.lagSmoothing(0);
}

function stopLenis(): void {
  if (raf) gsap.ticker.remove(raf);
  raf = null;
  lenis?.destroy();
  lenis = null;
}

/* ------------------------------------------------------------- start / stop */

function start(): void {
  if (context) return;
  root.classList.add('motion');
  startLenis();

  context = gsap.context(() => {
    setupReveals();
    setupScrubFills();
    setupCounters();
    setupMarquees();
    setupSteps();
  });

  ScrollTrigger.refresh();
}

function stop(): void {
  /* the class comes off first so the CSS start states stop applying, then GSAP
     clears its inline styles — leaving the page exactly as it is with JS off */
  root.classList.remove('motion');

  for (const split of splits) split.revert();
  splits.length = 0;

  marquees.length = 0;

  for (const { el, to } of counters) el.textContent = to;
  counters.length = 0;

  for (const { el, initial } of stepCounters) el.textContent = initial;
  stepCounters.length = 0;

  context?.revert();
  context = null;

  stopLenis();
  ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
}

/* The menu sheet stops the smooth scroll so the sheet itself can scroll. */
window.addEventListener('va:menu', (event) => {
  if (!lenis) return;
  const open = (event as CustomEvent<{ open?: boolean }>).detail?.open;
  if (open) lenis.stop();
  else lenis.start();
});

function onPreferenceChange(): void {
  if (reduceQuery.matches) stop();
  else start();
}

reduceQuery.addEventListener('change', onPreferenceChange);

if (reduceQuery.matches) {
  /* nothing to do: the HTML already holds every final value */
  root.classList.remove('motion');
} else {
  /* SplitText measures lines, so wait for the self-hosted faces: splitting
     before `font-display: swap` lands would re-split on the swap and leave
     every tween aimed at detached nodes. */
  void document.fonts.ready.then(() => {
    if (!reduceQuery.matches) start();
  });
}
