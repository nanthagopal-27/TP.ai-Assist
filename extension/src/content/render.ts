import type { AIResponse } from '../shared/types';
import { SHORT_NAME } from '../shared/config';
import { h } from './dom';

type Kid = Node | string;

/** **bold** and `code` -> DOM nodes (never innerHTML). */
function inline(text: string): Kid[] {
  const out: Kid[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] ? h('strong', {}, m[1]) : h('code', {}, m[2]));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Minimal markdown: paragraphs, "-"/"*" bullet lists, **bold**, `code`. */
function markdown(text: string): HTMLElement[] {
  const blocks: HTMLElement[] = [];
  let list: HTMLElement | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(h('p', {}, ...inline(para.join(' '))));
    para = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = /^([-*•]|\d+\.)\s+(.*)$/.exec(line);
    if (bullet) {
      flushPara();
      if (!list) {
        list = h('ul');
        blocks.push(list);
      }
      list.append(h('li', {}, ...inline(bullet[2])));
    } else if (!line) {
      flushPara();
      list = null;
    } else {
      list = null;
      para.push(line);
    }
  }
  flushPara();
  return blocks;
}

export function renderLoading(el: HTMLElement): void {
  el.className = 'out';
  el.replaceChildren(h('p', { class: 'dim' }, `${SHORT_NAME} is thinking…`));
}

export function renderError(el: HTMLElement, message: string): void {
  el.className = 'out';
  el.replaceChildren(h('p', { class: 'err' }, message));
}

export function renderResult(el: HTMLElement, res: AIResponse, extras: Node[] = []): void {
  const { title, content, bullets, fields } = res.result;
  el.className = 'out';
  el.replaceChildren();
  if (title) el.append(h('h4', {}, title));
  if (content) el.append(...markdown(content));
  if (fields.length) {
    el.append(
      h('table', {}, h('tbody', {}, ...fields.map((f) => h('tr', {}, h('td', {}, f.label), h('td', {}, f.value))))),
    );
  }
  if (bullets.length) el.append(h('ul', {}, ...bullets.map((b) => h('li', {}, b))));
  el.append(...extras);

  const plain = [title, content, ...fields.map((f) => `${f.label}: ${f.value}`), ...bullets.map((b) => `- ${b}`)]
    .filter(Boolean)
    .join('\n\n');
  const copy = h('button', { class: 'mini', type: 'button' }, 'Copy');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(plain);
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Copy failed';
    }
    setTimeout(() => (copy.textContent = 'Copy'), 1400);
  });
  el.append(
    h('div', { class: 'meta' }, h('span', {}, `${res.model} · ${(res.latency_ms / 1000).toFixed(1)}s`), copy),
  );
}
