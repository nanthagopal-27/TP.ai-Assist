import type { ActionId, AIRequestPayload, AIResponse, WidgetDef } from '../../shared/types';
import { ACTION_ORDER, ACTION_SHORT, LANGUAGES } from '../../shared/config';
import { h } from '../dom';
import { rpc } from '../messaging';
import { collectPage } from '../page';
import { renderError, renderLoading, renderResult } from '../render';
import { replaceSelection, undoReplace } from '../replace';
import { getSnapshot } from '../selection';
import type { Mounted, WidgetCtx } from './types';

/** "AI Input" / "AI Output" cards: run an AI action on selected or typed text, show the answer on the page. */
export function buildAiCard(def: WidgetDef, m: Mounted, ctx: WidgetCtx): HTMLElement {
  const header = h('div', { class: def.mode === 'float' ? 'hd drag' : 'hd' },
    h('span', { class: 'hd-sub' }, def.kind === 'output' ? 'AI output' : 'AI assistant'));
  const body = h('div', { class: 'bd' });
  m.body = body;
  if (def.kind === 'input' || def.kind === 'both') body.append(...buildInputPart(def, m, ctx));
  if (def.kind === 'output' || def.kind === 'both') {
    m.out = h('div', { class: 'out empty' }, def.kind === 'output' ? 'AI output - answers from AI input boxes on this page appear here.' : 'Output appears here.');
    body.append(m.out);
  }
  const card = h('div', { class: 'card' }, header, body);
  (card as HTMLElement & { dragHandle?: HTMLElement }).dragHandle = header;
  return card;
}

interface Controls {
  ta: HTMLTextAreaElement;
  action: HTMLSelectElement;
  lang: HTMLSelectElement;
  replace: HTMLInputElement;
  run: HTMLButtonElement;
  sync: () => void;
}

function buildInputPart(def: WidgetDef, m: Mounted, ctx: WidgetCtx): HTMLElement[] {
  const ta = h('textarea', { rows: '1', placeholder: 'Select text on the page, or type here…' });
  const autoSize = () => {
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight + 2, 140)}px`;
  };
  ta.addEventListener('input', autoSize);

  const action = h('select', { title: 'Action' }, ...ACTION_ORDER.map((a) => h('option', { value: a }, ACTION_SHORT[a])));
  action.value = def.action ?? 'summarize';
  // Translate -> "translate to <language>". Every other action -> "answer in <language>" (Auto = same as the text).
  const lang = h('select', { title: 'Language' });
  const fillLangs = () => {
    const isTranslate = action.value === 'translate';
    lang.title = isTranslate ? 'Translate to' : 'Answer language';
    lang.replaceChildren(
      ...(isTranslate ? [] : [h('option', { value: '' }, 'Auto language')]),
      ...LANGUAGES.map((l) => h('option', { value: l }, l)),
    );
    lang.value = isTranslate ? (def.language ?? 'English') : (def.outLang ?? '');
  };
  const replace = h('input', { type: 'checkbox', checked: def.replaceOnPage !== false });
  const replaceWrap = h('label', { class: 'chk', title: 'Put the translation back into the page text' }, replace, 'Replace on page');
  const run = h('button', { class: 'run', type: 'button' });

  const sync = () => {
    const isTranslate = action.value === 'translate';
    fillLangs();
    lang.style.display = action.value === 'ask' || action.value === 'person' || action.value === 'company' ? 'none' : '';
    replaceWrap.style.display = isTranslate ? '' : 'none';
    run.textContent = `${ACTION_SHORT[action.value as ActionId]} →`;
  };
  action.addEventListener('change', () => {
    def.action = action.value as ActionId;
    sync();
    void ctx.persist();
  });
  lang.addEventListener('change', () => {
    if (action.value === 'translate') def.language = lang.value;
    else def.outLang = lang.value;
    void ctx.persist();
  });
  replace.addEventListener('change', () => {
    def.replaceOnPage = replace.checked;
    void ctx.persist();
  });
  sync();

  m.fill = (text) => {
    ta.value = text;
    autoSize();
  };

  const ui: Controls = { ta, action, lang, replace, run, sync };
  run.addEventListener('click', () => void runWidget(m, ui, ctx));
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void runWidget(m, ui, ctx);
  });
  return [ta, h('div', { class: 'row' }, action, lang, replaceWrap, run)];
}

/** Where should the answer appear? own output -> an AI Output box on the page -> a box under the input. */
function resolveTarget(m: Mounted, ctx: WidgetCtx): HTMLElement {
  if (m.out) return m.out;
  const outs = ctx.outputs();
  if (outs.length) return outs[outs.length - 1];
  if (!m.inlineOut) {
    m.inlineOut = h('div', { class: 'out empty' });
    m.body?.append(m.inlineOut);
  }
  return m.inlineOut;
}

async function runWidget(m: Mounted, ui: Controls, ctx: WidgetCtx): Promise<void> {
  const snap = getSnapshot();
  const action = ui.action.value as ActionId;
  const text = ui.ta.value.trim();
  const target = resolveTarget(m, ctx);

  const needsText = action !== 'summarize' && action !== 'extract';
  if (needsText && !text) {
    renderError(target, action === 'ask' ? 'Type your question in the box first.' : 'Select text on the page, or type it in the box, first.');
    return;
  }

  ui.run.disabled = true;
  ui.run.textContent = 'Working…';
  renderLoading(target);

  const page = collectPage();
  const payload: AIRequestPayload = {
    action,
    scope: 'auto',
    page: { url: page.url, title: page.title, description: page.description, text: page.text },
    target_language: action === 'translate' ? ui.lang.value || 'English' : ui.lang.value || undefined,
  };
  if (action === 'ask') {
    payload.prompt = text;
    if (snap.text) payload.selected_text = snap.text;
  } else if (text) {
    payload.selected_text = text;
    payload.scope = 'selection';
  } else {
    payload.scope = 'page';
  }

  try {
    const res = await rpc<AIResponse>({ type: 'ORBIT_RUN_ACTION', payload });
    const extras: Node[] = [];
    if (action === 'translate' && ui.replace.checked) {
      const r =
        text === snap.text
          ? replaceSelection(res.result.content, snap)
          : { ok: false, message: 'Shown here only - "Replace on page" needs text selected on the page.' };
      const note = h('div', { class: r.ok ? 'note' : 'note bad' }, h('span', {}, r.message));
      if (r.ok) {
        const undo = h('button', { class: 'mini', type: 'button' }, 'Undo');
        undo.addEventListener('click', () => note.replaceChildren(h('span', {}, undoReplace().message)));
        note.append(undo);
      }
      extras.push(note);
    }
    renderResult(target, res, extras);
  } catch (e) {
    renderError(target, e instanceof Error ? e.message : String(e));
  } finally {
    ui.run.disabled = false;
    ui.sync();
  }
}
