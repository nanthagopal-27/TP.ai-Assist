import { useState } from 'react';
import { Box } from '@mui/material';
import { PRODUCT_NAME, PRODUCT_INITIALS } from '../../shared/config';

/** Drop a logo.svg into extension/public/ to use a real logo here instead of the auto-generated
 *  initials badge - no build step needed, this just tries to load it and falls back on error.
 *  (Chrome's own side panel header already shows the product name right above this, so this
 *  stays icon-only rather than repeating it as text too.) */
export default function Logo() {
  const [customLogoFailed, setCustomLogoFailed] = useState(false);

  if (!customLogoFailed) {
    return (
      <Box
        component="img"
        src="logo.svg"
        alt={PRODUCT_NAME}
        title={PRODUCT_NAME}
        onError={() => setCustomLogoFailed(true)}
        sx={{ width: 30, height: 30, borderRadius: 1.5, display: 'block', objectFit: 'contain' }}
      />
    );
  }

  return (
    <Box
      title={PRODUCT_NAME}
      sx={{
        width: 30, height: 30, borderRadius: 1.5, bgcolor: 'grey.800', color: '#fff',
        display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 12.5, letterSpacing: 0.3,
      }}
    >
      {PRODUCT_INITIALS}
    </Box>
  );
}
