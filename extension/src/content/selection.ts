import { attachStyles, h, HOST_ATTR, isOwnNode } from './dom';
import { safeSend } from './messaging';
import { PRODUCT_NAME, SHORT_NAME } from '../shared/config';

const MAX_SELECTION_CHARS = 20_000;

type Field = HTMLInputElement | HTMLTextAreaElement;

export interface SelectionSnapshot {
  text: string;
  range: Range | null;
  field: { el: Field; start: number; end: number } | null;
}

/** Last non-empty selection made on the PAGE (kept even after the selection collapses,
 *  so a widget can still act on it when the user clicks into the widget). */
let snapshot: SelectionSnapshot = { text: '', range: null, field: null };
let lastReported = '';
const listeners = new Set<(text: string) => void>();

export const getSnapshot = (): SelectionSnapshot => snapshot;

export function onPageSelection(cb: (text: string) => void): void {
  listeners.add(cb);
}

function activeField(): Field | null {
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement) return el;
  if (el instanceof HTMLInputElement && /^(text|search|url|tel|email)$/i.test(el.type)) return el;
  return null;
}

export function getSelectedText(): string {
  const f = activeField();
  if (f) {
    const { selectionStart: s, selectionEnd: e, value } = f;
    if (s !== null && e !== null && e > s) return value.slice(s, e).trim();
  }
  return (window.getSelection()?.toString() ?? '').trim();
}

const focusInsideOwnUi = () => isOwnNode(document.activeElement);

function capture(text: string): void {
  const f = activeField();
  if (f && (f.selectionEnd ?? 0) > (f.selectionStart ?? 0)) {
    snapshot = { text, range: null, field: { el: f, start: f.selectionStart ?? 0, end: f.selectionEnd ?? 0 } };
    return;
  }
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    const r = sel.getRangeAt(0);
    if (!isOwnNode(r.commonAncestorContainer)) snapshot = { text, range: r.cloneRange(), field: null };
  }
}

function selectionRect(): DOMRect | null {
  const f = activeField();
  if (f && (f.selectionEnd ?? 0) > (f.selectionStart ?? 0)) return f.getBoundingClientRect();
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width || rect.height) return rect;
  }
  return null;
}

// ---------------------------------------------------------------- quick brand button
const BUTTON_CSS = `
button{all:unset;display:none;position:fixed;cursor:pointer;box-sizing:border-box;
  font:600 12px/1 "Segoe UI",-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#fff;background:#3d3d3d;
  border:1px solid #2b2b2b;border-radius:8px;padding:7px 10px;box-shadow:0 2px 8px rgba(0,0,0,.18);letter-spacing:.2px}
button:hover{background:#262626}
button span{color:#bdbdbd;font-weight:500}`;

let quickHost: HTMLElement | null = null;
let quickBtn: HTMLButtonElement | null = null;

function ensureQuickButton(): void {
  if (quickHost) return;
  quickHost = h('div', { [HOST_ATTR]: 'quick' });
  quickHost.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:0;left:0;';
  const shadow = quickHost.attachShadow({ mode: 'closed' });
  attachStyles(shadow, BUTTON_CSS);
  quickBtn = h('button', { type: 'button', title: `Open ${PRODUCT_NAME}` }, SHORT_NAME.slice(0, 2), h('span', {}, SHORT_NAME.slice(2)));
  quickBtn.addEventListener('mousedown', (e) => e.preventDefault()); // keep the page selection alive
  quickBtn.addEventListener('click', () => {
    safeSend({ type: 'ORBIT_SELECTION_CHANGED', text: getSelectedText().slice(0, MAX_SELECTION_CHARS) });
    safeSend({ type: 'ORBIT_OPEN_PANEL' });
    hideQuickButton();
  });
  shadow.appendChild(quickBtn);
  document.documentElement.appendChild(quickHost);
}

function showQuickButton(): void {
  const rect = selectionRect();
  if (!rect) return hideQuickButton();
  ensureQuickButton();
  if (!quickBtn) return;
  quickBtn.style.top = `${Math.min(window.innerHeight - 40, Math.max(8, rect.bottom + 8))}px`;
  quickBtn.style.left = `${Math.min(window.innerWidth - 70, Math.max(8, rect.left))}px`;
  quickBtn.style.display = 'block';
}

function hideQuickButton(): void {
  if (quickBtn) quickBtn.style.display = 'none';
}

// ---------------------------------------------------------------- wiring
function report(): void {
  if (focusInsideOwnUi()) return; // typing/selecting inside our own widget is not a page selection
  const text = getSelectedText().slice(0, MAX_SELECTION_CHARS);
  if (text) {
    capture(text);
    listeners.forEach((cb) => cb(text));
  }
  if (text !== lastReported) {
    lastReported = text;
    safeSend({ type: 'ORBIT_SELECTION_CHANGED', text });
  }
  if (text.length >= 3) showQuickButton();
  else hideQuickButton();
}

export function initSelection(): void {
  let timer: number | undefined;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(report, 250);
  };
  document.addEventListener('selectionchange', schedule);
  document.addEventListener('mouseup', schedule);
  document.addEventListener('keyup', (e) => {
    if (e.shiftKey || e.key === 'a' || e.key.startsWith('Arrow')) schedule();
  });
  window.addEventListener('scroll', hideQuickButton, { passive: true });
}
