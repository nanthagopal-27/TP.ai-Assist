import type { ReplaceResult } from '../shared/types';
import { getSnapshot, type SelectionSnapshot } from './selection';

/** Replace the text the user selected on the page (e.g. with its translation) - and allow undo. */
const undoStack: Array<() => void> = [];

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // Use the native setter so React/Angular-controlled inputs notice the change.
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function replaceSelection(newText: string, snap: SelectionSnapshot = getSnapshot()): ReplaceResult {
  const text = newText.trim();
  if (!text) return { ok: false, message: 'Nothing to put on the page.' };
  if (!snap.text) return { ok: false, message: 'Select text on the page first.' };

  // 1) text inside an <input> / <textarea>
  if (snap.field) {
    const { el, start, end } = snap.field;
    if (!el.isConnected || el.value.slice(start, end).trim() !== snap.text) {
      return { ok: false, message: 'The selected text changed. Select it again.' };
    }
    const before = el.value;
    setNativeValue(el, before.slice(0, start) + text + before.slice(end));
    undoStack.push(() => setNativeValue(el, before));
    return { ok: true, message: 'Replaced on the page.' };
  }

  // 2) normal page text - edit the text nodes in place (no DOM restructuring, so undo is exact)
  const range = snap.range;
  if (!range || !range.commonAncestorContainer.isConnected || range.toString().trim() !== snap.text) {
    return { ok: false, message: 'The selected text moved or changed. Select it again.' };
  }
  const parts = textPartsIn(range);
  if (!parts.length) return { ok: false, message: 'Could not find the selected text. Select it again.' };

  const saved = parts.map((p) => ({ node: p.node, data: p.node.data }));
  parts.forEach((p, i) => {
    const d = p.node.data;
    p.node.data = d.slice(0, p.start) + (i === 0 ? text : '') + d.slice(p.end);
  });
  window.getSelection()?.removeAllRanges();
  undoStack.push(() => saved.forEach((s) => (s.node.data = s.data)));
  return { ok: true, message: 'Replaced on the page.' };
}

interface TextPart {
  node: Text;
  start: number;
  end: number;
}

/** The slices of text nodes that the range actually covers (whitespace-only slices ignored). */
function textPartsIn(range: Range): TextPart[] {
  const root = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) {
    return [{ node: root as Text, start: range.startOffset, end: range.endOffset }];
  }
  const parts: TextPart[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!range.intersectsNode(n)) continue;
    const t = n as Text;
    const start = t === range.startContainer ? range.startOffset : 0;
    const end = t === range.endContainer ? range.endOffset : t.length;
    if (end > start && t.data.slice(start, end).trim()) parts.push({ node: t, start, end });
  }
  return parts;
}

export function undoReplace(): ReplaceResult {
  const undo = undoStack.pop();
  if (!undo) return { ok: false, message: 'Nothing to undo.' };
  try {
    undo();
    return { ok: true, message: 'Original text restored.' };
  } catch {
    return { ok: false, message: 'Could not restore - the page changed.' };
  }
}
