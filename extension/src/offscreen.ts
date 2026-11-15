/**
 * Offscreen document: runs the offline OCR engine (Tesseract, WebAssembly) in a web worker.
 * Web pages cannot start extension workers, so the service worker asks this hidden page to do the OCR.
 * Everything (worker, wasm core, English language data) is bundled in dist/ocr - no internet needed.
 */
import { createWorker, type Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  workerPromise ??= createWorker('eng', 1, {
    workerPath: chrome.runtime.getURL('ocr/worker.min.js'),
    corePath: chrome.runtime.getURL('ocr'),
    langPath: chrome.runtime.getURL('ocr/lang'),
    workerBlobURL: false,
    gzip: true,
    cacheMethod: 'none',
  }).catch((err) => {
    workerPromise = null; // allow a retry
    throw err;
  });
  return workerPromise;
}

chrome.runtime.onMessage.addListener((msg: { type?: string; image?: string }, _sender, sendResponse) => {
  if (msg?.type !== 'ORBIT_OFFSCREEN_OCR' || !msg.image) return false;
  (async () => {
    try {
      const worker = await getWorker();
      const { data } = await worker.recognize(msg.image!);
      sendResponse({ ok: true, text: (data.text ?? '').trim(), confidence: Math.round(data.confidence ?? 0) });
    } catch (err) {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();
  return true;
});
