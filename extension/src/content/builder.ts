/**
 * On-page widget builder: a dark toolbar at the top of the website (like PixieBrix's "Sidebar Widget Builder")
 * with one chip per component. Click a chip -> a properties card opens under it -> "Place on page" ->
 * click anywhere on the website. Hover a placed widget and press "Edit" to change its details here too.
 *
 * Lives in a shadow root, builds DOM with h() only (no innerHTML) so page CSP / CSS cannot break it.
 */
import type { FieldType, FormField, WidgetProps } from '../shared/types';
import { INDIA_STATES, PRODUCT_NAME, STORAGE_KEYS, slug } from '../shared/config';
import { normalizeUrl } from '../shared/utils';
import {
  COMPONENT_META, defaultsFor, draftFromWidget, draftIssues, finalizeDraft, isFieldKind, needsOptions, newFieldId,
  type Draft,
} from '../shared/draft';
import { attachStyles, h, HOST_ATTR } from './dom';
import { WIDGET_CSS, TOOLBAR_CSS } from './styles';
import { beginDragPlacement, getWidgetDef, hooks, NEEDS_SETUP_FIRST, updateWidget } from './widgets';

const GLYPH: Record<string, string> = {
  text: 'Tт', textarea: '¶', dropdown: '▾', checkbox: '☑', radio: '◉', form: '▤', button: '▭', weather: '☀', input: '✦', output: '▢', action: '✉', ocr: '▣', ids: '#',
};
const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text Input' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'radio', label: 'Radio Group' },
];

const intOrUndef = (v: string): number | undefined => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// ---------------------------------------------------------------------------------------------- tiny form helpers
function group(label: string, control: HTMLElement, help?: string): HTMLElement {
  return h('label', { class: 'fg' }, h('span', { class: 'fl' }, label), control, help ? h('span', { class: 'fh' }, help) : null);
}
function textInput(value: string, onInput: (v: string) => void, placeholder = ''): HTMLInputElement {
  const i = h('input', { type: 'text', placeholder });
  i.value = value;
  i.addEventListener('input', () => onInput(i.value));
  return i;
}
function areaInput(value: string, onInput: (v: string) => void, rows = 4): HTMLTextAreaElement {
  const t = h('textarea', { rows: String(rows) });
  t.value = value;
  t.addEventListener('input', () => onInput(t.value));
  return t;
}
function checkInput(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const c = h('input', { type: 'checkbox' });
  c.checked = checked;
  c.addEventListener('change', () => onChange(c.checked));
  return h('label', { class: 'chk' }, c, label);
}
function selectInput(options: { value: string; label: string }[], value: string, onChange: (v: string) => void): HTMLSelectElement {
  const s = h('select', {}, ...options.map((o) => h('option', { value: o.value }, o.label)));
  s.value = value;
  s.addEventListener('change', () => onChange(s.value));
  return s;
}
const section = (t: string) => h('div', { class: 'sec' }, t);

