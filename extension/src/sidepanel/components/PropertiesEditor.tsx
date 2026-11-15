import {
  Box, Button, Checkbox, FormControlLabel, MenuItem, Select, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import type { WidgetProps } from '../../shared/types';
import { INDIA_STATES, slug } from '../../shared/config';
import { normalizeUrl } from '../../shared/utils';
import { isFieldKind, needsOptions, type Draft } from '../lib/components';
import FormFieldsEditor from './FormFieldsEditor';

const Section = ({ children }: { children: string }) => (
  <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 0.8, lineHeight: 1.6, mt: 0.5, display: 'block' }}>
    {children}
  </Typography>
);

const num = (v: string): number | undefined => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

interface Props {
  draft: Draft;
  onChange: (d: Draft) => void;
}

/** Property form for the selected component (Label, Field name, Placeholder, Default value, Required, Validation…). */
export default function PropertiesEditor({ draft, onChange }: Props) {
  const p = draft.props;
  const set = (patch: Partial<WidgetProps>) => onChange({ ...draft, props: { ...p, ...patch } });
  const opts = p.options ?? [];

  const setLabel = (label: string) => {
    // keep "Field name" in sync with the label until the user edits it by hand
    const follows = !p.name || p.name === slug(p.label ?? '');
    set({ label, name: follows ? slug(label) : p.name });
  };

  // ---------------------------------------------------------------- AI boxes
  if (draft.kind === 'input' || draft.kind === 'output') {
    return (
      <Typography variant="body2" color="text.secondary">
        {draft.kind === 'input'
          ? 'A text box with an action menu (Summarize, Translate, Explain, Extract, Person, Company, Ask AI). Highlighted text on the page fills it automatically.'
          : 'A box that shows the answers of any AI Input on the page.'}{' '}
        Nothing to configure - just place it.
      </Typography>
    );
  }

  // ---------------------------------------------------------------- OCR
  if (draft.kind === 'ocr') {
    return (
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <TextField size="small" label="Title" value={p.label ?? ''} onChange={(e) => set({ label: e.target.value })} inputProps={{ maxLength: 40 }} />
        <TextField
          select size="small" label="OCR engine" value={p.ocrEngine ?? 'ai'}
          onChange={(e) => set({ ocrEngine: e.target.value as 'local' | 'ai' })}
          helperText={p.ocrEngine === 'ai' ? 'Copilot Studio reads the picture through your backend.' : 'Runs inside Chrome - no internet or key needed. English text.'}
        >
          <MenuItem value="local">Offline (built in)</MenuItem>
          <MenuItem value="ai">AI vision (Copilot Studio via backend)</MenuItem>
        </TextField>
        <Typography variant="body2" color="text.secondary">
          On the page: press <b>Select area</b>, drag a box over any image or text, then press <b>Extract text</b>.
        </Typography>
      </Box>
    );
  }

  // ---------------------------------------------------------------- ID extractor
  if (draft.kind === 'ids') {
    return (
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <TextField size="small" label="Button label" value={draft.label} onChange={(e) => onChange({ ...draft, label: e.target.value })} inputProps={{ maxLength: 60 }} />
        <Typography variant="body2" color="text.secondary">
          Pulls case/order/ticket/reference-style IDs straight off the current page - no selection needed, just place it and click.
        </Typography>
      </Box>
    );
  }

  // ---------------------------------------------------------------- action button (Escalate)
  if (draft.kind === 'action') {
    const ask = p.askRecipient !== false;
    return (
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <TextField size="small" label="Button label" value={p.label ?? ''} onChange={(e) => set({ label: e.target.value })} inputProps={{ maxLength: 40 }} />
        <TextField select size="small" label="Button style" value={p.variant ?? 'dark'} onChange={(e) => set({ variant: e.target.value as 'dark' | 'outline' | 'red' })}>
          <MenuItem value="dark">Dark</MenuItem>
          <MenuItem value="outline">Outline</MenuItem>
          <MenuItem value="red">Red</MenuItem>
        </TextField>
        <Section>Who gets the e-mail</Section>
        <FormControlLabel
          control={<Checkbox size="small" checked={ask} onChange={(e) => set({ askRecipient: e.target.checked })} />}
          label={<Typography variant="body2">Ask for the e-mail address when the button is clicked</Typography>}
        />
        <TextField
          size="small" label="Fixed recipient (when not asking)" placeholder="boss@company.com" value={p.recipient ?? ''}
          disabled={ask} onChange={(e) => set({ recipient: e.target.value })}
        />
        <FormControlLabel
          control={<Checkbox size="small" checked={!!p.askNote} onChange={(e) => set({ askNote: e.target.checked })} />}
          label={<Typography variant="body2">Let the sender add a note</Typography>}
        />
        <Section>E-mail content</Section>
        <TextField size="small" label="Subject" value={p.subject ?? ''} onChange={(e) => set({ subject: e.target.value })} />
        <TextField
          size="small" label="Body" multiline minRows={7} value={p.body ?? ''} onChange={(e) => set({ body: e.target.value })}
          helperText="Placeholders: {{email}} {{note}} {{page_title}} {{page_url}} {{selection}} {{date}} {{time}}"
        />
        <TextField size="small" label="Message after sending" value={p.successMessage ?? ''} onChange={(e) => set({ successMessage: e.target.value })} />
        <Typography variant="caption" color="text.secondary">
          Sent by the backend over SMTP (settings in backend/.env).
        </Typography>
      </Box>
    );
  }

  // ---------------------------------------------------------------- link button
  if (draft.kind === 'button') {
    const u = draft.url.trim();
    const bad = u.length > 0 && !normalizeUrl(u);
    return (
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <TextField size="small" label="Button label" value={draft.label} onChange={(e) => onChange({ ...draft, label: e.target.value })} inputProps={{ maxLength: 40 }} />
        <TextField
          size="small" label="Link (URL)" placeholder="https://intranet.company.com/page" value={draft.url}
          onChange={(e) => onChange({ ...draft, url: e.target.value })} error={bad}
          helperText={bad ? 'Enter a valid http(s) link' : normalizeUrl(u) ? `Opens: ${normalizeUrl(u)}` : 'Paste any link - clicking the button opens it'}
        />
        <ToggleButtonGroup exclusive size="small" fullWidth value={draft.newTab ? 'new' : 'same'} onChange={(_, v) => v && onChange({ ...draft, newTab: v === 'new' })}>
          <ToggleButton value="new">Open in new tab</ToggleButton>
          <ToggleButton value="same">Same tab</ToggleButton>
        </ToggleButtonGroup>
      </Box>
    );
  }

  // ---------------------------------------------------------------- weather
  if (draft.kind === 'weather') {
    const list = p.locations ?? [];
    const clean = list.map((l) => l.trim()).filter(Boolean);
    return (
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <TextField size="small" label="Title" value={p.label ?? ''} onChange={(e) => set({ label: e.target.value })} />
        <Section>DROPDOWN DATA</Section>
        <TextField
          size="small" multiline minRows={5} maxRows={9} label="States / places (one per line)" value={list.join('\n')}
          onChange={(e) => set({ locations: e.target.value.split('\n') })}
          helperText="Indian states and union territories work instantly; any other city name is looked up online."
        />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" color="inherit" variant="outlined" sx={{ borderColor: 'grey.400' }} onClick={() => set({ locations: [...INDIA_STATES] })}>All Indian states</Button>
          <Button size="small" color="inherit" variant="outlined" sx={{ borderColor: 'grey.400' }} onClick={() => set({ locations: [] })}>Clear</Button>
        </Box>
        <Select
          size="small" displayEmpty value={p.defaultLocation && clean.includes(p.defaultLocation) ? p.defaultLocation : ''}
          onChange={(e) => set({ defaultLocation: e.target.value || undefined })} sx={{ bgcolor: 'background.paper' }}
        >
          <MenuItem value=""><em>Default location: first in list</em></MenuItem>
          {clean.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}
        </Select>
        <ToggleButtonGroup exclusive size="small" fullWidth value={p.units ?? 'c'} onChange={(_, v) => v && set({ units: v })}>
          <ToggleButton value="c">°C</ToggleButton>
          <ToggleButton value="f">°F</ToggleButton>
        </ToggleButtonGroup>
      </Box>
    );
  }

  // ---------------------------------------------------------------- form
  if (draft.kind === 'form') {
    const bad = !!p.continueUrl && !normalizeUrl(p.continueUrl);
    return (
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <TextField size="small" label="Form title" value={p.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
        <Section>FIELDS</Section>
        <FormFieldsEditor fields={p.fields ?? []} onChange={(fields) => set({ fields })} />
        <Section>AFTER SUBMIT</Section>
        <TextField size="small" label="Submit button text" value={p.submitLabel ?? ''} onChange={(e) => set({ submitLabel: e.target.value })} />
        <TextField size="small" multiline minRows={2} label="Success message" value={p.successMessage ?? ''} onChange={(e) => set({ successMessage: e.target.value })} />
        <TextField
          size="small" label="Continue link (optional)" placeholder="https://intranet.company.com/thanks" value={p.continueUrl ?? ''}
          onChange={(e) => set({ continueUrl: e.target.value || undefined })} error={bad}
          helperText={bad ? 'Enter a valid http(s) link' : 'Shows a "Continue" button after a successful submit'}
        />
        <Typography variant="caption" color="text.secondary">
          Submissions are saved in the local SQLite database.
        </Typography>
      </Box>
    );
  }

  // ---------------------------------------------------------------- field components (text, textarea, dropdown, checkbox, radio)
  if (!isFieldKind(draft.kind)) return null;
  const textual = draft.kind === 'text' || draft.kind === 'textarea';
  const cleanOpts = opts.map((o) => o.trim()).filter(Boolean);

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <TextField size="small" label="Label" value={p.label ?? ''} onChange={(e) => setLabel(e.target.value)} />
      <TextField size="small" label="Field name" value={p.name ?? ''} onChange={(e) => set({ name: e.target.value })}
        helperText="Used as the key when this field is saved (letters, numbers, underscore)." />
      {textual && <TextField size="small" label="Placeholder" value={p.placeholder ?? ''} onChange={(e) => set({ placeholder: e.target.value })} />}

      {needsOptions(draft.kind) && (
        <>
          <Section>OPTIONS (DATA)</Section>
          <TextField
            size="small" multiline minRows={4} maxRows={10} label="One option per line" value={opts.join('\n')}
            onChange={(e) => set({ options: e.target.value.split('\n') })}
          />
        </>
      )}

      {textual && <TextField size="small" label="Default value" value={p.defaultValue ?? ''} onChange={(e) => set({ defaultValue: e.target.value })} />}
      {needsOptions(draft.kind) && (
        <Select size="small" displayEmpty value={p.defaultValue && cleanOpts.includes(p.defaultValue) ? p.defaultValue : ''}
          onChange={(e) => set({ defaultValue: e.target.value || undefined })} sx={{ bgcolor: 'background.paper' }}>
          <MenuItem value=""><em>Default: none selected</em></MenuItem>
          {cleanOpts.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
        </Select>
      )}
      {draft.kind === 'checkbox' && (
        <FormControlLabel
          control={<Checkbox size="small" checked={p.defaultValue === 'true'} onChange={(e) => set({ defaultValue: e.target.checked ? 'true' : undefined })} />}
          label={<Typography variant="body2">Checked by default</Typography>}
        />
      )}

      <TextField size="small" label="Help text (optional)" value={p.helpText ?? ''} onChange={(e) => set({ helpText: e.target.value || undefined })} />
      <FormControlLabel
        control={<Checkbox size="small" checked={!!p.required} onChange={(e) => set({ required: e.target.checked })} />}
        label={<Typography variant="body2">Required field</Typography>}
      />

      {textual && (
        <>
          <Section>VALIDATION</Section>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            <TextField size="small" type="number" label="Min length" value={p.minLen ?? ''} onChange={(e) => set({ minLen: num(e.target.value) })} />
            <TextField size="small" type="number" label="Max length" value={p.maxLen ?? ''} onChange={(e) => set({ maxLen: num(e.target.value) })} />
          </Box>
          <TextField size="small" label="Regex pattern" placeholder="e.g. ^[A-Z]{2}\d{4}$" value={p.pattern ?? ''} onChange={(e) => set({ pattern: e.target.value || undefined })} />
        </>
      )}
    </Box>
  );
}
