import type { InsertPosition, WidgetMode } from '../shared/types';
import { attachStyles, h, HOST_ATTR } from './dom';
import { PICKER_CSS } from './styles';

/** "Click anywhere on the page to place it" / drag-to-move - highlights the element under the
 *  cursor and shows where the widget will be inserted (before / inside / after). Esc cancels. */

export interface PickResult {
  el: Element;
  position: InsertPosition;
  x: number;
  y: number;
}

export interface PickerOptions {
  mode: WidgetMode;
  hint: string;
  onPick: (r: PickResult) => void;
  onCancel: () => void;
}

const NO_CHILDREN = new Set([
  'IMG', 'INPUT', 'BR', 'HR', 'TEXTAREA', 'SELECT', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED', 'svg',
]);

/** Climb out of tiny inline elements (span, b, a...) to the surrounding block. */
function toBlock(el: Element): Element {
  let cur = el;
  for (let i = 0; i < 4 && cur.parentElement; i++) {
    const d = getComputedStyle(cur).display;
    if (d.startsWith('inline') && !NO_CHILDREN.has(cur.tagName)) cur = cur.parentElement;
    else break;
  }
  return cur === document.documentElement ? document.body : cur;
}

interface Placement { position: InsertPosition; horizontal: boolean }

/** Purely geometric (no CSS layout inspection - Lightning Web Components and other shadow-DOM
 *  widgets hide their real internal layout behind a host element whose own computed `display`
 *  tells you nothing useful): whichever pair of edges (left/right vs top/bottom) the cursor is
 *  proportionally closer to decides whether this reads as "beside it" or "above/below it". */
function positionFor(el: Element, x: number, y: number): Placement {
  const r = el.getBoundingClientRect();
  if (el === document.body) {
    const f = (y - r.top) / Math.max(r.height, 1);
    return { position: f < 0.5 ? 'afterbegin' : 'beforeend', horizontal: false };
  }
  const fx = (x - r.left) / Math.max(r.width, 1);
  const fy = (y - r.top) / Math.max(r.height, 1);
  const edgeX = Math.min(fx, 1 - fx);
  const edgeY = Math.min(fy, 1 - fy);
  const nearSide = edgeX < edgeY; // closer to a left/right edge than to a top/bottom one

  if (NO_CHILDREN.has(el.tagName)) {
    return nearSide
      ? { position: fx < 0.5 ? 'beforebegin' : 'afterend', horizontal: true }
      : { position: fy < 0.5 ? 'beforebegin' : 'afterend', horizontal: false };
  }
  if (nearSide) return { position: fx < 0.5 ? 'beforebegin' : 'afterend', horizontal: true };
  if (fy < 0.33) return { position: 'beforebegin', horizontal: false };
  if (fy > 0.66) return { position: 'afterend', horizontal: false };
  return { position: 'afterbegin', horizontal: false };
}

export interface PickerOverlay {
  /** Redraw the highlight/insertion-line/label for the cursor at (x, y). */
  update(x: number, y: number): void;
  /** Resolve what would be picked at (x, y) right now, without tearing the overlay down. */
  resultAt(x: number, y: number): PickResult | null;
  destroy(): void;
}

/** The shared highlight-box + insertion-line + "position · tag" label visualization, usable
 *  both from a click-to-place flow and a drag-to-move gesture. */
