// Copies the offline OCR engine (worker, wasm core, English language data) from node_modules into dist/ocr.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist/ocr');
mkdirSync(resolve(out, 'lang'), { recursive: true });

const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
];
for (const [from, to] of files) {
  const src = resolve(root, from);
  if (!existsSync(src)) {
    console.error(`OCR file missing: ${from}\nRun "npm install" first.`);
    process.exit(1);
  }
  cpSync(src, resolve(out, to));
}
console.log('OCR engine copied to dist/ocr');
