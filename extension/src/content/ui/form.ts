import type { FormField, WidgetDef } from '../../shared/types';
import { slug } from '../../shared/config';
import { normalizeUrl } from '../../shared/utils';
import { h } from '../dom';
import { rpc } from '../messaging';
import { buildField, type FieldControl } from './fields';

/** A form made of several fields with Submit. Submissions are saved in the local SQLite database. */
export function buildForm(def: WidgetDef): HTMLElement {
  const p = def.props ?? {};
  const fields: FormField[] = p.fields ?? [];
  const root = h('div', { class: 'cmp form' });

  const showForm = () => {
    const controls: FieldControl[] = fields.map((f) => buildField({ ...f, name: f.name || slug(f.label) }));
    const status = h('div', { class: 'err' });
    status.style.display = 'none';
    const submit = h('button', { class: 'run full', type: 'button' }, p.submitLabel || 'Submit');

    submit.addEventListener('click', async () => {
      const errors = controls.map((c) => c.validate(true)).filter(Boolean);
      if (errors.length) {
        status.textContent = 'Please fix the highlighted fields.';
        status.style.display = '';
        return;
      }
      status.style.display = 'none';
      submit.disabled = true;
      submit.textContent = 'Submitting…';
      const data: Record<string, string> = {};
      controls.forEach((c) => (data[c.spec.name] = c.get()));
      try {
        await rpc({
          type: 'ORBIT_API_CALL',
          path: '/api/submissions',
          method: 'POST',
          body: {
            form_title: p.title || 'Form',
            widget_id: def.id,
            page_url: location.href,
            page_title: document.title,
            data,
          },
        });
        showSuccess(controls);
      } catch (e) {
        status.textContent = e instanceof Error ? e.message : String(e);
        status.style.display = '';
        submit.disabled = false;
        submit.textContent = p.submitLabel || 'Submit';
      }
    });

    root.replaceChildren(
      ...(p.title ? [h('div', { class: 'form-title' }, p.title)] : []),
      ...controls.map((c) => c.root),
      status,
      submit,
    );
  };

  const showSuccess = (controls: FieldControl[]) => {
    const next = normalizeUrl(p.continueUrl ?? '');
    const again = h('button', { class: 'mini', type: 'button' }, 'Submit another');
    again.addEventListener('click', showForm);
    const cont = next ? h('button', { class: 'link', type: 'button' }, 'Continue ↗') : null;
    cont?.addEventListener('click', () => window.open(next!, '_blank', 'noopener,noreferrer'));
    root.replaceChildren(
      h('div', { class: 'ok' }, h('span', { class: 'tick' }, '✓'), p.successMessage || 'Thank you! Your response has been recorded.'),
      h(
        'table',
        { class: 'sumtbl' },
        h('tbody', {}, ...controls.map((c) => h('tr', {}, h('td', {}, c.spec.label), h('td', {}, c.get() || '—')))),
      ),
      h('div', { class: 'row' }, again, cont),
    );
  };

  if (!fields.length) root.append(h('div', { class: 'dim' }, 'This form has no fields yet. Click Edit to add some.'));
  else showForm();
  return root;
}
