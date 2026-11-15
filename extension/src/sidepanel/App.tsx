import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Tab, Tabs, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import type { ExtMessage, HealthInfo } from '../shared/types';
import { ACTION_ORDER } from '../shared/config';
import { usePageContext } from './hooks/usePageContext';
import { api } from './lib/bridge';
import { ACTIONS } from './lib/workflows';
import Header from './components/Header';
import WidgetsTab from './components/WidgetsTab';
import SettingsDialog from './components/SettingsDialog';

export default function App() {
  const page = usePageContext();
  const [tab, setTab] = useState<'assist' | 'widgets'>('assist');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [online, setOnline] = useState(false);

  // ---- backend health -------------------------------------------------------
  const checkHealth = useCallback(async () => {
    try {
      setHealth(await api<HealthInfo>('/api/health'));
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    void checkHealth();
    const t = window.setInterval(checkHealth, 20_000);
    return () => window.clearInterval(t);
  }, [checkHealth]);

  // ---- "Edit" clicked on a widget inside the page -> open the Widgets tab with its properties
  useEffect(() => {
    const open = (id: string) => {
      setTab('widgets');
      setEditId(id);
    };
    chrome.storage.session.get('orbit.editWidget').then((s) => {
      const id = s['orbit.editWidget'] as string | undefined;
      if (id) open(id);
    });
    const listener = (msg: ExtMessage) => {
      if (msg.type === 'ORBIT_WIDGET_EVENT' && msg.event === 'edit' && msg.id) open(msg.id);
      return false;
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);
  const clearEdit = useCallback(() => setEditId(null), []);

  const canRun = !!page.tab?.context && !page.tab.restricted;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Header health={health} online={online} onRefresh={page.refresh} onSettings={() => setSettingsOpen(true)} />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', minHeight: 40 }} TabIndicatorProps={{ sx: { bgcolor: 'grey.800' } }}>
        <Tab value="assist" label="Assist Summary" />
        <Tab value="widgets" label="Widgets" />
      </Tabs>

      <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'grid', gap: 2, alignContent: 'start' }}>
        {tab === 'widgets' ? (
          <WidgetsTab disabled={!canRun} editId={editId} onEditHandled={clearEdit} />
        ) : (
          <>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>What you can do</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                Every feature below runs as a widget placed directly on the page - open the <b>Widgets</b> tab,
                drag one onto any site, and click it there. Nothing to run from here.
              </Typography>
            </Box>
            <Box sx={{ display: 'grid', gap: 1 }}>
              {ACTION_ORDER.map((id) => {
                const a = ACTIONS[id];
                return (
                  <Box
                    key={id}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, borderRadius: 2,
                      bgcolor: 'background.paper', border: 1, borderColor: 'grey.200',
                    }}
                  >
                    <Box sx={{ color: 'grey.700', display: 'grid' }}>{a.icon}</Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.label}</Typography>
                      <Typography variant="caption" color="text.secondary">{a.hint}</Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
            <Button
              variant="contained" endIcon={<ArrowForwardIcon fontSize="small" />}
              onClick={() => setTab('widgets')}
              sx={{ bgcolor: 'grey.900', '&:hover': { bgcolor: 'grey.800' } }}
            >
              Go to Widgets
            </Button>
          </>
        )}
      </Box>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={checkHealth} />
    </Box>
  );
}
