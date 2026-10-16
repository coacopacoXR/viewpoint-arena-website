import { SITE } from './site';

/**
 * Base-path helpers.
 *
 * The site can be deployed at a sub-path (GitHub Pages project sites) by setting
 * `SITE_BASE` at build time. Every internal link and every asset URL in this
 * project goes through `withBase()` so that one build works at `/` and at
 * `/viewpoint-arena-website/` without editing a single href.
 */
const BASE_URL: string = import.meta.env.BASE_URL || '/';
const prefix = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL;

/** True for URLs that must never be prefixed. */
function isAbsoluteOrFragment(url: string): boolean {
  return (
    url === '' ||
    url.startsWith('#') ||
    url.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(url)
  );
}

/** Prefix an internal path with the configured base. */
export function withBase(path: string): string {
  if (isAbsoluteOrFragment(path)) return path;
  const normalised = path.startsWith('/') ? path : `/${path}`;
  return `${prefix}${normalised}`;
}

/** An internal path with the current page's trailing-slash convention. */
export function pageUrl(path: string): string {
  return withBase(path);
}

/**
 * Provenance: the URL of a file in the app repository (DESIGN.md §0).
 * Pass a short `sha` to cite the exact revision the claim was measured on.
 */
export function githubBlobUrl(path: string, sha?: string): string {
  const ref = sha?.trim() ? sha.trim() : SITE.ref;
  const clean = path.replace(/^\/+/, '');
  return clean ? `${SITE.repo}/blob/${ref}/${clean}` : SITE.repo;
}
