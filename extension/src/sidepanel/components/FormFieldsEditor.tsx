import { Box, Button, Checkbox, FormControlLabel, IconButton, MenuItem, Select, TextField, Tooltip, Typography } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import { useState } from 'react';
import type { FieldType, FormField } from '../../shared/types';
import { slug } from '../../shared/config';
import { newFieldId } from '../lib/components';

const TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text Input' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'radio', label: 'Radio Group' },
];

interface Props {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
}

/** Add / edit / reorder / delete the fields of a Form widget. */
export default function FormFieldsEditor({ fields, onChange }: Props) {
  const [newType, setNewType] = useState<FieldType>('text');

  const patch = (i: number, p: Partial<FormField>) => onChange(fields.map((f, k) => (k === i ? { ...f, ...p } : f)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const add = () => {
    const label = TYPES.find((t) => t.value === newType)!.label;
    let name = slug(label);
    let n = 2;
    while (fields.some((f) => f.name === name)) name = `${slug(label)}_${n++}`;
    onChange([
      ...fields,
      {
        id: newFieldId(), type: newType, label, name,
        options: newType === 'dropdown' || newType === 'radio' ? ['Option 1', 'Option 2'] : undefined,
      },
    ]);
  };

  return (
    <Box sx={{ display: 'grid', gap: 1.25 }}>
      {fields.map((f, i) => (
        <Box key={f.id} sx={{ border: 1, borderColor: 'grey.300', borderRadius: 2, p: 1.25, bgcolor: 'grey.50', display: 'grid', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'grey.700', flex: 1 }}>
              {i + 1}. {TYPES.find((t) => t.value === f.type)?.label}
            </Typography>
            <Tooltip title="Move up"><span><IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpwardIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
            <Tooltip title="Move down"><span><IconButton size="small" disabled={i === fields.length - 1} onClick={() => move(i, 1)}><ArrowDownwardIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
            <Tooltip title="Delete field"><IconButton size="small" onClick={() => onChange(fields.filter((_, k) => k !== i))}><DeleteOutlineIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            <TextField
              size="small" label="Label" value={f.label}
              onChange={(e) => patch(i, { label: e.target.value, name: f.name === slug(f.label) ? slug(e.target.value) : f.name })}
            />
            <TextField size="small" label="Field name" value={f.name} onChange={(e) => patch(i, { name: e.target.value })} />
          </Box>
          {(f.type === 'text' || f.type === 'textarea') && (
            <TextField size="small" label="Placeholder" value={f.placeholder ?? ''} onChange={(e) => patch(i, { placeholder: e.target.value })} />
          )}
          {(f.type === 'dropdown' || f.type === 'radio') && (
            <TextField
              size="small" multiline minRows={2} label="Options (one per line)" value={(f.options ?? []).join('\n')}
              onChange={(e) => patch(i, { options: e.target.value.split('\n') })}
            />
          )}
          {(f.type === 'text' || f.type === 'textarea') && (
            <TextField size="small" label="Regex pattern (optional)" value={f.pattern ?? ''} onChange={(e) => patch(i, { pattern: e.target.value || undefined })} />
          )}
          <FormControlLabel
            control={<Checkbox size="small" checked={!!f.required} onChange={(e) => patch(i, { required: e.target.checked })} />}
            label={<Typography variant="body2">Required field</Typography>}
          />
        </Box>
      ))}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Select size="small" value={newType} onChange={(e) => setNewType(e.target.value as FieldType)} sx={{ flex: 1, bgcolor: 'background.paper' }}>
          {TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
        </Select>
        <Button variant="outlined" color="inherit" startIcon={<AddIcon />} onClick={add} sx={{ borderColor: 'grey.400' }}>Add field</Button>
      </Box>
    </Box>
  );
}