export function createOverlay(mode: WidgetMode, hint: string): PickerOverlay {
  const host = h('div', { [HOST_ATTR]: 'picker' });
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const root = host.attachShadow({ mode: 'closed' });
  attachStyles(root, PICKER_CSS);
  const box = h('div', { class: 'box' });
  const ins = h('div', { class: 'ins' });
  const lbl = h('div', { class: 'lbl' });
  root.append(box, ins, lbl, h('div', { class: 'banner' }, hint));
  document.documentElement.appendChild(host);

  // Our own transient UI - this picker overlay, the on-page toolbar, the area-select box, the
  // quick-launch button - is never a valid drop target. An already-PLACED widget is NOT in this
  // set: dropping next to (or on) one should work exactly like dropping next to any other page
  // element, so components can be placed close together.
  const TRANSIENT_HOSTS = new Set(['picker', 'toolbar', 'area-select', 'quick', 'drag-ghost', 'action-dialog']);

  /** A point over a placed widget's rendered content resolves to something *inside* that
   *  widget's own (open) shadow tree - redirect it to the widget's host element itself (a normal
   *  light-DOM node `document.querySelector` can actually find), so hovering/dropping over or
   *  right beside an existing widget targets the widget as a whole, the same as any other
   *  element on the page. */
  const resolveShadowHost = (el: Element): Element => {
    const root = el.getRootNode();
    if (root instanceof ShadowRoot && root.host.hasAttribute(HOST_ATTR)) return root.host;
    return el;
  };

  const targetAt = (cx: number, cy: number): Element | null => {
    const raw = document.elementFromPoint(cx, cy);
    if (!raw) return null;
    const el = resolveShadowHost(raw);
    const hostEl = el.closest(`[${HOST_ATTR}]`);
    if (hostEl && TRANSIENT_HOSTS.has(hostEl.getAttribute(HOST_ATTR) ?? '')) return null;
    return toBlock(el);
  };

  /** positionFor's own "inside" (beforebegin/beforeend) outcome assumes `el` can actually host a
   *  new light-DOM child that renders - not true of an already-placed widget's host, which has
   *  an open shadow root with no `<slot>`, so a light-DOM child there would be inserted but never
   *  shown. Forces the nearer sibling edge instead whenever `el` is one of those. */
  const placementFor = (el: Element, x: number, y: number): Placement => {
    const p = positionFor(el, x, y);
    if ((p.position === 'afterbegin' || p.position === 'beforeend') && el.hasAttribute(HOST_ATTR)) {
      const r = el.getBoundingClientRect();
      return { position: y - r.top < r.bottom - y ? 'beforebegin' : 'afterend', horizontal: false };
    }
    return p;
  };

  /** Resolves the hovered element and its placement. Always resolves to *something* - falling
   *  back to `document.body` whenever there's genuinely nothing usable under the cursor (a gap,
   *  an edge, a momentary blip from elementFromPoint) - so the highlight never just vanishes
   *  mid-drag the way it used to. Never refuses a spot for being "unsafe": mount() decides how to
   *  place it there safely instead of the picker deciding whether to allow it at all. */
  const resolve = (x: number, y: number): { el: Element; placement: Placement } => {
    const el = targetAt(x, y);
    if (!el) return { el: document.body, placement: positionFor(document.body, x, y) };
    return { el, placement: placementFor(el, x, y) };
  };

  return {
    update(x, y) {
      if (mode === 'float') {
        lbl.textContent = 'float here';
        lbl.style.cssText = `display:block;left:${x + 14}px;top:${y + 14}px`;
        box.style.display = ins.style.display = 'none';
        return;
      }
      const { el, placement: { position: pos, horizontal } } = resolve(x, y);
      const r = el.getBoundingClientRect();
      box.style.cssText = `display:block;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
      if (horizontal) {
        const lineLeft = pos === 'beforebegin' ? r.left - 2 : pos === 'afterend' ? r.right - 1 : r.left + 6;
        const inset = pos === 'afterbegin' ? 10 : 0;
        ins.style.cssText = `display:block;left:${lineLeft}px;top:${r.top + inset}px;width:3px;height:${Math.max(r.height - inset * 2, 24)}px`;
      } else {
        const lineTop = pos === 'beforebegin' ? r.top - 2 : pos === 'afterend' ? r.bottom - 1 : r.top + 6;
        const inset = pos === 'afterbegin' ? 10 : 0;
        ins.style.cssText = `display:block;left:${r.left + inset}px;top:${lineTop}px;width:${Math.max(r.width - inset * 2, 24)}px;height:3px`;
      }
      lbl.textContent = `${pos} · ${el.tagName.toLowerCase()}`;
      lbl.style.cssText = `display:block;left:${Math.max(r.left, 0)}px;top:${Math.max(r.top - 24, 0)}px`;
    },
    resultAt(x, y) {
      if (mode === 'float') return { el: document.body, position: 'afterbegin', x, y };
      const { el, placement } = resolve(x, y);
      return { el, position: placement.position, x, y };
    },
    destroy() {
      host.remove();
    },
  };
}

export function startPicker(opts: PickerOptions): () => void {
  const overlay = createOverlay(opts.mode, opts.hint);
  let done = false;
  let raf = 0;
  let x = 0;
  let y = 0;

  const draw = () => {
    raf = 0;
    overlay.update(x, y);
  };

  const cleanup = () => {
    done = true;
    cancelAnimationFrame(raf);
    for (const t of EVENTS) window.removeEventListener(t, block, true);
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKey, true);
    overlay.destroy();
  };

  const block = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const onMove = (e: MouseEvent) => {
    x = e.clientX;
    y = e.clientY;
    if (!raf) raf = requestAnimationFrame(draw);
  };
  const onClick = (e: MouseEvent) => {
    block(e);
    if (done) return;
    const result = overlay.resultAt(e.clientX, e.clientY);
    if (!result) return;
    cleanup();
    opts.onPick(result);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      block(e);
      cleanup();
      opts.onCancel();
    }
  };

  const EVENTS = ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'dblclick', 'contextmenu'];
  for (const t of EVENTS) window.addEventListener(t, block, true);
  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onKey, true);

  return () => {
    if (done) return;
    cleanup();
    opts.onCancel();
  };
}