// ---------------------------------------------------------------------------------------------- the builder
export function initToolbar(): void {
  let visible = false;
  let draft: Draft | null = null;
  let placing = false;
  let showPanelErrors: (list: string[]) => void = () => undefined;

  const host = h('div', { [HOST_ATTR]: 'toolbar' });
  host.style.cssText =
    'all:initial;position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483646;display:none;' +
    'flex-direction:column;align-items:center;max-width:calc(100vw - 16px);';
  const root = host.attachShadow({ mode: 'open' });
  attachStyles(root, WIDGET_CSS + TOOLBAR_CSS);

  // keep keystrokes / clicks inside the toolbar away from the page's own hotkeys and handlers
  for (const t of ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'])
    host.addEventListener(t, (e) => e.stopPropagation());

  // ---- chip bar
  const chips = new Map<string, HTMLButtonElement>();
  const bar = h('div', { class: 'tbar' });
  bar.append(h('div', { class: 'tbrand', title: `${PRODUCT_NAME} - widget builder` }, h('span', { class: 'dot' }), 'Widgets'));
  const scroller = h('div', { class: 'chips' });
  for (const m of COMPONENT_META) {
    const b = h('button', { class: 'chip', type: 'button', title: m.hint }, h('span', { class: 'g' }, GLYPH[m.kind] ?? '•'), m.label);
    // Press and drag the chip straight onto the page to place it in one motion - live
    // highlight/insertion-line overlay, same as dragging an existing widget to move it. Uses
    // whatever's currently filled in the panel below if it's open for this same kind (so Link
    // Button / Form can be configured first, then dragged), otherwise plain defaults.
    let suppressNextClick = false;
    b.addEventListener('pointerdown', (e: PointerEvent) => {
      const usingOpenDraft = draft && draft.kind === m.kind && !draft.editingId;
      const source = usingOpenDraft ? draft! : defaultsFor(m.kind);
      if (usingOpenDraft) {
        // Richer, per-field validation (duplicate names, bad regex, etc.) - placementIssue()
        // inside beginDragPlacement only does the bare minimum (e.g. "has a URL at all").
        const issues = draftIssues(source);
        if (issues.length) {
          showPanelErrors(issues);
          return;
        }
      }
      const f = finalizeDraft(source);
      const r = beginDragPlacement(
        { kind: f.kind, mode: f.mode, props: f.props, label: f.label, url: f.url, newTab: f.newTab },
        b,
        e,
        m.label,
        (didDrag) => (suppressNextClick = didDrag),
      );
      if (!r.ok && draft?.kind === m.kind) showPanelErrors([r.message ?? 'Could not place it.']);
    });
    // A plain click (no real drag - suppressNextClick stays false) opens the properties panel
    // only for kinds that actually need setup first; everything else places purely by dragging.
    // If the panel's already open for this kind (e.g. a failed drag attempt above just showed a
    // validation error), leave it as-is rather than resetting the user's in-progress edits.
    b.addEventListener('click', () => {
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      if (NEEDS_SETUP_FIRST.has(m.kind) && !(draft && draft.kind === m.kind && !draft.editingId)) {
        openDraft(defaultsFor(m.kind));
      }
    });
    chips.set(m.kind, b);
    scroller.append(b);
  }
  const closeBar = h('button', { class: 'xbtn', type: 'button', title: 'Hide toolbar' }, '×');
  closeBar.addEventListener('click', () => {
    void chrome.storage.local.set({ [STORAGE_KEYS.toolbar]: false });
    setVisible(false);
  });
  bar.append(scroller, closeBar);

  // ---- properties panel
  const panel = h('div', { class: 'panel' });
  panel.style.display = 'none';
  root.append(bar, panel);
  document.documentElement.appendChild(host);

  // ------------------------------------------------------------------ visibility
  function setVisible(v: boolean): void {
    visible = v;
    host.style.display = v && !placing ? 'flex' : 'none';
    if (!v) {
      draft = null;
      panel.style.display = 'none';
    }
  }
  hooks.onPlacementEnd = () => {
    placing = false;
    closePanel();
    setVisible(visible);
  };
  hooks.onDragPlacementStart = () => {
    host.style.display = 'none';
  };
  hooks.onDragPlacementEnd = () => {
    setVisible(visible);
  };
  hooks.onEdit = (id) => {
    const def = getWidgetDef(id);
    if (!def) return;
    void chrome.storage.local.set({ [STORAGE_KEYS.toolbar]: true });
    visible = true;
    placing = false;
    host.style.display = 'flex';
    openDraft(draftFromWidget(def));
  };

  void chrome.storage.local.get(STORAGE_KEYS.toolbar).then((s) => setVisible(s[STORAGE_KEYS.toolbar] === true)).catch(() => undefined);
  chrome.storage.onChanged.addListener((chg, area) => {
    if (area === 'local' && chg[STORAGE_KEYS.toolbar]) setVisible(chg[STORAGE_KEYS.toolbar].newValue === true);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && draft && !placing) closePanel();
  });

  function closePanel(): void {
    draft = null;
    panel.style.display = 'none';
    chips.forEach((c) => c.classList.remove('on'));
  }

  // ------------------------------------------------------------------ open a draft in the panel
  function openDraft(d: Draft): void {
    draft = d;
    chips.forEach((c, k) => c.classList.toggle('on', k === d.kind && !d.editingId));
    renderPanel();
    panel.style.display = 'flex';
  }

  function renderPanel(): void {
    const d = draft;
    if (!d) return;
    const meta = COMPONENT_META.find((m) => m.kind === d.kind);
    const editing = !!d.editingId;

    const close = h('button', { class: 'xbtn dark', type: 'button', title: 'Close' }, '×');
    close.addEventListener('click', closePanel);
    const head = h(
      'div',
      { class: 'phead' },
      h('span', { class: 'pg' }, GLYPH[d.kind] ?? '•'),
      h(
        'div',
        { class: 'pt' },
        `${editing ? 'Edit ' : ''}${meta?.label ?? 'AI box'}`,
        h('div', { class: 'ps' }, editing ? 'Change the details, then save.' : `Drag the ${meta?.label ?? 'chip'} above onto the page to place it.`),
      ),
      close,
    );

    const body = h('div', { class: 'pbody' });
    body.append(...propsForm(d));

    const errors = h('div', { class: 'perr' });
    errors.style.display = 'none';
    const showErrors = (list: string[]) => {
      errors.replaceChildren(...list.map((t) => h('div', {}, `• ${t}`)));
      errors.style.display = list.length ? 'block' : 'none';
    };
    showPanelErrors = showErrors;
    // A failed drag attempt shows an error here, but fixing the drag requires a whole new drag
    // gesture - don't leave a stale "invalid" message up once the user has actually edited
    // something, or it reads as still-broken even after they've fixed it.
    body.addEventListener('input', () => showErrors([]));
    body.addEventListener('change', () => showErrors([]));

    const foot = h('div', { class: 'pfoot' });
    if (!editing) {
      foot.append(h('div', { class: 'fh' }, 'Always placed inline, in the document flow - drag the chip to position it anywhere on the page.'));
    } else {
      const cancel = h('button', { class: 'ghost', type: 'button' }, 'Cancel');
      cancel.addEventListener('click', closePanel);
      const save = h('button', { class: 'primary', type: 'button' }, 'Save changes');
      save.addEventListener('click', () => {
        const issues = draftIssues(d);
        showErrors(issues);
        if (issues.length) return;
        const f = finalizeDraft(d);
        const r = updateWidget(d.editingId!, { props: f.props, label: f.label, url: f.url, newTab: f.newTab });
        if (!r.ok) return showErrors([r.message ?? 'Could not save.']);
        closePanel();
      });
      foot.append(cancel, save);
    }

    panel.replaceChildren(head, body, errors, foot);
  }

  // ------------------------------------------------------------------ per-component property forms
  function propsForm(d: Draft): HTMLElement[] {
    const p: WidgetProps = d.props;

    if (d.kind === 'input' || d.kind === 'output') {
      return [
        h(
          'div',
          { class: 'info' },
          d.kind === 'input'
            ? 'A text box with an action menu (Summarize, Translate, Explain, Extract, Person, Company, Ask AI). Highlighted text on the page fills it automatically.'
            : 'A box that shows the answers of any AI Input on the page.',
          ' Nothing to configure - just place it.',
        ),
      ];
    }

    if (d.kind === 'ids') {
      return [
        group('Button label', textInput(d.label, (v) => (d.label = v), 'Get IDs on this page')),
        h('div', { class: 'info' }, 'Pulls case/order/ticket/reference-style IDs straight off the current page - no selection needed, just place it and click.'),
      ];
    }

    if (d.kind === 'button') {
      const hint = h('span', { class: 'fh' });
      const upd = () => {
        const n = normalizeUrl(d.url);
        hint.textContent = d.url.trim() ? (n ? `Opens: ${n}` : 'Enter a valid http(s) link') : 'Paste any link - clicking the button opens it';
      };
      upd();
      const url = textInput(d.url, (v) => { d.url = v; upd(); }, 'https://intranet.company.com/page');
      return [
        group('Button label', textInput(d.label, (v) => (d.label = v), 'Open link')),
        h('label', { class: 'fg' }, h('span', { class: 'fl' }, 'Link (URL)'), url, hint),
        checkInput('Open in a new tab', d.newTab, (v) => (d.newTab = v)),
      ];
    }

    if (d.kind === 'weather') {
      const defSel = h('select', {});
      const refreshDefault = () => {
        const list = (p.locations ?? []).map((l) => l.trim()).filter(Boolean);
        defSel.replaceChildren(h('option', { value: '' }, 'Default: first in list'), ...list.map((l) => h('option', { value: l }, l)));
        defSel.value = p.defaultLocation && list.includes(p.defaultLocation) ? p.defaultLocation : '';
      };
      const area = areaInput((p.locations ?? []).join('\n'), (v) => { p.locations = v.split('\n'); refreshDefault(); }, 6);
      defSel.addEventListener('change', () => (p.defaultLocation = defSel.value || undefined));
      refreshDefault();
      const all = h('button', { class: 'mini', type: 'button' }, 'All Indian states');
      all.addEventListener('click', () => { p.locations = [...INDIA_STATES]; area.value = p.locations.join('\n'); refreshDefault(); });
      const clear = h('button', { class: 'mini', type: 'button' }, 'Clear');
      clear.addEventListener('click', () => { p.locations = []; area.value = ''; refreshDefault(); });
      return [
        group('Title', textInput(p.label ?? '', (v) => (p.label = v))),
        section('Dropdown data'),
        group('States / places (one per line)', area, 'Indian states work instantly; any other city name is looked up online.'),
        h('div', { class: 'rowb' }, all, clear),
        group('Default location', defSel),
        group('Units', selectInput([{ value: 'c', label: '°C' }, { value: 'f', label: '°F' }], p.units ?? 'c', (v) => (p.units = v as 'c' | 'f'))),
      ];
    }

    if (d.kind === 'form') return formForm(d);

    if (d.kind === 'ocr') {
      return [
        group('Title', textInput(p.label ?? '', (v) => (p.label = v))),
        group(
          'OCR engine',
          selectInput(
            [
              { value: 'local', label: 'Offline (built in, English, no internet)' },
              { value: 'ai', label: 'AI vision (Copilot Studio via backend, any language)' },
            ],
            p.ocrEngine ?? 'local',
            (v) => (p.ocrEngine = v as 'local' | 'ai'),
          ),
        ),
        h('div', { class: 'info' }, 'On the page: press "Select area", drag a box over any image or text, then press "Extract text".'),
      ];
    }

    if (d.kind === 'action') return actionForm(d);

    if (!isFieldKind(d.kind)) return [];
    const textual = d.kind === 'text' || d.kind === 'textarea';
    const out: HTMLElement[] = [];

    const nameIn = textInput(p.name ?? '', (v) => (p.name = v));
    const labelIn = textInput(p.label ?? '', (v) => {
      const follows = !p.name || p.name === slug(p.label ?? '');
      p.label = v;
      if (follows) {
        p.name = slug(v);
        nameIn.value = p.name;
      }
    });
    out.push(group('Label', labelIn), group('Field name', nameIn, 'Key used when this field is saved (letters, numbers, underscore).'));
    if (textual) out.push(group('Placeholder', textInput(p.placeholder ?? '', (v) => (p.placeholder = v))));

    if (needsOptions(d.kind)) {
      const defSel = h('select', {});
      const refreshDefault = () => {
        const list = (p.options ?? []).map((o) => o.trim()).filter(Boolean);
        defSel.replaceChildren(h('option', { value: '' }, 'Default: none selected'), ...list.map((o) => h('option', { value: o }, o)));
        defSel.value = p.defaultValue && list.includes(p.defaultValue) ? p.defaultValue : '';
      };
      defSel.addEventListener('change', () => (p.defaultValue = defSel.value || undefined));
      refreshDefault();
      out.push(
        section('Options (data)'),
        group('One option per line', areaInput((p.options ?? []).join('\n'), (v) => { p.options = v.split('\n'); refreshDefault(); }, 5)),
        group('Default value', defSel),
      );
    }
    if (textual) out.push(group('Default value', textInput(p.defaultValue ?? '', (v) => (p.defaultValue = v))));
    if (d.kind === 'checkbox') out.push(checkInput('Checked by default', p.defaultValue === 'true', (v) => (p.defaultValue = v ? 'true' : undefined)));

    out.push(
      group('Help text (optional)', textInput(p.helpText ?? '', (v) => (p.helpText = v || undefined))),
      checkInput('Required field', !!p.required, (v) => (p.required = v)),
    );
    if (textual) {
      out.push(
        section('Validation'),
        h(
          'div',
          { class: 'two' },
          group('Min length', textInput(p.minLen ? String(p.minLen) : '', (v) => (p.minLen = intOrUndef(v)))),
          group('Max length', textInput(p.maxLen ? String(p.maxLen) : '', (v) => (p.maxLen = intOrUndef(v)))),
        ),
        group('Regex pattern', textInput(p.pattern ?? '', (v) => (p.pattern = v || undefined), 'e.g. ^[A-Z]{2}\\d{4}$')),
      );
    }
    return out;
  }

  // ------------------------------------------------------------------ action button (Escalate): e-mail settings
  function actionForm(d: Draft): HTMLElement[] {
    const p = d.props;
    const recip = textInput(p.recipient ?? '', (v) => (p.recipient = v), 'boss@company.com');
    const syncRecip = () => {
      recip.disabled = p.askRecipient !== false;
      recip.style.opacity = recip.disabled ? '.5' : '1';
    };
    syncRecip();
    return [
      group('Button label', textInput(p.label ?? '', (v) => (p.label = v), 'Escalate')),
      group('Button style', selectInput([{ value: 'dark', label: 'Dark' }, { value: 'outline', label: 'Outline' }, { value: 'red', label: 'Red' }], p.variant ?? 'dark', (v) => (p.variant = v as 'dark' | 'outline' | 'red'))),
      section('Who gets the e-mail'),
      checkInput('Ask for the e-mail address when the button is clicked', p.askRecipient !== false, (v) => { p.askRecipient = v; syncRecip(); }),
      group('Fixed recipient (when not asking)', recip),
      checkInput('Let the sender add a note', !!p.askNote, (v) => (p.askNote = v)),
      section('E-mail content'),
      group('Subject', textInput(p.subject ?? '', (v) => (p.subject = v))),
      group('Body', areaInput(p.body ?? '', (v) => (p.body = v), 9), 'Placeholders: {{email}} {{note}} {{page_title}} {{page_url}} {{selection}} {{date}} {{time}}'),
      group('Message after sending', textInput(p.successMessage ?? '', (v) => (p.successMessage = v))),
      h('div', { class: 'fh' }, 'The e-mail is sent by the backend (SMTP settings in backend/.env).'),
    ];
  }

  // ------------------------------------------------------------------ form: fields list + after-submit
  function formForm(d: Draft): HTMLElement[] {
    const p = d.props;
    p.fields ??= [];
    const list = h('div', { class: 'flist' });

    const renderList = () => {
      const fields = p.fields!;
      list.replaceChildren(
        ...fields.map((f, i) => {
          const patch = (x: Partial<FormField>) => Object.assign(f, x);
          const nameIn = textInput(f.name, (v) => (f.name = v));
          const labelIn = textInput(f.label, (v) => {
            if (f.name === slug(f.label)) {
              f.name = slug(v);
              nameIn.value = f.name;
            }
            f.label = v;
          });
          const mv = (dir: -1 | 1) => {
            const j = i + dir;
            if (j < 0 || j >= fields.length) return;
            [fields[i], fields[j]] = [fields[j], fields[i]];
            renderList();
          };
          const up = h('button', { class: 'ico', type: 'button', title: 'Move up' }, '↑');
          const down = h('button', { class: 'ico', type: 'button', title: 'Move down' }, '↓');
          const del = h('button', { class: 'ico', type: 'button', title: 'Delete field' }, '🗑');
          up.addEventListener('click', () => mv(-1));
          down.addEventListener('click', () => mv(1));
          del.addEventListener('click', () => { fields.splice(i, 1); renderList(); });
          const typeSel = selectInput(FIELD_TYPES, f.type, (v) => {
            patch({ type: v as FieldType });
            if ((v === 'dropdown' || v === 'radio') && !(f.options ?? []).length) f.options = ['Option 1', 'Option 2'];
            renderList();
          });
          return h(
            'div',
            { class: 'fcard' },
            h('div', { class: 'fchead' }, h('span', { class: 'fcn' }, `${i + 1}.`), typeSel, up, down, del),
            h('div', { class: 'two' }, group('Label', labelIn), group('Field name', nameIn)),
            f.type === 'text' || f.type === 'textarea' ? group('Placeholder', textInput(f.placeholder ?? '', (v) => (f.placeholder = v))) : null,
            f.type === 'dropdown' || f.type === 'radio'
              ? group('Options (one per line)', areaInput((f.options ?? []).join('\n'), (v) => (f.options = v.split('\n')), 3))
              : null,
            f.type === 'text' || f.type === 'textarea'
              ? group('Regex pattern (optional)', textInput(f.pattern ?? '', (v) => (f.pattern = v || undefined)))
              : null,
            checkInput('Required field', !!f.required, (v) => (f.required = v)),
          );
        }),
      );
    };
    renderList();

    let newType: FieldType = 'text';
    const typePick = selectInput(FIELD_TYPES, 'text', (v) => (newType = v as FieldType));
    const add = h('button', { class: 'mini big', type: 'button' }, '+ Add field');
    add.addEventListener('click', () => {
      const label = FIELD_TYPES.find((t) => t.value === newType)!.label;
      let name = slug(label);
      let n = 2;
      while (p.fields!.some((f) => f.name === name)) name = `${slug(label)}_${n++}`;
      p.fields!.push({
        id: newFieldId(), type: newType, label, name,
        options: newType === 'dropdown' || newType === 'radio' ? ['Option 1', 'Option 2'] : undefined,
      });
      renderList();
    });

    return [
      group('Form title', textInput(p.title ?? '', (v) => (p.title = v))),
      section('Fields'),
      list,
      h('div', { class: 'rowb' }, typePick, add),
      section('After submit'),
      group('Submit button text', textInput(p.submitLabel ?? '', (v) => (p.submitLabel = v), 'Submit')),
      group('Success message', areaInput(p.successMessage ?? '', (v) => (p.successMessage = v), 2)),
      group('Continue link (optional)', textInput(p.continueUrl ?? '', (v) => (p.continueUrl = v || undefined), 'https://intranet.company.com/thanks'), 'Shows a "Continue" button after a successful submit.'),
      h('div', { class: 'fh' }, 'Submissions are saved in the local SQLite database.'),
    ];
  }
}
