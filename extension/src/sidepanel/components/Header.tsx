import { useState } from 'react';
import { Box, Chip, IconButton, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
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
  configured: boolean;
  onRefresh: () => void;
}

export default function Header({ configured, onRefresh }: Props) {
  const label = configured ? 'Copilot Studio' : 'Not configured';
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
              sx={{ width: 8, height: 8, borderRadius: '50%', ml: '8px !important', bgcolor: configured ? 'success.main' : 'grey.500' }}
            />
          }
          sx={{ fontSize: 11, height: 24 }}
        />
        <Tooltip title="Re-read this page">
          <IconButton size="small" onClick={onRefresh}><RefreshIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
