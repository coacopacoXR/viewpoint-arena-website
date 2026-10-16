/**
 * robots.txt (task 06 §7). An endpoint rather than a file in public/ so the
 * Sitemap line carries the same absolute URL the sitemap integration emits,
 * including any `SITE_BASE` the build was given.
 */
import type { APIRoute } from 'astro';
import { withBase } from '../lib/links';

export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL(withBase('/sitemap-index.xml'), site);
  const body = ['User-agent: *', 'Allow: /', '', `Sitemap: ${sitemap}`, ''].join('\n');
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
