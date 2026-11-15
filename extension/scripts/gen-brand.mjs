// Syncs the extension's name/description/icons from brand.config.json.
// No image libraries needed: icons are drawn as a simple pixel-font badge
// using the product's initials (e.g. "Orbit PixieBrix" -> "OP") and PNG-encoded by hand.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const brand = JSON.parse(readFileSync(path.join(root, 'brand.config.json'), 'utf8'));

const initials = brand.productName
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((w) => w[0]?.toUpperCase() ?? '')
  .join('') || 'OR';

// ---------------------------------------------------------------- 1. manifest.json
const manifestPath = path.join(root, 'public', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.name = brand.productName;
manifest.description = `${brand.productName} - AI assistant side panel and in-page widgets for operations teams.`;
manifest.action = manifest.action ?? {};
manifest.action.default_title = `Open ${brand.productName}`;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// ---------------------------------------------------------------- 1b. sidepanel.html <title>
for (const file of ['sidepanel.html', 'offscreen.html']) {
  const htmlPath = path.join(root, file);
  const html = readFileSync(htmlPath, 'utf8');
  const label = file === 'offscreen.html' ? `${brand.productName} OCR engine` : brand.productName;
  writeFileSync(htmlPath, html.replace(/<title>.*?<\/title>/, `<title>${label}</title>`));
}

// ---------------------------------------------------------------- 2. pixel-font badge icons
// 5x7 bitmap font, '1' = lit pixel, one row of 5 bits per line.
const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10101', '10011', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};
const GLYPH_W = 5;
const GLYPH_H = 7;
const GAP = 1;

function drawBitmap(text) {
  const letters = [...text].map((c) => FONT[c] ?? FONT['0'].map(() => '00000'));
  const w = letters.length * GLYPH_W + (letters.length - 1) * GAP;
  const bits = Array.from({ length: GLYPH_H }, () => new Array(w).fill(0));
  letters.forEach((rows, li) => {
    rows.forEach((row, ry) => {
      [...row].forEach((bit, rx) => {
        if (bit === '1') bits[ry][li * (GLYPH_W + GAP) + rx] = 1;
      });
    });
  });
  return { bits, w, h: GLYPH_H };
}

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function hexToRgb(hex) {
  const m = hex.replace('#', '');
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

function renderPng(size, text, bgHex) {
  const { bits, w: bw, h: bh } = drawBitmap(text);
  const scale = Math.max(1, Math.floor((size * 0.72) / Math.max(bw, bh * (bw / bh))));
  const drawW = bw * scale;
  const drawH = bh * scale;
  const offX = Math.round((size - drawW) / 2);
  const offY = Math.round((size - drawH) / 2);
  const [br, bgc, bb] = hexToRgb(bgHex);

  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      const gx = x - offX;
      const gy = y - offY;
      let lit = false;
      if (gx >= 0 && gy >= 0 && gx < drawW && gy < drawH) {
        lit = bits[Math.floor(gy / scale)][Math.floor(gx / scale)] === 1;
      }
      if (lit) {
        raw[px] = 255; raw[px + 1] = 255; raw[px + 2] = 255; raw[px + 3] = 255;
      } else {
        raw[px] = br; raw[px + 1] = bgc; raw[px + 2] = bb; raw[px + 3] = 255;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// public/logo.svg (if present) is used directly by the side panel's Logo component - browsers
// render SVG natively there, no build step needed. But Chrome's toolbar/extensions-page icons
// MUST be raster PNG (Chrome does not accept SVG for manifest icons), so a custom logo.svg can't
// drive those automatically here without an image-rasterization dependency this project doesn't
// have. If logo.svg exists, leave the icon PNGs alone - whoever added the logo is expected to
// also drop matching icon16/32/48/128.png into public/icons/ (or ask for help generating them).
const hasCustomLogo = existsSync(path.join(root, 'public', 'logo.svg'));
const iconsDir = path.join(root, 'public', 'icons');
if (hasCustomLogo) {
  console.log(
    `[gen-brand] "${brand.productName}" -> custom public/logo.svg found, side panel will use it. ` +
      'Toolbar icons (public/icons/*.png) left as-is - Chrome needs real PNGs there, not SVG; ' +
      'replace them manually if you want the logo there too. Manifest synced.',
  );
} else {
  for (const size of [16, 32, 48, 128]) {
    writeFileSync(path.join(iconsDir, `icon${size}.png`), renderPng(size, initials, brand.themeColor));
  }
  console.log(`[gen-brand] "${brand.productName}" -> icons badge "${initials}", manifest synced.`);
}
