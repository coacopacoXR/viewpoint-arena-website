/**
 * Asset registry (`.qwen-tasks/ASSETS.md`).
 *
 * Every shipped capture is described here once: which webp widths exist, the
 * intrinsic pixel size of the raw capture (so the frame's aspect ratio is exact
 * and nothing shifts on load, DESIGN.md §7), and alt text that says only what is
 * visible in the frame.
 *
 * Captions are copy, so they live here verbatim rather than being composed:
 * ASSETS.md's caption column for the Docker captures, CONTENT.md for FIG. 00.
 * An asset with no caption copy gets no caption.
 */
import { withBase } from './links';

/** Webp widths produced by `scripts/capture/optimise.mjs` (never upscaled). */
export type StillWidth = 640 | 1280 | 1920;

export interface Still {
  kind: 'still';
  /** Widths that actually exist on disk for this asset. */
  widths: readonly StillWidth[];
  /** Intrinsic px of the raw capture — aspect ratio only, never upscaled. */
  width: number;
  height: number;
  alt: string;
  caption?: string;
}

export interface Clip {
  kind: 'video';
  /** mp4 (H.264, no audio) under `public/assets/`. */
  file: string;
  /** Poster webp widths that exist. */
  posterWidths: readonly (640 | 1280)[];
  width: number;
  height: number;
  alt: string;
  caption?: string;
}

export type Asset = Still | Clip;

/** ASSETS.md caption column, verbatim, for the captures from the 0.1.0 install. */
const DOCKER_CAPTION =
  'Real Whisper + Ollama output on the 0.1.0 install; the voice is text-to-speech reading a script.';
const BOARDROOM_CAPTION = "Two browsers on one machine; Chromium's built-in test camera.";

const SHOT_WIDTHS = [640, 1280, 1920] as const;
/** 3200×2000 captures, described at half scale: the ratio is what matters. */
const SHOT_BOX = { width: 1600, height: 1000 } as const;

export const ASSETS = {
  'room-empty': {
    kind: 'still',
    widths: SHOT_WIDTHS,
    ...SHOT_BOX,
    alt: 'A fresh review room named Bracket review with the bundled Synth assembly loaded and edit mode finished: the top bar, Model Tree, session sync and the capture panel around an empty meeting.',
  },
  pins: {
    kind: 'still',
    widths: SHOT_WIDTHS,
    ...SHOT_BOX,
    alt: 'A comment pinned to a part of the Synth assembly: the pin marker on the part in 3D, and the comment listed in the Comments panel with the part it is attached to.',
  },
  'two-people-knock': {
    kind: 'still',
    widths: SHOT_WIDTHS,
    ...SHOT_BOX,
    alt: "Maria's view while Jon is parked in the waiting room: the Waiting to Join card names Jon with an Admit button.",
  },
  'two-people': {
    kind: 'still',
    widths: SHOT_WIDTHS,
    ...SHOT_BOX,
    alt: "Maria's view with Jon admitted: Jon's avatar and name label in the 3D scene, and both participants live in the Participants panel.",
  },
  'two-people-jon': {
    kind: 'still',
    widths: SHOT_WIDTHS,
    ...SHOT_BOX,
    alt: "The same room from Jon's browser: the Synth assembly, Maria's avatar and name label, and both participants in his Participants panel.",
  },
  'two-people-composite': {
    kind: 'still',
    widths: SHOT_WIDTHS,
    width: 3200,
    height: 1000,
    alt: "Maria's and Jon's windows side by side, unedited: the same room from both browsers at the same moment.",
  },
  split: {
    kind: 'still',
    widths: SHOT_WIDTHS,
    ...SHOT_BOX,
    alt: "Hybrid split screen on Maria's side: her own free view left, exactly what Jon sees right, with the YOU / Jon badge across the seam.",
  },
  follow: {
    kind: 'still',
    widths: SHOT_WIDTHS,
    ...SHOT_BOX,
    alt: "Jon's view while he follows Maria: the Following Maria pill above the canvas and the Free view button that leaves the follow.",
  },
  laser: {
    kind: 'still',
    widths: SHOT_WIDTHS,
    ...SHOT_BOX,
    alt: 'The pointing laser held on part Box_Section_(44) of the 800-part assembly: the laser dot and beam from Maria\'s avatar and the part name label at the hit. A single-part selection draws no visible highlight on a batched imported model, so no glow is in frame.',
  },
  tree: {
    kind: 'still',
    widths: SHOT_WIDTHS,
    ...SHOT_BOX,
    alt: 'The Model Tree open on the 800-part STEP-derived assembly with part Part_00061 selected: every part by the name the STEP file gives it, the selected row highlighted, and the same part selected in the 3D view.',
  },
  'hero-model': {
    kind: 'still',
    widths: SHOT_WIDTHS,
    width: 1200,
    height: 1200,
    alt: "The 800-part STEP-derived assembly with part Part_00120 selected, on the app's light viewport with floor grid and contact shadow. The app draws no visible highlight for a selection on a batched imported model, so the selection is real but not glowing in frame.",
  },
  'meeting-cards': {
    kind: 'still',
    widths: SHOT_WIDTHS,
    ...SHOT_BOX,
    alt: 'The Capture panel of the Bracket review room: three generated insight cards — Aluminium bracket choice, Thermal expansion and Increase clearance — above the Live Transcript block, whose Whisper lines are attributed to Maria, beside the Synth assembly 3D scene.',
    caption: DOCKER_CAPTION,
  },
  /** Element capture of the panel column: 678 px wide, so 640 is its only webp. */
  'meeting-cards-panel': {
    kind: 'still',
    widths: [640],
    width: 678,
    height: 1888,
    alt: 'The right-hand Capture panel column: the generated insight cards above, the live transcript below.',
    caption: DOCKER_CAPTION,
  },
  'card-record': {
    kind: 'still',
    widths: SHOT_WIDTHS,
    ...SHOT_BOX,
    alt: 'The DESIGN DECISION RECORD modal opened from the generated card Aluminium bracket choice: its ID, subject, linked component, description and context, and the priority and status pickers, over the dimmed room.',
    caption: DOCKER_CAPTION,
  },
  tracker: {
    kind: 'still',
    widths: SHOT_WIDTHS,
    ...SHOT_BOX,
    alt: 'The Tracker page listing nine cards left by three capture sessions of the Bracket review — Aluminium bracket choice, Increase clearance and Thermal expansion risk among them.',
    caption: DOCKER_CAPTION,
  },
  boardroom: {
    kind: 'still',
    widths: SHOT_WIDTHS,
    ...SHOT_BOX,
    alt: 'Boardroom call view with Maria (YOU, presenting) and Jon as two LIVE camera tiles running the test camera feed, under the boardroom toolbar.',
    caption: BOARDROOM_CAPTION,
  },
  'big-assembly': {
    kind: 'video',
    file: 'big-assembly.mp4',
    posterWidths: [640, 1280],
    width: 1280,
    height: 800,
    alt: 'The 10 000-part assembly with part Plate_(472) selected, orbiting for six seconds.',
  },
  'boardroom-clip': {
    kind: 'video',
    file: 'boardroom.mp4',
    posterWidths: [640, 1280],
    width: 1280,
    height: 800,
    alt: 'A boardroom call recorded from a third browser admitted to the room: the two LIVE camera tiles, Maria presenting and Jon, play the test camera feed while the recorder\'s own tile shows as YOU with its camera off.',
    caption: BOARDROOM_CAPTION,
  },
} as const satisfies Record<string, Asset>;

