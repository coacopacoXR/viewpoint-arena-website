/**
 * serve-dist.mjs — minimal static server for the built site, used by the
 * layout test's webServer (and by the task screenshot scripts).
 *
 * `astro preview` only allows one instance per project, which collides with a
 * preview the operator may already have open on another port; a static build
 * needs nothing more than this to be measured the way a visitor gets it.
 * Text responses are gzipped, because every real static host (GitHub Pages,
 * Vercel) is, and a Lighthouse run over raw bytes would measure the server
 * rather than the site.
 *
 * Default port 4322: 4321 belongs to `astro dev`, which the operator runs.
 *
 * Usage: node scripts/serve-dist.mjs [port]   (PORT env also honoured)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = resolve('dist');
const port = Number(process.argv[2] ?? process.env.PORT ?? 4322);
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
  '.glb': 'model/gltf-binary',
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

/** Text types a static host compresses; webp, woff2 and mp4 already are. */
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg']);

function send(res, req, status, body, type, ext) {
  const headers = {
    'content-type': type,
    'cache-control': 'no-store',
    vary: 'Accept-Encoding',
  };
  let out = body;
  if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
    out = gzipSync(body, { level: 6 });
    headers['content-encoding'] = 'gzip';
  }
  res.writeHead(status, headers);
  res.end(out);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    let pathname = decodeURIComponent(url.pathname);
    if (base && pathname.startsWith(base)) pathname = pathname.slice(base.length) || '/';
    const body = await read(pathname);
    if (body === null) {
      send(res, req, 404, await readFile(join(root, '404.html')), 'text/html; charset=utf-8', '.html');
      return;
    }
    const ext = extname(pathname).toLowerCase() || '.html';
    send(res, req, 200, body, TYPES[ext] ?? 'text/html; charset=utf-8', ext);
  } catch (err) {
    res.writeHead(500).end(String(err));
  }
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on ${port}`));
