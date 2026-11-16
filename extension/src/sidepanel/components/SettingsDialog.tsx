import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { DEFAULT_BACKEND_URL, SHORT_NAME, STORAGE_KEYS } from '../../shared/config';
import type { HealthInfo } from '../../shared/types';
import { api } from '../lib/bridge';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function SettingsDialog({ open, onClose, onSaved }: Props) {
  const [url, setUrl] = useState(DEFAULT_BACKEND_URL);
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setTest(null);
    chrome.storage.local.get(STORAGE_KEYS.backendUrl).then((s) => {
      setUrl((s[STORAGE_KEYS.backendUrl] as string) || DEFAULT_BACKEND_URL);
    });
  }, [open]);

  const save = async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.backendUrl]: url.trim() || DEFAULT_BACKEND_URL });
    onSaved();
    onClose();
  };

  const runTest = async () => {
    // Persist first so the service worker uses the URL being tested.
    await chrome.storage.local.set({ [STORAGE_KEYS.backendUrl]: url.trim() || DEFAULT_BACKEND_URL });
    try {
      const h = await api<HealthInfo>('/api/health');
      setTest({
        ok: true,
        msg: `Connected. Model: ${h.model}${h.mock ? ' (mock mode)' : ''}. API key ${h.api_key_configured ? 'configured' : 'NOT configured'}.`,
      });
    } catch (e) {
      setTest({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{SHORT_NAME} settings</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The extension talks to this backend for every AI action. Leave as the default unless
          you're running your own instance.
        </Typography>
        <TextField fullWidth size="small" label="Backend URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        {test && <Alert severity={test.ok ? 'success' : 'error'} sx={{ mt: 2 }}>{test.msg}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={runTest}>Test connection</Button>
        <Button color="inherit" onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