export type AssetName = keyof typeof ASSETS;

/**
 * Slots CONTENT.md marks with `{{name}}` that have no capture — ASSETS.md
 * "Skipped". They keep the pending mat, and are named here so a component can
 * hold one without a cast.
 */
export const MISSING_SLOTS = ['variants'] as const;
export type MissingSlot = (typeof MISSING_SLOTS)[number];
/** Any slot CONTENT.md names, captured or not. */
export type SlotName = AssetName | MissingSlot;

const MISSING: ReadonlySet<string> = new Set(MISSING_SLOTS);

/** Mat text for a slot with no file yet. */
export function pendingText(name: string): string {
  return `ASSET PENDING · ${name}`;
}

/** True when the capture exists in `public/assets/`. */
export function hasAsset(name: string): name is AssetName {
  return !MISSING.has(name) && name in ASSETS;
}

export function getAsset(name: AssetName): Asset {
  return ASSETS[name];
}

/* --------------------------------------------------------------- still URLs */

/** `/assets/laser-640.webp 640w, …` for every width that exists. */
export function stillSrcset(name: AssetName): string | undefined {
  const asset = ASSETS[name];
  if (asset.kind !== 'still') return undefined;
  return asset.widths
    .map((w) => `${withBase(`/assets/${name}-${w}.webp`)} ${w}w`)
    .join(', ');
}

/** The largest width that exists — the `<img src>` fallback. */
export function stillSrc(name: AssetName): string {
  const asset = ASSETS[name];
  if (asset.kind !== 'still') throw new Error(`${name} is not a still`);
  const largest = asset.widths[asset.widths.length - 1];
  return withBase(`/assets/${name}-${largest}.webp`);
}

/** Largest poster webp that exists. */
export function posterSrc(name: AssetName): string | undefined {
  const asset = ASSETS[name];
  if (asset.kind !== 'video') return undefined;
  const stem = asset.file.replace(/\.mp4$/, '');
  const largest = asset.posterWidths[asset.posterWidths.length - 1];
  return withBase(`/assets/${stem}-poster-${largest}.webp`);
}

export function videoSrc(name: AssetName): string | undefined {
  const asset = ASSETS[name];
  return asset.kind === 'video' ? withBase(`/assets/${asset.file}`) : undefined;
}

/* -------------------------------------------------------------------- sizes */

/**
 * `sizes` matching the layout, from the column spans the figure sits in
 * (DESIGN.md §3: 12 columns ≥1024px, 8 at 640–1023, full width below 640).
 * The container stops growing at `--max-content`, so the widest breakpoint is
 * given in px instead of vw — otherwise a 1920 viewport asks for 1920w.
 */
export function sizesFor(span: number, spanMd = 8): string {
  /* content box at the 1680px cap: 1680 − 2 × 56px page margin */
  const capped = Math.round((span / 12) * 1568);
  const mdFraction = spanMd / 8;
  return [
    `(min-width: 1680px) ${capped}px`,
    `(min-width: 1024px) ${Math.round((span / 12) * 100)}vw`,
    ...(mdFraction < 1 ? [`(min-width: 640px) ${Math.round(mdFraction * 100)}vw`] : []),
    '100vw',
  ].join(', ');
}

/** `FIG. nn — <caption copy>`, or undefined where ASSETS.md gives no caption. */
export function figureCaption(fig: string, name: AssetName): string | undefined {
  const asset: Asset = ASSETS[name];
  return asset.caption ? `${fig} — ${asset.caption}` : undefined;
}
