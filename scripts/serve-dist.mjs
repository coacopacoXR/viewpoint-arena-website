/**
 * serve-dist.mjs — minimal static server for the built site, used by the
 * layout test's webServer (and by the task screenshot scripts).
 *
 * `astro preview` only allows one instance per project, which collides with a
 * preview the operator may already have open on another port; a static build
 * needs nothing more than this to be measured the way a visitor gets it.
 *
 * Usage: node scripts/serve-dist.mjs [port]   (PORT env also honoured)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve('dist');
const port = Number(process.argv[2] ?? process.env.PORT ?? 4321);
/* honour the same SITE_BASE the build used, so a sub-path deploy is testable */
const rawBase = process.env.SITE_BASE ?? '/';
const base = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
};

/** `/install` and `/install/` both mean `/install/index.html`. */
async function read(pathname) {
  const candidates = [pathname, `${pathname}/index.html`, `${pathname}.html`];
  for (const candidate of candidates) {
    const file = normalize(join(root, candidate));
    if (!file.startsWith(root)) continue;
    try {
      return await readFile(file);
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    let pathname = decodeURIComponent(url.pathname);
    if (base && pathname.startsWith(base)) pathname = pathname.slice(base.length) || '/';
    const body = await read(pathname);
    if (body === null) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      res.end(await readFile(join(root, '404.html')));
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[extname(pathname).toLowerCase()] ?? 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500).end(String(err));
  }
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on ${port}`));
