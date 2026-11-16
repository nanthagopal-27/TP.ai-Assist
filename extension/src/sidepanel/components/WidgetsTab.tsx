import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Divider, FormControlLabel, IconButton, MenuItem, Select,
  Tooltip, Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CloseIcon from '@mui/icons-material/Close';
import AddLocationAltOutlinedIcon from '@mui/icons-material/AddLocationAltOutlined';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import type { ExtMessage, WidgetInfo, WidgetKind, WidgetMode } from '../../shared/types';
import { STORAGE_KEYS, WIDGET_DRAG_MIME, WIDGET_DRAG_TEXT_PREFIX } from '../../shared/config';
import { send } from '../lib/bridge';
import {
  COMPONENTS, componentOf, defaultsFor, draftFromWidget, draftIssues, finalizeDraft, type Draft,
} from '../lib/components';
import PropertiesEditor from './PropertiesEditor';

interface Props {
  disabled: boolean;
  /** widget the user asked to edit from the page (hover bar → Edit) */
  editId: string | null;
  onEditHandled: () => void;
}

const detail = (w: WidgetInfo): string => {
  const p = w.props ?? {};
  switch (w.kind) {
    case 'button': return w.label || 'Link button';
    case 'form': return p.title || 'Form';
    case 'weather': return p.label || 'Weather';
    case 'input': return 'AI Input';
    case 'output': return 'AI Output';
    case 'both': return 'AI Input + Output';
    default: return p.label || componentOf(w.kind).label;
  }
};

