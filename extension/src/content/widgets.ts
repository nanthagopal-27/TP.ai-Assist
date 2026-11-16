import type {
  FieldType,
  InsertPosition,
  WidgetDef,
  WidgetInfo,
  WidgetMode,
  WidgetPatch,
  WidgetPlaceRequest,
} from '../shared/types';
import { slug, STORAGE_KEYS, WIDGET_DRAG_MIME, WIDGET_DRAG_TEXT_PREFIX } from '../shared/config';
import { COMPONENT_META, defaultsFor, finalizeDraft, NEEDS_SETUP_FIRST } from '../shared/draft';
import { normalizeUrl } from '../shared/utils';
import { attachStyles, clamp, cssPath, debounce, h, HOST_ATTR } from './dom';
import { extAlive, safeSend } from './messaging';
import { createOverlay, startPicker, type PickerOverlay, type PickResult } from './picker';
import { onPageSelection } from './selection';
import { WIDGET_CSS } from './styles';
import { buildAiCard } from './ui/ai';
import { buildAction } from './ui/action';
import { buildOcr } from './ui/ocr';
import { buildButton } from './ui/button';
import { buildField, type FieldSpec } from './ui/fields';
import { buildForm } from './ui/form';
import { buildIds } from './ui/ids';
import type { Mounted, WidgetCtx } from './ui/types';
import { buildWeather } from './ui/weather';

/**
 * In-page widgets (the PixieBrix-style part).
 * Each widget lives in its own Shadow DOM host, either inline (anchored to a page element by CSS
 * selector + position) or floating (fixed on screen). Widgets are saved per page and re-attached
 * automatically after reloads / SPA navigation. A hover toolbar offers Move / Edit / Remove.
 */

type Store = Record<string, WidgetDef[]>;

const MAX_WIDGETS_PER_PAGE = 30;
const FIELD_KINDS = new Set(['text', 'textarea', 'dropdown', 'checkbox', 'radio']);
const mounted = new Map<string, Mounted>();
let defs: WidgetDef[] = [];
let currentKey = '';
let autofill = true;
/** Default layout for widgets dropped via native drag-and-drop (which never goes through the
 *  properties editor, so there's no per-widget choice there) - 'row' tries to join a row with
 *  whatever's already at the drop spot, 'column' always stacks. Toggled in the Widgets tab. */
let dragLayout: 'row' | 'column' = 'row';
export const getDragLayout = (): 'row' | 'column' => dragLayout;
let cancelPicker: (() => void) | null = null;

