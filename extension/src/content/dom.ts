/** Tiny DOM helpers for the content script (no framework, CSP-safe: no innerHTML, no inline <style>). */

export const HOST_ATTR = 'data-orbit-host';

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...kids: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (v === true) (el as unknown as Record<string, unknown>)[k] = true;
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}

/**
 * Attach CSS to a shadow root. Constructable stylesheets are not blocked by a page's
 * Content-Security-Policy (unlike injected <style> tags), which matters on enterprise sites.
 */
export function attachStyles(root: ShadowRoot, css: string): void {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [sheet];
  } catch {
    const style = document.createElement('style');
    style.textContent = css;
    root.appendChild(style);
  }
}

/** true when the node lives inside one of our own injected hosts */
export function isOwnNode(node: Node | EventTarget | null): boolean {
  if (!(node instanceof Node)) return false;
  const el = node instanceof Element ? node : node.parentElement;
  return !!el?.closest(`[${HOST_ATTR}]`);
}

const stableId = (id: string) => !!id && !/\d{4,}|[0-9a-f]{10,}|^\d/i.test(id);

/** A CSS selector that finds this element again after a page reload. */
export function cssPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.nodeType === 1) {
    const tag = cur.tagName.toLowerCase();
    if (cur.id && stableId(cur.id)) {
      const sel = `#${CSS.escape(cur.id)}`;
      if (document.querySelectorAll(sel).length === 1) {
        parts.unshift(sel);
        break;
      }
    }
    if (tag === 'body' || tag === 'html') {
      parts.unshift(tag);
      break;
    }
    const parent: Element | null = cur.parentElement;
    let part = tag;
    if (parent) {
      const same = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
    }
    parts.unshift(part);
    cur = parent;
  }
  return parts.join(' > ');
}

export const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), Math.max(min, max));

export function debounce<T extends unknown[]>(fn: (...a: T) => void, ms: number) {
  let t: number | undefined;
  return (...a: T) => {
    window.clearTimeout(t);
    t = window.setTimeout(() => fn(...a), ms);
  };
}
