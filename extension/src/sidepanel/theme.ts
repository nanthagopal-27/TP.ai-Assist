import { createTheme } from '@mui/material/styles';

/** Brand theme - strictly white + grey, clean and non-intrusive. */
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#424242', light: '#6d6d6d', dark: '#212121', contrastText: '#ffffff' },
    secondary: { main: '#9e9e9e', contrastText: '#ffffff' },
    background: { default: '#f5f5f5', paper: '#ffffff' },
    text: { primary: '#212121', secondary: '#616161' },
    divider: '#e0e0e0',
    grey: { 50: '#fafafa', 100: '#f5f5f5', 200: '#eeeeee', 300: '#e0e0e0', 400: '#bdbdbd', 500: '#9e9e9e', 600: '#757575', 700: '#616161', 800: '#424242', 900: '#212121' },
    // Keep status colours muted so the UI stays grey-toned.
    error: { main: '#8c3b3b' },
    success: { main: '#4d6b4f' },
    warning: { main: '#8a6d3b' },
    info: { main: '#5f6b76' },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: 13,
    h6: { fontSize: 15, fontWeight: 700 },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { defaultProps: { elevation: 0 } },
    MuiCard: { defaultProps: { variant: 'outlined' } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiTab: { styleOverrides: { root: { minHeight: 40 } } },
  },
});