const pageKey = () => `${location.origin}${location.pathname.replace(/\/+$/, '') || '/'}`;
const newId = () => `w_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ----------------------------------------------------------------------------- storage
async function readStore(): Promise<Store> {
  try {
    const r = await chrome.storage.local.get(STORAGE_KEYS.widgets);
    return (r[STORAGE_KEYS.widgets] as Store | undefined) ?? {};
  } catch {
    return {};
  }
}

async function persist(): Promise<void> {
  try {
    const store = await readStore();
    if (defs.length) store[currentKey] = defs;
    else delete store[currentKey];
    await chrome.storage.local.set({ [STORAGE_KEYS.widgets]: store });
  } catch {
    /* extension reloaded */
  }
}

const ctx: WidgetCtx = {
  persist,
  outputs: () =>
    [...mounted.values()].filter((x) => x.def.kind === 'output' && x.out && x.host.isConnected).map((x) => x.out!),
  inputs: () =>
    [...mounted.values()].filter((x) => (x.def.kind === 'input' || x.def.kind === 'both') && x.fill && x.host.isConnected).map((x) => x.fill!),
};

// ----------------------------------------------------------------------------- mounting
const WIDTH: Partial<Record<string, number>> = { weather: 340, form: 380, textarea: 340, input: 360, output: 360, both: 360, ocr: 360, ids: 320 };
const INLINE_BTN = new Set(['button', 'action']);

function styleHost(host: HTMLElement, def: WidgetDef): void {
  const isBtn = INLINE_BTN.has(def.kind);
  const w = WIDTH[def.kind] ?? 300;
  const sized = def.w ? `${def.w}px` : null; // set by dragging the resize handle
  const hgt = def.h ? `height:${def.h}px;` : '';
  if (def.mode === 'float') {
    const f = def.float ?? { x: 24, y: 96 };
    host.style.cssText =
      `all:initial;position:fixed;z-index:2147483646;left:${clamp(f.x, 0, innerWidth - 80)}px;` +
      `top:${clamp(f.y, 0, innerHeight - 40)}px;width:${sized ?? (isBtn ? 'auto' : `${w}px`)};${hgt}max-width:calc(100vw - 16px);`;
  } else {
    host.style.cssText =
      // inline-block (not block) for every kind, not just buttons - so several fields dropped
      // one after another near the same spot flow side-by-side like a row, wrapping to a new
      // line only once they run out of horizontal room, instead of always stacking one-per-line.
      `all:initial;display:inline-block;margin:${isBtn ? '4px 6px 4px 0' : '6px 10px 6px 0'};` +
      `max-width:100%;width:${sized ?? (isBtn ? 'auto' : `min(100%,${w}px)`)};${hgt}position:relative;z-index:1;vertical-align:top;box-sizing:border-box;` +
      // Placed inline beside existing page elements, this host often lands as a flex/grid item
      // in someone else's row (Salesforce's own layout, say) - without this, that row's default
      // align-items:stretch pads the host to the full row height, leaving its actual content
      // small and top-aligned inside it, which throws off anything (like the hover toolbar)
      // positioned relative to the host's own box rather than its visible content.
      'align-self:start;justify-self:start;';
  }
}

/** Keep page keyboard shortcuts / click handlers from reacting to what happens inside a widget. */
function isolateEvents(host: HTMLElement): void {
  for (const t of [
    'click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup',
    'keydown', 'keyup', 'keypress', 'contextmenu', 'copy', 'cut', 'paste',
  ]) {
    host.addEventListener(t, (e) => e.stopPropagation());
  }
}

function makeDraggable(host: HTMLElement, handle: HTMLElement, def: WidgetDef): void {
  handle.addEventListener('pointerdown', (e: PointerEvent) => {
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = def.float?.x ?? 0;
    const oy = def.float?.y ?? 0;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const x = clamp(ox + ev.clientX - sx, 0, innerWidth - 80);
      const y = clamp(oy + ev.clientY - sy, 0, innerHeight - 40);
      def.float = { x, y };
      host.style.left = `${x}px`;
      host.style.top = `${y}px`;
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      void persist();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
}

const specFor = (def: WidgetDef): FieldSpec => {
  const p = def.props ?? {};
  const label = p.label || 'Field';
  return { ...p, type: def.kind as FieldType, label, name: p.name || slug(label) };
};

function buildContent(def: WidgetDef, m: Mounted): HTMLElement {
  if (def.kind === 'button') return buildButton(def);
  if (def.kind === 'weather') return buildWeather(def, ctx);
  if (def.kind === 'form') return buildForm(def);
  if (def.kind === 'ocr') return buildOcr(def, m, ctx);
  if (def.kind === 'action') return buildAction(def);
  if (def.kind === 'ids') return buildIds(def, m);
  if (FIELD_KINDS.has(def.kind)) return h('div', { class: 'cmp' }, buildField(specFor(def)).root);
  return buildAiCard(def, m, ctx);
}

/** Corner handle: drag to resize the widget (button, form, card ...), double-click to go back to automatic size. */
function addResizer(def: WidgetDef, m: Mounted, wrap: HTMLElement): HTMLElement {
  const rz = h('div', { class: 'rz', title: 'Drag to resize · double-click to reset' });
  rz.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const r = m.host.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY, sw = r.width, sh = r.height;
    rz.setPointerCapture(e.pointerId);
    wrap.classList.add('resizing');
    const move = (ev: PointerEvent) => {
      const maxW = def.mode === 'float' ? innerWidth - (def.float?.x ?? 0) - 8 : (m.host.parentElement?.clientWidth ?? innerWidth);
      const w = clamp(Math.round(sw + ev.clientX - sx), 80, Math.max(80, maxW));
      const hgt = clamp(Math.round(sh + ev.clientY - sy), 36, 2400);
      def.w = w;
      def.h = hgt;
      m.host.style.width = `${w}px`;
      m.host.style.height = `${hgt}px`;
      wrap.classList.add('sized');
    };
    const up = () => {
      rz.removeEventListener('pointermove', move);
      rz.removeEventListener('pointerup', up);
      wrap.classList.remove('resizing');
      void persist();
    };
    rz.addEventListener('pointermove', move);
    rz.addEventListener('pointerup', up);
  });
  rz.addEventListener('dblclick', () => {
    def.w = undefined;
    def.h = undefined;
    wrap.classList.remove('sized');
    styleHost(m.host, def);
    void persist();
  });
  return rz;
}

/** wraps a component with the hover toolbar (Move / Edit / Remove) */
function withBar(def: WidgetDef, m: Mounted, content: HTMLElement): HTMLElement {
  const move = h('button', { class: 'tb mv', type: 'button', title: def.mode === 'float' ? 'Drag to move' : 'Drag to move, or click to pick a spot' }, '⠿ Move');
  if (def.mode === 'float') makeDraggable(m.host, move, def);
  else move.addEventListener('pointerdown', (e: PointerEvent) => beginDragMove(def.id, move, e));

  const editable = !['input', 'output', 'both'].includes(def.kind);
  const edit = editable ? h('button', { class: 'tb', type: 'button', title: 'Edit properties' }, '✎ Edit') : null;
  edit?.addEventListener('click', () => {
    // Prefer the on-page editor (works without a user gesture); otherwise fall back to the side panel.
    if (hooks.onEdit) hooks.onEdit(def.id);
    else safeSend({ type: 'ORBIT_WIDGET_EDIT_REQUEST', id: def.id });
  });

  const del = h('button', { class: 'tb', type: 'button', title: 'Remove' }, '×');
  del.addEventListener('click', () => removeWidget(def.id));

  const dragHandle = (content as HTMLElement & { dragHandle?: HTMLElement }).dragHandle;
  if (def.mode === 'float' && dragHandle) makeDraggable(m.host, dragHandle, def);

  const wrap = h('div', { class: `wrap${def.h ? ' sized' : ''}${INLINE_BTN.has(def.kind) ? ' small' : ''}` }, h('div', { class: 'bar' }, move, edit, del), content);
  wrap.append(addResizer(def, m, wrap));
  return wrap;
}

function mount(def: WidgetDef): boolean {
  const existing = mounted.get(def.id);
  if (existing?.host.isConnected) return true;
  mounted.delete(def.id);

  let anchor: Element | null = null;
  if (def.mode === 'inline') {
    if (!def.anchor) return false;
    try {
      anchor = document.querySelector(def.anchor.selector);
    } catch {
      return false;
    }
    if (!anchor) return false;
  }

  const host = h('div', { [HOST_ATTR]: def.id });
  styleHost(host, def);
  const root = host.attachShadow({ mode: 'open' });
  attachStyles(root, WIDGET_CSS);
  const m: Mounted = { def, host };
  root.appendChild(withBar(def, m, buildContent(def, m)));
  isolateEvents(host);

  if (def.mode === 'inline' && anchor && def.anchor) {
    freezeShrinkableAncestors(anchor);
    if (def.props?.layout === 'column') {
      // User explicitly chose "stacked" - never join a row, no matter what's next door.
      anchor.insertAdjacentElement(def.anchor.position, host);
    } else {
      insertWidgetHost(anchor, def.anchor.position, host);
    }
    ensureScrollable();
  } else {
    document.documentElement.appendChild(host);
  }
  mounted.set(def.id, m);
  return true;
}

const ROW_ATTR = 'data-orbit-row';

function styleRowWrapper(row: HTMLElement): void {
  row.style.cssText = 'all:initial;display:flex;flex-wrap:wrap;align-items:flex-start;max-width:100%;';
}

/** `display:inline-block` on a host has no effect when the receiving container is itself a flex
 *  box (flex items always arrange along the container's own flex-direction, ignoring each item's
 *  own `display`) - the common case on these dashboard-style pages, confirmed by testing: several
 *  fields dropped one after another still stacked one-per-line despite being inline-block. So
 *  when the exact spot being inserted into is immediately beside an existing widget (or an
 *  existing row of them) - never a plain page element - this groups into a wrapper WE control
 *  (a single flex row, inserted as one item into the page's own flow) instead of becoming another
 *  vertical sibling governed by the page's own flex-direction.
 *
 *  Deliberately stateless: nothing here is persisted (each widget's stored anchor always
 *  describes its placement relative to whatever was there at drop time, never to a row wrapper),
 *  so re-mounting after a reload re-derives the exact same grouping fresh from the same anchors,
 *  in the same order, every time - there's no separate "row" state that could ever go stale. */
function insertWidgetHost(anchor: Element, position: InsertPosition, host: HTMLElement): void {
  const isOurs = (el: Element | null | undefined): boolean =>
    !!el && (el.hasAttribute(ROW_ATTR) || el.hasAttribute(HOST_ATTR));

  const groupWith = (existing: Element, prepend: boolean): void => {
    if (existing.hasAttribute(ROW_ATTR)) {
      if (prepend) existing.prepend(host);
      else existing.appendChild(host);
      return;
    }
    const existingRow = existing.parentElement;
    if (existingRow?.hasAttribute(ROW_ATTR)) {
      // `existing` is itself a normal widget host that's already a child of a row (a third+
      // widget joining a group of two or more) - join that SAME row as another item, rather than
      // wrapping `existing` in a brand new one nested inside it.
      if (prepend) existingRow.insertBefore(host, existing);
      else existing.insertAdjacentElement('afterend', host);
      return;
    }
    const row = h('div', { [ROW_ATTR]: '' });
    styleRowWrapper(row);
    existing.replaceWith(row);
    if (prepend) row.append(host, existing);
    else row.append(existing, host);
  };

  if (position === 'beforebegin' || position === 'afterend') {
    // The anchor itself can BE an existing widget (the picker treats placed widgets as normal
    // targets), or a plain page element that already has one sitting right at this edge from an
    // earlier placement.
    if (isOurs(anchor)) return groupWith(anchor, position === 'beforebegin');
    const neighbor = position === 'beforebegin' ? anchor.previousElementSibling : anchor.nextElementSibling;
    if (isOurs(neighbor)) return groupWith(neighbor!, position === 'beforebegin');
  }
  anchor.insertAdjacentElement(position, host);
}

/** `overflow: hidden` on a flex/grid container quietly turns off its automatic min-size (per the
 *  CSS flex/grid spec, a box with overflow other than `visible` gets an automatic minimum size
 *  of 0, instead of being clamped to its content) - so instead of the extra content triggering a
 *  genuine, detectable overflow, the container (and whatever shares space with it) just silently
 *  shrinks, potentially all the way to nothing, until something that CAN'T shrink (a pinned
 *  footer bar, say) visually collides with whatever's left. ensureScrollable() can only fix
 *  overflow it can actually see, so this runs first: pin every such ancestor's height at what it
 *  currently measures, right before the new content goes in, so the layout engine is forced to
 *  produce a real, visible overflow instead - which the overflow fix then catches normally. */
function freezeShrinkableAncestors(from: Element): void {
  let cur: Element | null = from;
  for (let i = 0; i < 20 && cur && cur !== document.documentElement; i++) {
    const el = cur as HTMLElement;
    const cs = getComputedStyle(el);
    const match = (cs.display.includes('flex') || cs.display.includes('grid')) && (cs.overflowY === 'hidden' || cs.overflow === 'hidden');
    const height = el.getBoundingClientRect().height;
    console.log('[Orbit] freezeShrinkableAncestors', { i, tag: el.tagName, cls: el.className, display: cs.display, overflowY: cs.overflowY, overflow: cs.overflow, height, match }); // TEMP diagnostic
    if (match) el.style.setProperty('min-height', `${height}px`, 'important');
    cur = cur.parentElement;
  }
}

/** Inserting new content inline can make a box taller than it used to be - if THAT box, or some
 *  other element further down affected by the reflow (a sibling block that gets squeezed by its
 *  own parent's flex redistribution, say - not necessarily an ancestor of the new content at
 *  all), clips its own overflow (`overflow[-y]: hidden`, common for app shells built with a
 *  fixed-height root so their OWN scroll areas, not the browser's, handle scrolling), whatever no
 *  longer fits becomes genuinely stuck: no scrollbar, nothing to click, just gone. Rather than
 *  refuse the insertion or reserve it its own non-reflowing space, let it reflow normally (a real
 *  sibling, real layout shift, exactly like placing it beside any other page element) and fix
 *  whatever that breaks: a page-wide pass, run after every placement, that switches every
 *  element now actually clipping overflowing content to `overflow-y:auto`. A no-op everywhere
 *  nothing is currently clipped, so this never touches elements that were already fine. */
function ensureScrollable(): void {
  for (const el of document.querySelectorAll<HTMLElement>('*')) {
    if (el.closest(`[${HOST_ATTR}]`)) continue; // never touch our own UI
    const cs = getComputedStyle(el);
    const clips = cs.overflowY === 'hidden' || cs.overflow === 'hidden';
    if (clips && el.scrollHeight > el.clientHeight + 1) {
      el.style.setProperty('overflow-y', 'auto', 'important');
      console.log('[Orbit] ensureScrollable: fixed', el.tagName, el.className); // TEMP diagnostic
    }
  }
}

function unmount(id: string): void {
  const parent = mounted.get(id)?.host.parentElement;
  mounted.get(id)?.host.remove();
  mounted.delete(id);
  // If that host's parent was a row wrapper WE created for grouping (see insertWidgetHost),
  // removing it can leave an empty - or pointlessly single-item - wrapper still taking up space.
  if (parent?.hasAttribute(ROW_ATTR)) {
    if (parent.children.length === 0) parent.remove();
    else if (parent.children.length === 1) parent.replaceWith(parent.children[0]);
  }
}

const ensureMounted = () => {
  if (!extAlive()) return;
  for (const d of defs) mount(d);
};

// ----------------------------------------------------------------------------- placement / move / update
function applyPick(def: WidgetDef, r: PickResult, mode: WidgetMode): void {
  const asFloat = () => {
    def.mode = 'float';
    def.float = { x: r.x, y: r.y };
    def.anchor = undefined;
  };
  if (mode === 'float') return asFloat();
  const selector = cssPath(r.el);
  let ok = false;
  try {
    ok = document.querySelector(selector) === r.el;
  } catch {
    /* invalid selector */
  }
  if (!ok) return asFloat(); // no reliable selector -> keep it floating where the user clicked
  def.mode = 'inline';
  def.anchor = { selector, position: r.position as InsertPosition, tag: r.el.tagName.toLowerCase() };
  def.float = undefined;
}

/** Lets the on-page builder (toolbar) react to placement / edit requests. */
export const hooks: {
  onEdit: ((id: string) => void) | null;
  onPlacementEnd: (() => void) | null;
  /** Fired the instant a chip drag crosses the drag threshold - lets the toolbar hide its own
   *  properties panel/chrome out of the way so the overlay underneath isn't obstructed. */
  onDragPlacementStart: (() => void) | null;
  /** Fired when that drag ends (dropped, or Esc-cancelled) - restores whatever onDragPlacementStart hid. */
  onDragPlacementEnd: (() => void) | null;
} = {
  onEdit: null,
  onPlacementEnd: null,
  onDragPlacementStart: null,
  onDragPlacementEnd: null,
};

const DRAG_THRESHOLD = 6;

export const getWidgetDef = (id: string): WidgetDef | undefined => defs.find((d) => d.id === id);

const HINT_PLACE = 'Click anywhere on the page to place it (Esc cancels)';

/** Shared by the click-to-place flow and the drag-to-place flow: validate, build the
 *  WidgetDef, anchor it at the picked spot, mount it, and announce it. */
function finalizeNewWidget(req: WidgetPlaceRequest, r: PickResult): void {
  const isBtn = req.kind === 'button';
  const def: WidgetDef = {
    id: newId(),
    kind: req.kind,
    mode: req.mode,
    props: req.props ? structuredClone(req.props) : undefined,
    label: isBtn ? req.label?.trim() || 'Open link' : undefined,
    url: isBtn ? normalizeUrl(req.url ?? '') ?? undefined : undefined,
    newTab: isBtn ? !!req.newTab : undefined,
    action: 'summarize',
    language: 'English',
    replaceOnPage: true,
    createdAt: Date.now(),
  };
  applyPick(def, r, req.mode);
  defs.push(def);
  const mounted_ = mount(def);
  if (!mounted_) {
    defs.pop();
    safeSend({ type: 'ORBIT_WIDGET_EVENT', event: 'failed', message: 'Could not place the widget there.' });
    return;
  }
  void persist();
  mounted.get(def.id)?.host.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  safeSend({ type: 'ORBIT_WIDGET_EVENT', event: 'placed', id: def.id });
}

// NEEDS_SETUP_FIRST is defined in ../shared/draft (single source of truth, reused by the side
// panel too) and re-exported here for the on-page toolbar's existing import.
export { NEEDS_SETUP_FIRST };

const VALID_KINDS = new Set(COMPONENT_META.map((m) => m.kind));

function widgetKindFromDrag(dt: DataTransfer | null): WidgetDef['kind'] | null {
  if (!dt) return null;
  const raw = dt.getData(WIDGET_DRAG_MIME);
  if (VALID_KINDS.has(raw as WidgetDef['kind'])) return raw as WidgetDef['kind'];
  const text = dt.getData('text/plain');
  const fromText = text.startsWith(WIDGET_DRAG_TEXT_PREFIX) ? text.slice(WIDGET_DRAG_TEXT_PREFIX.length) : '';
  return VALID_KINDS.has(fromText as WidgetDef['kind']) ? (fromText as WidgetDef['kind']) : null;
}

/** Set by the side panel via ORBIT_WIDGET_DRAG_ARM/DISARM, just before (and after) an actual
 *  OS-level drag from the palette. Needed because Chrome strips both the custom drag MIME type
 *  AND its data value by the time they cross from the side panel into the page - confirmed via
 *  diagnostics: `dragenter`'s `e.dataTransfer.types` on the page side doesn't contain the custom
 *  type at all, and even `drop`'s `getData()` for it (and the text/plain fallback) came back
 *  empty. So both "is this drag ours" and "which component kind is it" are carried out-of-band
 *  through this message instead of through dataTransfer, which can no longer be trusted for
 *  either once the drag has left the panel. */
let dragArmed = false;
let armedKind: WidgetDef['kind'] | null = null;
let dragArmTimer = 0;
const DRAG_ARM_TIMEOUT_MS = 10_000;
/** Resets the failsafe clock - called again on every dragover while the drag is actually still
 *  happening over the page, so holding a drag longer than the timeout doesn't make it expire out
 *  from under the user mid-drag. Only a drag that's genuinely stalled (no dragover at all for the
 *  full timeout - e.g. disarm's message never arrived) ever actually times out. */
function bumpDragArmTimer(): void {
  window.clearTimeout(dragArmTimer);
  dragArmTimer = window.setTimeout(() => { dragArmed = false; armedKind = null; }, DRAG_ARM_TIMEOUT_MS);
}
export function armNativeDrag(kind: WidgetDef['kind']): void {
  dragArmed = true;
  armedKind = kind;
  bumpDragArmTimer();
}
export function disarmNativeDrag(): void {
  dragArmed = false;
  armedKind = null;
  window.clearTimeout(dragArmTimer);
}

/** Accepts a component dragged in from the side panel's palette via the browser's native
 *  (OS-level) Drag and Drop API. A side panel (unlike a popup, which closes on blur) stays open
 *  while the drag is in flight, so this IS the documented way to drag from an extension page
 *  onto the active tab's page. Listeners are added on the capture phase so a page's own
 *  dragover/drop handlers calling stopPropagation() can't swallow the event before it reaches
 *  us - that was the likely cause of an earlier attempt not firing on some pages. */
export function initNativeDragAcceptor(): void {
  let overlay: PickerOverlay | null = null;

  // extAlive(): reloading the extension (without refreshing the tab) leaves this exact listener
  // from the orphaned old copy still attached to the live page's `window`, invalidated extension
  // context and all - without this check that stale copy would still catch the drop and mount
  // its own widget, producing a visible duplicate alongside the one the current copy places.
  const isOurDrag = (e: DragEvent): boolean =>
    extAlive() && (dragArmed || !!e.dataTransfer?.types.includes(WIDGET_DRAG_MIME));

  window.addEventListener('dragenter', (e: DragEvent) => {
    if (!isOurDrag(e)) return;
    e.preventDefault();
  }, true);

  window.addEventListener('dragover', (e: DragEvent) => {
    if (!isOurDrag(e)) return;
    e.preventDefault();
    if (dragArmed) bumpDragArmTimer();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    if (!overlay) {
      cancelPlacement();
      overlay = createOverlay('inline', 'Drop it on the page');
    }
    overlay.update(e.clientX, e.clientY);
  }, true);

  window.addEventListener('dragleave', (e: DragEvent) => {
    // relatedTarget is null once the drag leaves the whole window/viewport.
    if (overlay && e.relatedTarget === null) {
      overlay.destroy();
      overlay = null;
    }
  }, true);

  window.addEventListener('drop', (e: DragEvent) => {
    if (!isOurDrag(e)) return;
    e.preventDefault();
    // armedKind (out-of-band, from the ARM message) takes priority over reading dataTransfer
    // directly - its value doesn't survive the side-panel/page crossing either, same as the
    // type key did not. Only falls back to it for the "type key alone survived" branch above.
    const kind = armedKind ?? widgetKindFromDrag(e.dataTransfer);
    disarmNativeDrag();
    const result = overlay?.resultAt(e.clientX, e.clientY) ?? null;
    overlay?.destroy();
    overlay = null;
    if (!kind || !result) return;
    const f = finalizeDraft(defaultsFor(kind));
    finalizeNewWidget({ kind: f.kind, mode: f.mode, props: { ...f.props, layout: dragLayout }, label: f.label, url: f.url, newTab: f.newTab }, result);
  }, true);

  // `drop` only fires when the drag ends *on* a valid target. Esc, dropping outside the window,
  // or anything else that cancels the native drag skips straight to `dragend` without it - so
  // this is the only reliable place to always clear the overlay. Without this, a cancelled drag
  // left the overlay (and its "Can't place here" label) stuck on screen, and the next drag
  // wouldn't even create a fresh one (`if (!overlay)` above was never true again).
  window.addEventListener('dragend', () => {
    disarmNativeDrag();
    overlay?.destroy();
    overlay = null;
  }, true);
}

function placementIssue(req: WidgetPlaceRequest): string | null {
  if (defs.length >= MAX_WIDGETS_PER_PAGE) return `Limit of ${MAX_WIDGETS_PER_PAGE} widgets per page reached.`;
  if (req.kind === 'button' && !normalizeUrl(req.url ?? '')) return 'Enter a valid http(s) link first.';
  if (req.kind === 'form' && !req.props?.fields?.length) return 'Add at least one field to the form.';
  return null;
}

export function beginPlacement(req: WidgetPlaceRequest): { ok: boolean; message?: string } {
  cancelPlacement();
  const issue = placementIssue(req);
  if (issue) return { ok: false, message: issue };

  cancelPicker = startPicker({
    mode: req.mode,
    hint: req.mode === 'float' ? 'Click anywhere on the page to drop it (Esc cancels)' : HINT_PLACE,
    onCancel: () => {
      cancelPicker = null;
      hooks.onPlacementEnd?.();
      safeSend({ type: 'ORBIT_WIDGET_EVENT', event: 'cancelled' });
    },
    onPick: (r) => {
      cancelPicker = null;
      hooks.onPlacementEnd?.();
      finalizeNewWidget(req, r);
    },
  });
  return { ok: true };
}

/** Drag a toolbar chip directly onto the page to place a new widget in one continuous gesture -
 *  same live highlight-box / insertion-line overlay as moving an existing widget. If the request
 *  isn't valid yet (see placementIssue, e.g. a button with no URL), this returns {ok:false}
 *  immediately without capturing the pointer, so the caller's normal click behavior (e.g. opening
 *  a properties panel to fix it) still happens untouched. */
export function beginDragPlacement(
  req: WidgetPlaceRequest,
  handle: HTMLElement,
  e: PointerEvent,
  ghostLabel?: string,
  /** Called synchronously inside the pointerup handler, which always fires before the browser's
   *  own synthesized "click" event on the same element - so the caller can use this to suppress
   *  that click (e.g. skip re-opening a properties panel) when a real drag just happened. */
  onDragEnd?: (didDrag: boolean) => void,
): { ok: boolean; message?: string } {
  cancelPlacement();
  const issue = placementIssue(req);
  if (issue) return { ok: false, message: issue };

  const startX = e.clientX;
  const startY = e.clientY;
  let overlay: PickerOverlay | null = null;
  let ghost: HTMLElement | null = null;
  let cancelled = false;
  let started = false;

  handle.setPointerCapture(e.pointerId);

  const moveGhost = (x: number, y: number) => {
    if (!ghost) return;
    ghost.style.left = `${x + 14}px`;
    ghost.style.top = `${y + 14}px`;
  };

  const onMove = (ev: PointerEvent) => {
    if (cancelled) return;
    if (!overlay && Math.hypot(ev.clientX - startX, ev.clientY - startY) > DRAG_THRESHOLD) {
      started = true;
      overlay = createOverlay(req.mode, req.mode === 'float' ? 'Drop it anywhere (Esc cancels)' : 'Drop it on the page (Esc cancels)');
      if (ghostLabel) {
        ghost = h('div', { [HOST_ATTR]: 'drag-ghost' }, ghostLabel);
        ghost.style.cssText =
          'all:initial;position:fixed;z-index:2147483647;pointer-events:none;font:600 12px/1 "Segoe UI",Arial,sans-serif;' +
          'color:#fff;background:#2b2b2b;border-radius:999px;padding:7px 12px;box-shadow:0 4px 14px rgba(0,0,0,.3);white-space:nowrap;';
        document.documentElement.appendChild(ghost);
        moveGhost(ev.clientX, ev.clientY);
      }
      hooks.onDragPlacementStart?.();
    }
    overlay?.update(ev.clientX, ev.clientY);
    moveGhost(ev.clientX, ev.clientY);
  };
  const cleanup = () => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey, true);
    ghost?.remove();
    ghost = null;
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };
  const onUp = (ev: PointerEvent) => {
    cleanup();
    onDragEnd?.(started);
    if (!started) return; // plain click, not a drag - caller's own click handler takes it from here
    hooks.onDragPlacementEnd?.();
    if (cancelled) {
      overlay?.destroy();
      safeSend({ type: 'ORBIT_WIDGET_EVENT', event: 'cancelled' });
      return;
    }
    const result = overlay?.resultAt(ev.clientX, ev.clientY);
    overlay?.destroy();
    if (result) finalizeNewWidget(req, result);
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      cancelled = true;
      cleanup();
      overlay?.destroy();
      overlay = null;
      if (started) hooks.onDragPlacementEnd?.();
    }
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey, true);
  return { ok: true };
}

/** Drag the "Move" handle directly to reposition an inline widget, showing the same live
 *  highlight-box / insertion-line / "position · tag" overlay as the click-to-place flow while
 *  dragging. A plain click (no real movement) falls back to the existing "click Move, then
 *  click a spot" two-step flow, so nothing already working changes. */
function beginDragMove(id: string, handle: HTMLElement, e: PointerEvent): void {
  const def = defs.find((d) => d.id === id);
  if (!def || def.mode !== 'inline') return;
  const startX = e.clientX;
  const startY = e.clientY;
  let overlay: PickerOverlay | null = null;
  let cancelled = false;

  handle.setPointerCapture(e.pointerId);

  const onMove = (ev: PointerEvent) => {
    if (cancelled) return;
    if (!overlay && Math.hypot(ev.clientX - startX, ev.clientY - startY) > DRAG_THRESHOLD) {
      cancelPlacement();
      overlay = createOverlay('inline', 'Drop to move it here (Esc cancels)');
    }
    overlay?.update(ev.clientX, ev.clientY);
  };
  const cleanup = () => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey, true);
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };
  const onUp = (ev: PointerEvent) => {
    cleanup();
    if (cancelled) {
      overlay?.destroy();
      return;
    }
    if (!overlay) {
      moveWidget(id); // plain click, no drag - same as before
      return;
    }
    const result = overlay.resultAt(ev.clientX, ev.clientY);
    overlay.destroy();
    if (!result) return;
    unmount(id);
    applyPick(def, result, 'inline');
    mount(def);
    void persist();
    safeSend({ type: 'ORBIT_WIDGET_EVENT', event: 'changed', id });
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      cancelled = true;
      cleanup();
      overlay?.destroy();
      overlay = null;
    }
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey, true);
}

/** Pick a new place for an existing (inline) widget. */
export function moveWidget(id: string): { ok: boolean; message?: string } {
  const def = defs.find((d) => d.id === id);
  if (!def) return { ok: false, message: 'Widget not found.' };
  cancelPlacement();
  cancelPicker = startPicker({
    mode: 'inline',
    hint: 'Click where you want to move it (Esc cancels)',
    onCancel: () => (cancelPicker = null),
    onPick: (r) => {
      cancelPicker = null;
      unmount(id);
      applyPick(def, r, 'inline');
      mount(def);
      void persist();
      safeSend({ type: 'ORBIT_WIDGET_EVENT', event: 'changed', id });
    },
  });
  return { ok: true };
}

/** Apply edited properties from the side panel and re-render the widget in place. */
export function updateWidget(id: string, patch: WidgetPatch): { ok: boolean; message?: string } {
  const def = defs.find((d) => d.id === id);
  if (!def) return { ok: false, message: 'Widget not found.' };
  if (def.kind === 'button') {
    if (patch.url !== undefined) {
      const u = normalizeUrl(patch.url);
      if (!u) return { ok: false, message: 'Enter a valid http(s) link.' };
      def.url = u;
    }
    if (patch.label !== undefined) def.label = patch.label.trim() || 'Open link';
    if (patch.newTab !== undefined) def.newTab = patch.newTab;
  }
  if (patch.props) def.props = structuredClone(patch.props);
  unmount(id);
  mount(def);
  void persist();
  safeSend({ type: 'ORBIT_WIDGET_EVENT', event: 'changed', id });
  return { ok: true };
}

export function cancelPlacement(): void {
  const c = cancelPicker;
  cancelPicker = null;
  c?.();
}

export function removeWidget(id?: string): void {
  if (id) {
    unmount(id);
    defs = defs.filter((d) => d.id !== id);
  } else {
    cancelPlacement();
    for (const d of defs) unmount(d.id);
    defs = [];
  }
  void persist();
  safeSend({ type: 'ORBIT_WIDGET_EVENT', event: 'removed' });
}

export function listWidgets(): WidgetInfo[] {
  return defs.map((d) => ({ ...d, mounted: !!mounted.get(d.id)?.host.isConnected }));
}

// ----------------------------------------------------------------------------- lifecycle
async function loadForPage(): Promise<void> {
  currentKey = pageKey();
  const store = await readStore();
  defs = store[currentKey] ?? [];
  ensureMounted();
}

async function switchPage(): Promise<void> {
  cancelPlacement();
  for (const id of [...mounted.keys()]) unmount(id);
  await loadForPage();
  safeSend({ type: 'ORBIT_WIDGET_EVENT', event: 'changed' });
}

export async function initWidgets(): Promise<void> {
  // After an extension reload an orphaned copy of this script may have left widgets behind.
  document.querySelectorAll(`[${HOST_ATTR}]`).forEach((el) => el.remove());

  try {
    const r = await chrome.storage.local.get([STORAGE_KEYS.autofill, STORAGE_KEYS.dragLayout]);
    autofill = r[STORAGE_KEYS.autofill] !== false;
    dragLayout = r[STORAGE_KEYS.dragLayout] === 'column' ? 'column' : 'row';
    chrome.storage.onChanged.addListener((chg, area) => {
      if (area !== 'local') return;
      if (chg[STORAGE_KEYS.autofill]) autofill = chg[STORAGE_KEYS.autofill].newValue !== false;
      if (chg[STORAGE_KEYS.dragLayout]) dragLayout = chg[STORAGE_KEYS.dragLayout].newValue === 'column' ? 'column' : 'row';
    });
  } catch {
    /* storage unavailable */
  }

  // "Auto-fill AI input from selected text"
  onPageSelection((text) => {
    if (!autofill) return;
    mounted.forEach((m) => m.fill?.(text));
  });

  await loadForPage();

  // Re-attach widgets when slow / single-page apps (Workday, Salesforce...) re-render the DOM.
  new MutationObserver(debounce(ensureMounted, 700)).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  // SPA navigation: different path -> different widgets.
  window.setInterval(() => {
    if (extAlive() && pageKey() !== currentKey) void switchPage();
  }, 1000);
}

