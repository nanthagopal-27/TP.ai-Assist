import type { FormField, WidgetDef, WidgetKind, WidgetMode, WidgetProps } from './types';
import { INDIA_STATES, PRODUCT_NAME, slug } from './config';
import { normalizeUrl } from './utils';

/** Component palette metadata shared by the side panel and the on-page toolbar (icons live in the side panel). */
export interface ComponentMeta {
  kind: WidgetKind;
  label: string;
  hint: string;
  group: 'Inputs' | 'Actions & data' | 'AI';
}

export const COMPONENT_META: ComponentMeta[] = [
  { kind: 'text', label: 'Text Input', hint: 'Single-line field', group: 'Inputs' },
  { kind: 'textarea', label: 'Text Area', hint: 'Multi-line field', group: 'Inputs' },
  { kind: 'dropdown', label: 'Dropdown', hint: 'Pick from a list', group: 'Inputs' },
  { kind: 'checkbox', label: 'Checkbox', hint: 'Yes / no tick box', group: 'Inputs' },
  { kind: 'radio', label: 'Radio Group', hint: 'Choose one option', group: 'Inputs' },
  { kind: 'form', label: 'Form', hint: 'Fields + Submit', group: 'Actions & data' },
  { kind: 'button', label: 'Link Button', hint: 'Opens any link', group: 'Actions & data' },
  { kind: 'action', label: 'Action Button', hint: 'Escalate: asks e-mail, sends it', group: 'Actions & data' },
  { kind: 'weather', label: 'Weather', hint: 'Pick a state, see weather', group: 'Actions & data' },
  { kind: 'ocr', label: 'OCR', hint: 'Drag over an image, extract text', group: 'AI' },
  { kind: 'ids', label: 'Get IDs', hint: 'Pulls case/order/ticket IDs off this page', group: 'AI' },
  { kind: 'input', label: 'AI Input', hint: 'Summarize, translate…', group: 'AI' },
  { kind: 'output', label: 'AI Output', hint: 'Shows AI answers', group: 'AI' },
];

/** What the user edits in the properties panel. */
export interface Draft {
  kind: WidgetKind;
  mode: WidgetMode;
  props: WidgetProps;
  label: string;
  url: string;
  newTab: boolean;
  /** set while editing an already-placed widget */
  editingId?: string;
}

