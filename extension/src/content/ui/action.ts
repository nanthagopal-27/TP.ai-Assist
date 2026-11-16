import type { WidgetDef } from '../../shared/types';
import { EMAIL_RE } from '../../shared/draft';
import { attachStyles, h, HOST_ATTR } from '../dom';
import { getSnapshot } from '../selection';
import { WIDGET_CSS } from '../styles';

const LAST_EMAIL_KEY = 'orbit.lastEmail';

/** Replace {{page_title}} {{page_url}} {{selection}} {{note}} {{email}} {{date}} {{time}} in a template. */
export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => vars[k.toLowerCase()] ?? '');
}

/**
 * Action button (e.g. "Escalate"): on click it asks for an e-mail address (or uses a fixed recipient), shows the
 * e-mail that will go out and sends it through the backend (SMTP). Subject and body are templates with placeholders.
 */
export function buildAction(def: WidgetDef): HTMLElement {
  const p = def.props ?? {};
  const label = p.label?.trim() || 'Escalate';
  const btn = h('button', { class: `link act ${p.variant ?? 'dark'}`, type: 'button', title: 'Sends an e-mail' }, h('span', { class: 'mi' }, '✉'), label);
  btn.addEventListener('click', () => void openDialog(def, label));
  return h('div', { class: 'btn-cmp' }, btn);
}

async function readLastEmail(): Promise<string> {
  try {
    const r = await chrome.storage.local.get(LAST_EMAIL_KEY);
    return (r[LAST_EMAIL_KEY] as string | undefined) ?? '';
  } catch {
    return '';
  }
}

async function openDialog(def: WidgetDef, label: string): Promise<void> {
  const p = def.props ?? {};
  const ask = p.askRecipient !== false;
  const fixed = (p.recipient ?? '').trim();
  const last = await readLastEmail();

  // Appended to a fresh top-level host, NOT m.host.shadowRoot: that shadow root lives inside the
  // widget's own host, which has its own `position:relative;z-index:1` - that creates a new CSS
  // stacking context, so a z-index inside it can never out-rank OTHER widgets/content on the
  // page no matter how high it's set. A real full-viewport modal needs its own top-level host,
  // same pattern as the picker overlay and area-select already use.
  document.querySelector(`[${HOST_ATTR}="action-dialog"]`)?.remove();
  const dialogHost = h('div', { [HOST_ATTR]: 'action-dialog' });
  dialogHost.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
  const shadow = dialogHost.attachShadow({ mode: 'open' });
  attachStyles(shadow, WIDGET_CSS);

  const snap = getSnapshot();
  const vars = (email: string, note: string): Record<string, string> => ({
    email,
    note: note.trim() || '-',
    page_title: document.title || location.hostname,
    page_url: location.href,
    selection: snap.text?.trim() || '(nothing selected)',
    date: new Date().toLocaleDateString(),
    time: new Date().toLocaleTimeString(),
  });

  const email = h('input', { type: 'email', placeholder: 'name@company.com', autocomplete: 'off' });
  email.value = ask ? last : fixed;
  if (!ask) email.readOnly = true;
  const note = h('textarea', { rows: '2', placeholder: 'Add a short note for the recipient (optional)' });
  const preview = h('pre', { class: 'mail-pre' });
  const err = h('div', { class: 'mail-err', style: 'display:none' });
  const send = h('button', { class: 'run', type: 'button' }, 'Send e-mail');
  const cancel = h('button', { class: 'ghost-btn', type: 'button' }, 'Cancel');
  const close = () => dialogHost.remove();

  const renderPreview = () => {
    const v = vars(email.value.trim() || '(recipient)', note.value);
    preview.textContent = `To: ${email.value.trim() || '(recipient)'}\nSubject: ${fillTemplate(p.subject ?? '', v)}\n\n${fillTemplate(p.body ?? '', v)}`;
  };
  email.addEventListener('input', renderPreview);
  note.addEventListener('input', renderPreview);
  renderPreview();

  const dialogBody = h(
    'div',
    { class: 'dlg-body' },
    h('label', { class: 'fg' }, h('span', { class: 'fl' }, ask ? 'Send to (e-mail address)' : 'Recipient'), email),
    p.askNote ? h('label', { class: 'fg' }, h('span', { class: 'fl' }, 'Note (optional)'), note) : null,
    h('details', { class: 'mail-det' }, h('summary', {}, 'Preview the e-mail'), preview),
    err,
  );
  const dialog = h(
    'div',
    { class: 'dlg', role: 'dialog' },
    h('div', { class: 'dlg-head' }, h('span', { class: 'mi' }, '✉'), label),
    dialogBody,
    h('div', { class: 'dlg-foot' }, cancel, send),
  );
  const modal = h('div', { class: 'modal' }, dialog);
  modal.addEventListener('mousedown', (e) => {
    if (e.target === modal) close();
  });
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && e.target === email) send.click();
  });
  cancel.addEventListener('click', close);

  const showError = (t: string) => {
    err.textContent = t;
    err.style.display = t ? '' : 'none';
  };

  // This widget is no longer offered in the palette (see shared/draft.ts) - there's no backend
  // left to send mail through (a browser extension can't speak SMTP itself). Left here only so
  // any already-placed "Escalate" widget from before still shows a clear message instead of
  // silently doing nothing.
  send.addEventListener('click', () => {
    const to = email.value.trim();
    if (!EMAIL_RE.test(to)) {
      showError('Enter a valid e-mail address, e.g. name@company.com');
      email.focus();
      return;
    }
    showError('Sending e-mail is no longer available - this feature needed a backend that this project no longer has.');
  });

  shadow.appendChild(modal);
  document.documentElement.appendChild(dialogHost);
  (ask ? email : send).focus();
}
