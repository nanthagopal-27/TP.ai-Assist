// Chrome's MV3 service worker registration can fail with "An unknown error occurred when
// fetching the script" when the service worker file has a //# sourceMappingURL=... comment, on
// some Chrome versions. background.js IS the service worker (see manifest.json), so strip just
// that one line here - the .map file is left in place and still works fine for content.js,
// sidepanel.js and offscreen.js, none of which register as a service worker.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const file = path.join(root, 'dist', 'background.js');
const js = readFileSync(file, 'utf8');
const stripped = js.replace(/\n?\/\/# sourceMappingURL=[^\n]*/, '');
if (stripped !== js) {
  writeFileSync(file, stripped);
  console.log('[fix-sw-sourcemap] Stripped sourceMappingURL from background.js (service worker).');
}
