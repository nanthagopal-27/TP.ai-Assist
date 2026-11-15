import type { WidgetDef } from '../../shared/types';
import { normalizeUrl } from '../../shared/utils';
import { h } from '../dom';

/** Link button: opens the configured URL (same tab or new tab). */
export function buildButton(def: WidgetDef): HTMLElement {
  const url = normalizeUrl(def.url ?? '');
  const btn = h('button', { class: 'link', type: 'button', title: url ?? 'Invalid link' }, def.label || 'Open link', h('span', { class: 'ext' }, '↗'));
  btn.addEventListener('click', () => {
    const u = normalizeUrl(def.url ?? '');
    if (!u) return;
    if (def.newTab) window.open(u, '_blank', 'noopener,noreferrer');
    else location.assign(u);
  });
  return h('div', { class: 'btn-cmp' }, btn);
}