export const EMAIL_RE = /^[A-Za-z0-9._%+\-']+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

/** Kinds whose defaults aren't valid to place as-is (e.g. a button needs a link, a form needs
 *  fields) - these always open the properties panel for setup before placement, in both the
 *  on-page toolbar and the side panel. Every other kind can be placed immediately with its
 *  defaults and edited afterward via the hover toolbar. */
export const NEEDS_SETUP_FIRST = new Set<WidgetKind>(['button', 'form']);

export const newFieldId = () => `f_${Math.random().toString(36).slice(2, 8)}`;

export function defaultsFor(kind: WidgetKind): Draft {
  const base: Draft = { kind, mode: 'inline', props: {}, label: '', url: '', newTab: true };
  switch (kind) {
    case 'text': return { ...base, props: { label: 'Text field', name: 'text_field', placeholder: 'Enter value…' } };
    case 'textarea': return { ...base, props: { label: 'Text area', name: 'text_area', placeholder: 'Enter details…' } };
    case 'dropdown': return { ...base, props: { label: 'Dropdown', name: 'dropdown', options: ['Option 1', 'Option 2', 'Option 3'] } };
    case 'checkbox': return { ...base, props: { label: 'I agree', name: 'checkbox' } };
    case 'radio': return { ...base, props: { label: 'Choose one', name: 'radio', options: ['Yes', 'No'] } };
    case 'weather': return { ...base, props: { label: 'Weather', locations: [...INDIA_STATES], units: 'c' } };
    case 'button': return { ...base, label: 'Open link' };
    case 'ocr': return { ...base, props: { label: 'OCR', ocrEngine: 'ai' } };
    case 'ids': return { ...base, label: 'Get IDs on this page' };
    case 'action':
      return {
        ...base,
        props: {
          label: 'Escalate',
          variant: 'dark',
          askRecipient: true,
          recipient: '',
          askNote: true,
          subject: 'Escalation: {{page_title}}',
          body:
            'Hello,\n\nThis item needs your attention.\n\nPage: {{page_title}}\nLink: {{page_url}}\n\n' +
            `Selected text:\n{{selection}}\n\nNote from sender:\n{{note}}\n\nSent with ${PRODUCT_NAME} on {{date}}.`,
          successMessage: 'Escalation e-mail sent.',
        },
      };
    case 'form':
      return {
        ...base,
        props: {
          title: 'Contact form',
          submitLabel: 'Submit',
          successMessage: 'Thank you! Your response has been recorded.',
          fields: [
            { id: newFieldId(), type: 'text', label: 'Name', name: 'name', placeholder: 'Your name', required: true },
            { id: newFieldId(), type: 'text', label: 'Email', name: 'email', placeholder: 'name@company.com', required: true, pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
            { id: newFieldId(), type: 'textarea', label: 'Message', name: 'message', placeholder: 'How can we help?' },
          ],
        },
      };
    default: return base;
  }
}

export function draftFromWidget(w: WidgetDef): Draft {
  return {
    kind: w.kind,
    mode: w.mode,
    props: structuredClone(w.props ?? {}),
    label: w.label ?? '',
    url: w.url ?? '',
    newTab: w.newTab ?? true,
    editingId: w.id,
  };
}

export const needsOptions = (k: WidgetKind) => k === 'dropdown' || k === 'radio';
export const isFieldKind = (k: WidgetKind) => ['text', 'textarea', 'dropdown', 'checkbox', 'radio'].includes(k);

/** Human-readable problems that block Place / Save. */
export function draftIssues(d: Draft): string[] {
  const issues: string[] = [];
  const p = d.props;
  if (isFieldKind(d.kind)) {
    if (!p.label?.trim()) issues.push('Label is required.');
    if (!p.name?.trim()) issues.push('Field name is required.');
    if (needsOptions(d.kind) && !(p.options ?? []).filter(Boolean).length) issues.push('Add at least one option.');
    if (p.pattern) {
      try { new RegExp(p.pattern); } catch { issues.push('Regex pattern is not valid.'); }
    }
    if (p.minLen && p.maxLen && p.minLen > p.maxLen) issues.push('Min length is larger than max length.');
  }
  if (d.kind === 'button') {
    if (!d.label.trim()) issues.push('Button label is required.');
    if (!normalizeUrl(d.url)) issues.push('Enter a valid http(s) link.');
  }
  if (d.kind === 'action') {
    if (!p.label?.trim()) issues.push('Button label is required.');
    if (!p.subject?.trim()) issues.push('E-mail subject is required.');
    if (!p.body?.trim()) issues.push('E-mail body is required.');
    if (p.askRecipient === false && !EMAIL_RE.test((p.recipient ?? '').trim())) issues.push('Enter a valid fixed recipient e-mail (or tick "Ask for the e-mail address").');
  }
  if (d.kind === 'weather' && !(p.locations ?? []).filter(Boolean).length) issues.push('Add at least one location.');
  if (d.kind === 'form') {
    const fields = p.fields ?? [];
    if (!fields.length) issues.push('Add at least one field to the form.');
    const names = fields.map((f) => f.name.trim());
    if (names.some((n) => !n)) issues.push('Every field needs a field name.');
    if (new Set(names).size !== names.length) issues.push('Field names must be unique.');
    if (fields.some((f) => !f.label.trim())) issues.push('Every field needs a label.');
    if (fields.some((f) => (f.type === 'dropdown' || f.type === 'radio') && !(f.options ?? []).filter(Boolean).length)) issues.push('Dropdown / radio fields need options.');
    if (p.continueUrl && !normalizeUrl(p.continueUrl)) issues.push('"Continue" link is not a valid http(s) URL.');
  }
  return issues;
}

/** Clean up a draft before sending it to the page. */
export function finalizeDraft(d: Draft): Draft {
  const props: WidgetProps = structuredClone(d.props);
  if (props.options) props.options = props.options.map((o) => o.trim()).filter(Boolean);
  if (props.locations) props.locations = props.locations.map((o) => o.trim()).filter(Boolean);
  if (props.name) props.name = props.name.trim();
  if (props.fields) {
    props.fields = props.fields.map((f): FormField => ({
      ...f,
      name: f.name.trim() || slug(f.label),
      options: f.options?.map((o) => o.trim()).filter(Boolean),
    }));
  }
  return { ...d, props, label: d.label.trim(), url: d.url.trim() };
}


export { slug };
