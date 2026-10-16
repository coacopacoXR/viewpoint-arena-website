/**
 * hero.ts — the gate in front of the 3D hero (DESIGN.md §5 `HeroModel`).
 *
 * This module never imports three. It decides whether the hero may go 3D and
 * only then pulls `hero3d.ts` in dynamically, which is what keeps the three.js
 * chunk out of the page's default JS (§7) and off a mobile Lighthouse run.
 *
 * All five conditions have to hold: a viewport ≥640px that is `pointer: fine`
 * or ≥768px wide, motion allowed, no `saveData`, WebGL available, and the hero
 * on screen. The check is live — a resize across either width or a change of
 * the OS motion setting is re-evaluated without a reload (§4).
 */

const heroRoot = document.querySelector<HTMLElement>('[data-hero]');

if (heroRoot) {
  /* the helpers below are hoisted declarations and so do not keep this guard's
     narrowing; they get a non-nullable name instead */
  const root: HTMLElement = heroRoot;
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fineQuery = window.matchMedia('(pointer: fine)');

  /** Chrome's `navigator.connection.saveData`; absent elsewhere. */
  function saveData(): boolean {
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    return connection?.saveData === true;
  }

  let webgl: boolean | null = null;
  function hasWebGL(): boolean {
    if (webgl === null) {
      try {
        const probe = document.createElement('canvas');
        webgl = Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
      } catch {
        webgl = false;
      }
    }
    return webgl;
  }

  /**
   * §5 gives the 3D hero to a hover-capable device or a ≥768px viewport; the
   * 640px floor (§3's 8-column breakpoint) is task 06's addition — a
   * phone-sized window never gets the model, whatever its pointer reports.
   */
  const MIN_HERO_WIDTH = 640;

  function eligible(): boolean {
    return (
      window.innerWidth >= MIN_HERO_WIDTH &&
      (fineQuery.matches || window.innerWidth >= 768) &&
      !reduceQuery.matches &&
      !saveData() &&
      hasWebGL()
    );
  }

  let inView = false;
  let started = false;

  /** Idle first (§5), so the import never competes with first paint. */
  function whenIdle(run: () => void): void {
    const idle = (
      window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      }
    ).requestIdleCallback;
    if (idle) idle(run, { timeout: 2000 });
    else window.setTimeout(run, 200);
  }

  function maybeStart(): void {
    if (started) return;
    if (!inView || !eligible()) {
      root.dataset.hero = 'still';
      return;
    }
    started = true;
    root.dataset.hero = 'loading';
    whenIdle(() => {
      void import('./hero3d')
        .then(({ startHero }) => startHero(root))
        .catch(() => {
          /* no module, no WebGL context, no GLB: the still stays */
          started = false;
          root.dataset.hero = 'still';
        });
    });
  }

  const observer = new IntersectionObserver(
    (entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
      if (inView) maybeStart();
    },
    { rootMargin: '128px 0px' },
  );
  observer.observe(root);

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(maybeStart, 200);
  });

  /* motion allowed again after being off: the 3D module tore itself down when
     the setting turned on, so the gate may build it back up (§4) */
  reduceQuery.addEventListener('change', () => {
    if (reduceQuery.matches) return;
    started = false;
    maybeStart();
  });
}

/* a module, not a global script: `nav.ts` has a `root` of its own */
export {};
