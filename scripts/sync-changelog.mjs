/**
 * sync-changelog.mjs — copies the app's CHANGELOG.md into this repo so a CI
 * build without the sibling checkout still has something to render.
 *
 * The source path comes from `APP_REPO`, defaulting to the sibling checkout
 * (`../../../viewpoint-arena-public` from the repo root). When the source is
 * absent the script is a no-op: `src/content/CHANGELOG.md` is committed, so the
 * committed copy is what gets built. Wired to `prebuild`.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const appRepo = process.env.APP_REPO ?? 'C:/Users/coaco/viewpoint-arena-public';
const source = join(appRepo, 'CHANGELOG.md');
const target = join(root, 'src', 'content', 'CHANGELOG.md');

if (!existsSync(source)) {
  console.log(`[sync-changelog] no CHANGELOG.md at ${source}; keeping the committed copy.`);
  process.exit(0);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`[sync-changelog] ${source} -> ${target}`);