export default function WidgetsTab({ disabled, editId, onEditHandled }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<WidgetInfo[]>([]);
  const [autofill, setAutofill] = useState(true);
  const [toolbar, setToolbar] = useState(true);
  const [dragLayout, setDragLayout] = useState<'row' | 'column'>('row');
  const editorRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (): Promise<WidgetInfo[]> => {
    try {
      const list = await send<WidgetInfo[]>({ type: 'ORBIT_WIDGET_LIST' });
      setItems(list);
      return list;
    } catch {
      setItems([]);
      return [];
    }
  }, []);

  const startEdit = useCallback((w: WidgetInfo) => {
    setDraft(draftFromWidget(w));
    setError(null);
    setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, []);

  useEffect(() => {
    void refresh();
    chrome.storage.local.get([STORAGE_KEYS.autofill, STORAGE_KEYS.toolbar, STORAGE_KEYS.dragLayout]).then((s) => {
      setAutofill(s[STORAGE_KEYS.autofill] !== false);
      // first time the Widgets tab is opened: show the on-page toolbar (user can hide it with its x or the switch below)
      if (s[STORAGE_KEYS.toolbar] === undefined) void chrome.storage.local.set({ [STORAGE_KEYS.toolbar]: true });
      setToolbar(s[STORAGE_KEYS.toolbar] !== false);
      setDragLayout(s[STORAGE_KEYS.dragLayout] === 'column' ? 'column' : 'row');
    });
    const onStore = (chg: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && chg[STORAGE_KEYS.toolbar]) setToolbar(chg[STORAGE_KEYS.toolbar].newValue === true);
    };
    chrome.storage.onChanged.addListener(onStore);
    const listener = (msg: ExtMessage) => {
      if (msg.type === 'ORBIT_WIDGET_EVENT') {
        if (msg.event === 'edit') return false; // handled through the editId prop
        setPlacing(false);
        if (msg.event === 'placed') setDraft(null);
        if (msg.event === 'failed' && msg.message) setError(msg.message);
        void refresh();
      } else if (msg.type === 'ORBIT_TAB_CHANGED') {
        setPlacing(false);
        setDraft(null);
        setTimeout(() => void refresh(), 500);
      }
      return false;
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      chrome.storage.onChanged.removeListener(onStore);
    };
  }, [refresh]);

  // "Edit" clicked on a widget in the page
  useEffect(() => {
    if (!editId) return;
    void (async () => {
      const list = await refresh();
      const w = list.find((x) => x.id === editId);
      if (w) startEdit(w);
      onEditHandled();
      void chrome.storage.session.remove('orbit.editWidget');
    })();
  }, [editId, refresh, startEdit, onEditHandled]);

  const choose = (kind: WidgetKind) => {
    setError(null);
    setDraft((d) => ({ ...defaultsFor(kind), mode: d?.mode ?? 'inline' }));
    setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const issues = draft ? draftIssues(draft) : [];

  const place = async () => {
    if (!draft || issues.length) return;
    setError(null);
    const d = finalizeDraft(draft);
    try {
      await send({
        type: 'ORBIT_WIDGET_PLACE',
        request: { kind: d.kind, mode: d.mode, props: d.props, label: d.label, url: d.url, newTab: d.newTab },
      });
      setPlacing(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    if (!draft?.editingId || issues.length) return;
    setError(null);
    const d = finalizeDraft(draft);
    try {
      await send({ type: 'ORBIT_WIDGET_UPDATE', id: d.editingId!, patch: { props: d.props, label: d.label, url: d.url, newTab: d.newTab } });
      setDraft(null);
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const cancelPlacing = async () => {
    setPlacing(false);
    try { await send({ type: 'ORBIT_WIDGET_CANCEL' }); } catch { /* ignore */ }
  };

  const remove = async (id?: string) => {
    try { await send({ type: 'ORBIT_WIDGET_REMOVE', id }); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    if (!id || draft?.editingId === id) setDraft(null);
    void refresh();
  };

  const moveInPage = async (id: string) => {
    try { await send({ type: 'ORBIT_WIDGET_MOVE', id }); setPlacing(true); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const toggleToolbar = (v: boolean) => {
    setToolbar(v);
    void chrome.storage.local.set({ [STORAGE_KEYS.toolbar]: v });
  };

  const toggleAutofill = (v: boolean) => {
    setAutofill(v);
    void chrome.storage.local.set({ [STORAGE_KEYS.autofill]: v });
  };

  const setDefaultLayout = (v: 'row' | 'column') => {
    setDragLayout(v);
    void chrome.storage.local.set({ [STORAGE_KEYS.dragLayout]: v });
  };

  const groups: ('Inputs' | 'Actions & data' | 'AI')[] = ['Inputs', 'Actions & data', 'AI'];
  const comp = draft ? componentOf(draft.kind) : null;
  const editing = !!draft?.editingId;

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      {disabled && (
        <Alert severity="info" sx={{ bgcolor: 'grey.100' }}>
          Open a normal website tab to place widgets (Chrome blocks extensions on browser-internal pages).
        </Alert>
      )}
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {placing && (
        <Alert
          severity="info" icon={<AddLocationAltOutlinedIcon fontSize="small" />}
          sx={{ bgcolor: 'grey.200', color: 'grey.900', alignItems: 'center', position: 'sticky', top: 0, zIndex: 2 }}
          action={<Button color="inherit" size="small" onClick={cancelPlacing}>Cancel</Button>}
        >
          <b>Click anywhere on the page</b> to place it. Esc cancels.
        </Alert>
      )}

      {/* ------------------------------------------------ palette */}
      <Card>
        <CardContent sx={{ display: 'grid', gap: 1.25, pb: '16px !important' }}>
          <Box>
            <Typography variant="subtitle2">Components</Typography>
            <Typography variant="caption" color="text.secondary">
              Drag a component straight onto the page to place it, or click it to fill in details first.
            </Typography>
          </Box>
          {groups.map((g) => (
            <Box key={g}>
              <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 0.8, lineHeight: 1.8 }}>{g}</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                {COMPONENTS.filter((c) => c.group === g).map((c) => {
                  const active = draft?.kind === c.kind && !editing;
                  return (
                    <Tooltip key={c.kind} title={c.hint} placement="top" arrow>
                      <span>
                        <Button
                          fullWidth disabled={disabled} onClick={() => choose(c.kind)}
                          disableRipple
                          draggable={!disabled}
                          onMouseDown={() => {
                            // Arms the page's drag acceptor *before* the native drag starts
                            // crossing into it, and tells it which component kind this is -
                            // Chrome strips both the custom drag MIME type and its data value
                            // by the time they cross from the panel into the page, so neither
                            // "is this drag ours" nor "which kind is it" can be read from
                            // dataTransfer there; both have to travel out-of-band instead.
                            if (!disabled) void send({ type: 'ORBIT_WIDGET_DRAG_ARM', kind: c.kind }).catch(() => undefined);
                          }}
                          onDragStart={(e) => {
                            // Drags a component straight onto the page via the browser's native
                            // (OS-level) Drag and Drop API. A side panel (unlike a popup, which
                            // closes the moment it loses focus) stays open through the drag, so
                            // this is the supported way to drag from an extension page onto the
                            // tab's page. disableRipple keeps MUI's pointer-down ripple animation
                            // from interfering with the native drag gesture the browser starts
                            // on this same mousedown. If this doesn't land a "drop" on the page
                            // for any reason, nothing is lost: clicking the tile still opens the
                            // properties panel exactly as before.
                            e.dataTransfer.effectAllowed = 'copy';
                            e.dataTransfer.setData(WIDGET_DRAG_MIME, c.kind);
                            e.dataTransfer.setData('text/plain', `${WIDGET_DRAG_TEXT_PREFIX}${c.kind}`);
                          }}
                          onDragEnd={() => {
                            // Fires on the side panel (the drag's source document) once the drag
                            // ends however it ends - dropped, cancelled with Esc, released outside
                            // the window - so this is the reliable place to disarm, unlike the
                            // page's own 'drop'/'dragend' which only fire when the drag actually
                            // reached it.
                            void send({ type: 'ORBIT_WIDGET_DRAG_DISARM' }).catch(() => undefined);
                          }}
                          sx={{
                            flexDirection: 'column', gap: 0.5, py: 1.1, px: 0.5, borderRadius: 2, border: 1,
                            borderColor: active ? '#212121' : '#e0e0e0', bgcolor: active ? '#212121' : '#ffffff',
                            color: active ? '#ffffff' : '#212121', fontSize: 11.5, lineHeight: 1.15, textAlign: 'center',
                            '&:hover': { bgcolor: active ? '#000000' : '#f5f5f5', borderColor: '#757575' },
                          }}
                        >
                          {c.icon}
                          {c.label}
                        </Button>
                      </span>
                    </Tooltip>
                  );
                })}
              </Box>
            </Box>
          ))}
        </CardContent>
      </Card>

      {/* ------------------------------------------------ properties */}
      {draft && comp && (
        <Card ref={editorRef} sx={{ borderColor: 'grey.700', scrollMarginTop: 8 }}>
          <CardContent sx={{ display: 'grid', gap: 1.5, pb: '16px !important' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 28, height: 28, borderRadius: 1.5, bgcolor: 'grey.800', color: '#fff', display: 'grid', placeItems: 'center' }}>{comp.icon}</Box>
              <Typography variant="subtitle2" sx={{ flex: 1 }}>
                {editing ? 'Edit' : ''} {comp.label} properties
              </Typography>
              <Button size="small" color="inherit" startIcon={<CloseIcon fontSize="small" />} onClick={() => setDraft(null)}>Close</Button>
            </Box>
            <Divider />

            <PropertiesEditor draft={draft} onChange={setDraft} />

            {issues.length > 0 && (
              <Alert severity="warning" sx={{ py: 0 }}>
                {issues.map((i) => <div key={i}>{i}</div>)}
              </Alert>
            )}

            <Divider />
            {editing ? (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="contained" fullWidth disabled={disabled || issues.length > 0} onClick={save}>Save changes</Button>
                {draft.mode === 'inline' && (
                  <Tooltip title="Pick a new spot on the page">
                    <Button variant="outlined" color="inherit" sx={{ borderColor: 'grey.400', minWidth: 0, px: 1.5 }} onClick={() => moveInPage(draft.editingId!)}>
                      <OpenWithIcon fontSize="small" />
                    </Button>
                  </Tooltip>
                )}
              </Box>
            ) : (
              <Box sx={{ display: 'grid', gap: 1 }}>
                {draft.mode === 'inline' && (
                  <Select
                    size="small"
                    value={draft.props.layout === 'column' ? 'column' : 'row'}
                    onChange={(e) => setDraft({ ...draft, props: { ...draft.props, layout: e.target.value as 'row' | 'column' } })}
                    sx={{ bgcolor: 'background.paper' }}
                  >
                    <MenuItem value="row">Side-by-side with nearby widgets</MenuItem>
                    <MenuItem value="column">Always stack (own line)</MenuItem>
                  </Select>
                )}
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Select
                    size="small" value={draft.mode} onChange={(e) => setDraft({ ...draft, mode: e.target.value as WidgetMode })}
                    sx={{ width: 108, bgcolor: 'background.paper' }}
                  >
                    <MenuItem value="inline">Inline</MenuItem>
                    <MenuItem value="float">Float</MenuItem>
                  </Select>
                  <Button
                    variant="contained" fullWidth startIcon={<AddLocationAltOutlinedIcon />}
                    disabled={disabled || placing || issues.length > 0} onClick={place}
                  >
                    Place on page
                  </Button>
                </Box>
              </Box>
            )}
            {!editing && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>
                Inline sits inside the page and scrolls with it. Float stays fixed on screen and can be dragged.
                {draft.mode === 'inline' && ' "Side-by-side" only takes effect when dropped right next to another widget.'}
              </Typography>
            )}
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------ on this page */}
      <Card>
        <CardContent sx={{ display: 'grid', gap: 0.5, pb: '12px !important' }}>
          <Typography variant="subtitle2">On this page ({items.length})</Typography>
          {items.length > 0 && (
            <Button
              size="small" variant="outlined" color="inherit" fullWidth
              startIcon={<DeleteOutlineIcon fontSize="small" />}
              onClick={() => remove()}
              sx={{ borderColor: 'grey.400', justifyContent: 'center' }}
            >
              Remove all ({items.length})
            </Button>
          )}
          {items.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 0.5 }}>
              Nothing placed yet. Widgets are saved per page and come back after a reload. Hover a widget on the page to Move, Edit or Remove it.
            </Typography>
          )}
          {items.map((w) => {
            const c = componentOf(w.kind);
            const editable = !['input', 'output', 'both'].includes(w.kind);
            return (
              <Box key={w.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderTop: 1, borderColor: 'grey.200' }}>
                <Box sx={{ color: 'grey.700', display: 'grid' }}>{c.icon}</Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{detail(w)}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap display="block">
                    {c.label} · {w.mode === 'float' ? 'Floating' : `Inline · ${w.anchor?.position} · ${w.anchor?.tag}`}
                    {!w.mounted ? ' · waiting for element…' : ''}
                  </Typography>
                </Box>
                {editable && (
                  <Tooltip title="Edit properties">
                    <IconButton size="small" onClick={() => startEdit(w)}><EditOutlinedIcon fontSize="small" /></IconButton>
                  </Tooltip>
                )}
                <Tooltip title="Remove">
                  <IconButton size="small" onClick={() => remove(w.id)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Tooltip>
              </Box>
            );
          })}
          <Divider sx={{ mt: 0.5 }} />
          <FormControlLabel
            control={<Checkbox size="small" checked={toolbar} onChange={(e) => toggleToolbar(e.target.checked)} />}
            label={<Typography variant="body2">Show widget toolbar on websites</Typography>}
          />
          <FormControlLabel
            control={<Checkbox size="small" checked={autofill} onChange={(e) => toggleAutofill(e.target.checked)} />}
            label={<Typography variant="body2">Auto-fill AI Input from selected text</Typography>}
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small" checked={dragLayout === 'row'}
                onChange={(e) => setDefaultLayout(e.target.checked ? 'row' : 'column')}
              />
            }
            label={<Typography variant="body2">Drag-dropped widgets group side-by-side by default</Typography>}
          />
        </CardContent>
      </Card>
    </Box>
  );
}
