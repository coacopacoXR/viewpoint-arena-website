/**
 * Asset slots (CONTENT.md `{{name}}` markers).
 *
 * Real captures land in `public/assets/` in task 04; until then every slot
 * renders the `Figure` pending mat. The intrinsic sizes are fixed now, from
 * task 02, so nothing shifts when the files arrive (DESIGN.md §7):
 * screenshots 16:10, the hero model 1:1, the big-assembly video 16:9.
 */

/** 16:10 screenshots. */
export const SHOT = { width: 1600, height: 1000 } as const;

/** 1:1 hero model still. */
export const HERO_MODEL = { width: 1200, height: 1200 } as const;

/** 16:9 video slot. */
export const BIG_ASSEMBLY = { width: 1600, height: 900 } as const;

/** Captures that need the full Docker stack (CONTENT.md, DESIGN.md §8). */
const NEEDS_DOCKER = new Set(['meeting-cards', 'boardroom', 'tracker']);

/** Mat text for a slot with no file yet. */
export function pendingText(name: string): string {
  return NEEDS_DOCKER.has(name)
    ? `ASSET PENDING · ${name} · NEEDS DOCKER`
    : `ASSET PENDING · ${name}`;
}
