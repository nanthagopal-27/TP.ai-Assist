import { useState } from 'react';
import { Box, Chip, IconButton, Tooltip } from '@mui/material';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { HealthInfo } from '../../shared/types';
import Logo from './Logo';

/** Optional second, smaller logo shown beside the main one (e.g. a partner/solution-engineering
 *  badge). Drop a file named secondary-logo.(svg|png|jpg) into extension/public/ to show it -
 *  simply hides itself if none of those exist, so it's a no-op when unused. */
const SECONDARY_LOGO_EXTS = ['svg', 'png', 'jpg'];
function SecondaryLogo({ onFailed }: { onFailed: () => void }) {
  const [i, setI] = useState(0);
  if (i >= SECONDARY_LOGO_EXTS.length) return null;
  return (
    <Box
      component="img"
      src={`secondary-logo.${SECONDARY_LOGO_EXTS[i]}`}
      alt=""
      onError={() => {
        if (i + 1 >= SECONDARY_LOGO_EXTS.length) onFailed();
        setI((n) => n + 1);
      }}
      sx={{ height: 38, width: 'auto', maxWidth: 160, display: 'block', objectFit: 'contain' }}
    />
  );
}

interface Props {
  health: HealthInfo | null;
  online: boolean;
  onRefresh: () => void;
  onSettings: () => void;
}

const formatModel = (model: string): string =>
  model.split('-').map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' ');

export default function Header({ health, online, onRefresh, onSettings }: Props) {
  const label = !online ? 'Backend offline' : health?.mock ? 'Mock mode' : formatModel(health?.model || 'Connected');
  const [showSecondary, setShowSecondary] = useState(true);
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 2, py: 1.25, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Logo />
        {showSecondary && <Box sx={{ width: '1px', height: 30, bgcolor: 'divider' }} />}
        <SecondaryLogo onFailed={() => setShowSecondary(false)} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Chip
          size="small"
          variant="outlined"
          label={label}
          icon={
            <Box
              component="span"
              sx={{ width: 8, height: 8, borderRadius: '50%', ml: '8px !important', bgcolor: online ? 'success.main' : 'grey.500' }}
            />
          }
          sx={{ fontSize: 11, height: 24 }}
        />
        <Tooltip title="Re-read this page">
          <IconButton size="small" onClick={onRefresh}><RefreshIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title="Settings">
          <IconButton
            size="small"
            onClick={(e) => {
              e.currentTarget.blur();
              onSettings();
            }}
          >
            <SettingsOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
