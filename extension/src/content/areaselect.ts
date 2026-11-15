/**
 * "Drag to select an area" tool used by the OCR widget.
 * Shows a crosshair overlay, lets the user drag a rectangle, then asks the service worker for a screenshot
 * of the tab and crops it. Also reads the page's own text inside that rectangle (useful when the area is
 * normal HTML text rather than a picture).
 */
import { attachStyles, h, HOST_ATTR } from './dom';
import { rpc } from './messaging';

export interface AreaResult {
  /** the crop as shown to the user */
  image: string;
  /** a slightly enlarged copy with a white margin - what the OCR engine reads */
  ocrImage: string;
  /** text nodes of the page that lie inside the rectangle */
  domText: string;
  width: number;
  height: number;
}

const CSS = `
.ov{position:fixed;inset:0;cursor:crosshair;background:rgba(0,0,0,.18);touch-action:none}
.sel{position:fixed;display:none;border:2px solid #fff;outline:2px solid #212121;border-radius:2px;box-shadow:0 0 0 100vmax rgba(0,0,0,.38);pointer-events:none}
.hint{position:fixed;top:14px;left:50%;transform:translateX(-50%);background:#212121;color:#fff;font:600 12.5px/1 "Segoe UI",Arial,sans-serif;
  padding:10px 16px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.35);pointer-events:none;white-space:nowrap}
.size{position:fixed;display:none;background:#212121;color:#fff;font:600 11px/1 "Segoe UI",Arial,sans-serif;padding:3px 6px;border-radius:4px;pointer-events:none}
`;

interface Rect { x: number; y: number; w: number; h: number }

function domTextIn(r: Rect): string {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement;
      if (!p || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(p.tagName) || p.closest(`[${HOST_ATTR}]`)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const parts: string[] = [];
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    range.selectNodeContents(n);
    const b = range.getBoundingClientRect();
    if (!b.width && !b.height) continue;
    if (b.left < r.x + r.w && b.right > r.x && b.top < r.y + r.h && b.bottom > r.y) parts.push(n.nodeValue!.trim());
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

const nextFrames = () => new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(res, 90))));

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Could not read the screenshot.'));
    img.src = src;
  });
}

async function crop(r: Rect): Promise<Pick<AreaResult, 'image' | 'ocrImage'>> {
  const shot = await rpc<string>({ type: 'ORBIT_CAPTURE_TAB' });
  const img = await loadImage(shot);
  const scale = img.naturalWidth / window.innerWidth; // robust against browser zoom / HiDPI
  const sw = Math.max(1, Math.round(r.w * scale));
  const sh = Math.max(1, Math.round(r.h * scale));

  const c1 = document.createElement('canvas');
  c1.width = sw;
  c1.height = sh;
  c1.getContext('2d')!.drawImage(img, r.x * scale, r.y * scale, sw, sh, 0, 0, sw, sh);

  // enlarge small crops (OCR reads small text badly) and add a white margin
  const f = Math.min(3, Math.max(1, 1100 / Math.max(sw, sh)));
  const pad = 24;
  const c2 = document.createElement('canvas');
  c2.width = Math.round(sw * f) + pad * 2;
  c2.height = Math.round(sh * f) + pad * 2;
  const g = c2.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c2.width, c2.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(c1, pad, pad, Math.round(sw * f), Math.round(sh * f));
  return { image: c1.toDataURL('image/png'), ocrImage: c2.toDataURL('image/png') };
}

/** Resolves with the selected area, or null when the user cancels (Esc / tiny drag). */
export function selectArea(): Promise<AreaResult | null> {
  return new Promise((resolve, reject) => {
    const host = h('div', { [HOST_ATTR]: 'area-select' });
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    attachStyles(root, CSS);
    const ov = h('div', { class: 'ov' });
    const sel = h('div', { class: 'sel' });
    const size = h('div', { class: 'size' });
    const hint = h('div', { class: 'hint' }, 'Drag to select the area to read · Esc to cancel');
    root.append(ov, sel, size, hint);
    document.documentElement.appendChild(host);

    let sx = 0, sy = 0, dragging = false;
    const rectOf = (e: PointerEvent): Rect => {
      const x = Math.max(0, Math.min(sx, e.clientX));
      const y = Math.max(0, Math.min(sy, e.clientY));
      return { x, y, w: Math.min(innerWidth, Math.max(sx, e.clientX)) - x, h: Math.min(innerHeight, Math.max(sy, e.clientY)) - y };
    };
    const cleanup = () => {
      window.removeEventListener('keydown', onKey, true);
      host.remove();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      cleanup();
      resolve(null);
    };
    window.addEventListener('keydown', onKey, true);

    ov.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      ov.setPointerCapture(e.pointerId);
      Object.assign(sel.style, { display: 'block', left: `${sx}px`, top: `${sy}px`, width: '0px', height: '0px' });
      hint.style.display = 'none';
    });
    ov.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const r = rectOf(e);
      Object.assign(sel.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      size.textContent = `${Math.round(r.w)} × ${Math.round(r.h)}`;
      Object.assign(size.style, { display: 'block', left: `${r.x}px`, top: `${Math.max(0, r.y - 22)}px` });
    });
    ov.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      const r = rectOf(e);
      if (r.w < 8 || r.h < 8) {
        cleanup();
        resolve(null);
        return;
      }
      // remove the overlay BEFORE the screenshot so it is not part of the picture
      cleanup();
      void (async () => {
        try {
          await nextFrames();
          const imgs = await crop(r);
          resolve({ ...imgs, domText: domTextIn(r), width: Math.round(r.w), height: Math.round(r.h) });
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      })();
    });
  });
}
