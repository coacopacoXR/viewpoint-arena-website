/**
 * Site-wide constants. Every string here is copied verbatim from
 * `.qwen-tasks/CONTENT.md` (Global / NAV / FOOTER).
 */
export const SITE = {
  name: 'Viewpoint Arena',
  /** Product status label, shown wherever the product is introduced. */
  version: '0.1.0 preview',
  license: 'Apache-2.0',
  repo: 'https://github.com/coacopacoXR/viewpoint-arena',
  repoLabel: 'github.com/coacopacoXR/viewpoint-arena',
  /** Default git ref used by provenance tags. */
  ref: 'main',
} as const;

/** localStorage key for the theme override (always inside try/catch). */
export const THEME_KEY = 'va-theme';

/** META — site-wide defaults */
export const META = {
  title: 'Viewpoint Arena — review the model, not a screen share',
  description:
    "A self-hosted room where a small team reviews a 3D model together. Point at parts, follow a view, get risks and actions from the meeting. Runs on one machine.",
} as const;

/** META — per-page titles and descriptions, verbatim from CONTENT.md. */
export const PAGE_META = {
  install: {
    title: 'Install Viewpoint Arena',
    description: 'One script, Docker, about 15 minutes. Windows 11 with WSL2 or Linux.',
  },
  howItWorks: {
    title: 'How Viewpoint Arena works',
    description:
      'The browser, the room server, the api, convert-service and the capture service, and what crosses the network.',
  },
  changelog: {
    title: 'Changelog — Viewpoint Arena',
    description: 'What changed in each release.',
  },
} as const;

/** NAV */
export const NAV_LINKS = [
  { label: 'About', href: '/#about' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Install', href: '/install' },
  { label: 'Changelog', href: '/changelog' },
] as const;

/** FOOTER — two columns */
export interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: 'Product',
    links: [
      { label: 'How it works', href: '/how-it-works' },
      { label: 'Install', href: '/install' },
      { label: 'Changelog', href: '/changelog' },
    ],
  },
  {
    heading: 'Source',
    links: [
      { label: 'GitHub ↗', href: SITE.repo, external: true },
      {
        label: 'Report a vulnerability ↗',
        href: `${SITE.repo}/blob/main/SECURITY.md`,
        external: true,
      },
      {
        label: 'Contributing ↗',
        href: `${SITE.repo}/blob/main/CONTRIBUTING.md`,
        external: true,
      },
    ],
  },
];

/** FOOTER */
export const FOOTER_LINE = `${SITE.version} · ${SITE.license} · Self-hosted, on purpose.`;
export const FOOTER_MONO = 'THIS SITE SENDS NOTHING EITHER: NO ANALYTICS, NO COOKIES.';
export const FOOTER_WORDMARK = 'VIEWPOINT ARENA';
