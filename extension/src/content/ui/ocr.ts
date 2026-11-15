import type { OcrResult, WidgetDef } from '../../shared/types';
import { h } from '../dom';
import { rpc } from '../messaging';
import { selectArea, type AreaResult } from '../areaselect';
import type { Mounted, WidgetCtx } from './types';

/**
 * OCR widget: drag a rectangle over anything on the page (an image, a scanned form, a chart, a canvas ...),
 * see the captured picture, press "Extract text" and read what the picture says.
 */
export function buildOcr(def: WidgetDef, m: Mounted, ctx: WidgetCtx): HTMLElement {
  const engine = def.props?.ocrEngine ?? 'ai';
  let area: AreaResult | null = null;

  const header = h('div', { class: def.mode === 'float' ? 'hd drag' : 'hd' },
    h('span', { class: 'hd-sub' }, `${def.props?.label || 'OCR'} · ${engine === 'ai' ? 'AI engine' : 'offline'}`));

  const view = h('div', { class: 'ocr-view' });
  const showEmpty = () =>
    view.replaceChildren(h('div', { class: 'ocr-empty' }, h('div', { class: 'ocr-ico' }, '▣'), 'Drag over an image or text on the page to capture it.'));
  showEmpty();

  const pick = h('button', { class: 'ghost-btn', type: 'button' }, '▣ Select area');
  const extract = h('button', { class: 'run', type: 'button', disabled: true }, 'Extract text →');
  const status = h('div', { class: 'note', style: 'display:none' });
  const out = h('textarea', { class: 'ocr-out', rows: '5', placeholder: 'Extracted text appears here…' });
  const copy = h('button', { class: 'mini', type: 'button' }, 'Copy');
  const toAi = h('button', { class: 'mini', type: 'button', title: 'Put the text into an AI Input box on this page' }, 'Use in AI Input');
  const clear = h('button', { class: 'mini', type: 'button' }, 'Clear');
  const outWrap = h('div', { class: 'ocr-outwrap', style: 'display:none' }, out, h('div', { class: 'row' }, copy, toAi, clear));

  const say = (text: string, bad = false) => {
    status.textContent = text;
    status.className = bad ? 'note bad' : 'note';
    status.style.display = text ? '' : 'none';
  };

  pick.addEventListener('click', async () => {
    pick.disabled = true;
    say('');
    try {
      const r = await selectArea();
      if (!r) return;
      area = r;
      view.replaceChildren(h('img', { class: 'ocr-img', src: r.image, alt: 'Captured area' }), h('div', { class: 'ocr-dim' }, `${r.width} × ${r.height} px`));
      extract.disabled = false;
      outWrap.style.display = 'none';
      out.value = '';
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), true);
    } finally {
      pick.disabled = false;
    }
  });

  extract.addEventListener('click', async () => {
    if (!area) return;
    extract.disabled = true;
    pick.disabled = true;
    extract.textContent = 'Reading…';
    say(engine === 'local' ? 'Reading the picture… the first time can take a few seconds while the offline engine starts.' : 'Reading the picture with AI…');
    const t0 = performance.now();
    try {
      const r = await rpc<OcrResult>({ type: 'ORBIT_OCR', image: area.ocrImage, engine });
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      let text = r.text.trim();
      let note = `Done in ${secs}s` + (r.confidence !== undefined ? ` · confidence ${r.confidence}%` : '');
      if ((!text || text === '(no text found)') && area.domText) {
        text = area.domText;
        note = 'No text was recognised in the picture - showing the page\'s own text inside that area instead.';
      } else if (!text) {
        text = '';
        note = 'No text was found in that area. Try a tighter selection around the text.';
      }
      out.value = text;
      outWrap.style.display = '';
      say(note, !text);
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), true);
    } finally {
      extract.disabled = false;
      pick.disabled = false;
      extract.textContent = 'Extract text →';
    }
  });

  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(out.value);
      say('Copied to the clipboard.');
    } catch {
      out.select();
      say('Press Ctrl+C to copy the selected text.');
    }
  });
  toAi.addEventListener('click', () => {
    const fills = ctx.inputs();
    if (!fills.length) return say('Place an "AI Input" widget on this page first.', true);
    fills[fills.length - 1](out.value);
    say('Text sent to the AI Input box.');
  });
  clear.addEventListener('click', () => {
    area = null;
    extract.disabled = true;
    out.value = '';
    outWrap.style.display = 'none';
    say('');
    showEmpty();
  });

  const body = h('div', { class: 'bd' }, view, h('div', { class: 'row' }, pick, extract), status, outWrap);
  m.body = body;
  const card = h('div', { class: 'card' }, header, body);
  (card as HTMLElement & { dragHandle?: HTMLElement }).dragHandle = header;
  return card;
}
