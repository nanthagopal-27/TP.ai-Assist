import type { FieldProps, FieldType } from '../../shared/types';
import { h } from '../dom';

export interface FieldSpec extends FieldProps {
  type: FieldType;
  label: string;
  name: string;
}

export interface FieldControl {
  root: HTMLElement;
  spec: FieldSpec;
  get: () => string;
  set: (v: string) => void;
  /** returns an error message (and shows it when `show`), or null when valid */
  validate: (show?: boolean) => string | null;
  reset: () => void;
}

let uid = 0;

/** One form control (text / textarea / dropdown / checkbox / radio) with label, help text and validation. */
export function buildField(spec: FieldSpec): FieldControl {
  const id = `tpf${++uid}`;
  const errEl = h('div', { class: 'err' });
  errEl.style.display = 'none';
  const label = h('label', { class: 'lbl', for: id }, spec.label, spec.required ? h('span', { class: 'req' }, '*') : null);
  const help = spec.helpText ? h('div', { class: 'help' }, spec.helpText) : null;
  const def = spec.defaultValue ?? '';

  let control: HTMLElement;
  let get: () => string;
  let set: (v: string) => void;
  let showLabel = true;
  let touched = false;

  switch (spec.type) {
    case 'textarea': {
      const el = h('textarea', { id, rows: '3', placeholder: spec.placeholder });
      el.value = def;
      control = el;
      get = () => el.value;
      set = (v) => (el.value = v);
      break;
    }
    case 'dropdown': {
      const el = h(
        'select',
        { id },
        h('option', { value: '' }, spec.placeholder || 'Select…'),
        ...(spec.options ?? []).map((o) => h('option', { value: o }, o)),
      );
      el.value = def;
      control = el;
      get = () => el.value;
      set = (v) => (el.value = v);
      break;
    }
    case 'checkbox': {
      const el = h('input', { type: 'checkbox', id, checked: def === 'true' });
      control = h('label', { class: 'chk', for: id }, el, spec.label, spec.required ? h('span', { class: 'req' }, '*') : null);
      showLabel = false;
      get = () => (el.checked ? 'true' : 'false');
      set = (v) => (el.checked = v === 'true');
      break;
    }
    case 'radio': {
      const group = `r${id}`;
      const radios = (spec.options ?? []).map((o) => h('input', { type: 'radio', name: group, value: o, checked: o === def }));
      control = h(
        'div',
        { class: 'radios', id },
        ...radios.map((r, i) => h('label', { class: 'chk' }, r, (spec.options ?? [])[i])),
      );
      get = () => radios.find((r) => r.checked)?.value ?? '';
      set = (v) => radios.forEach((r) => (r.checked = r.value === v));
      break;
    }
    default: {
      const el = h('input', { type: 'text', id, placeholder: spec.placeholder });
      el.value = def;
      control = el;
      get = () => el.value;
      set = (v) => (el.value = v);
    }
  }

  const validate = (show = true): string | null => {
    const v = get();
    let msg: string | null = null;
    if (spec.type === 'checkbox') {
      if (spec.required && v !== 'true') msg = 'This box must be checked.';
    } else if (spec.required && !v.trim()) {
      msg = 'This field is required.';
    } else if (v) {
      if (spec.minLen && v.length < spec.minLen) msg = `Minimum ${spec.minLen} characters.`;
      else if (spec.maxLen && v.length > spec.maxLen) msg = `Maximum ${spec.maxLen} characters.`;
      else if (spec.pattern) {
        try {
          if (!new RegExp(spec.pattern).test(v)) msg = 'Invalid format.';
        } catch {
          /* bad pattern configured - ignore */
        }
      }
    }
    if (show) {
      errEl.textContent = msg ?? '';
      errEl.style.display = msg ? '' : 'none';
      control.classList.toggle('invalid', !!msg);
    }
    return msg;
  };

  const touch = () => {
    touched = true;
    validate(true);
  };
  control.addEventListener('focusout', touch);
  control.addEventListener('change', touch);
  control.addEventListener('input', () => touched && validate(true));

  const root = h('div', { class: 'field' }, showLabel ? label : null, control, help, errEl);
  return {
    root,
    spec,
    get,
    set,
    validate,
    reset: () => {
      set(def);
      touched = false;
      errEl.style.display = 'none';
      control.classList.remove('invalid');
    },
  };
}
