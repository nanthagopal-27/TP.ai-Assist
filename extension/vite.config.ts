import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Multi-entry build for a Manifest V3 extension:
 *   sidepanel.html -> React side panel (shares chunks with the service worker, that's fine)
 *   background.ts  -> dist/background.js  (service worker, loaded as an ES module)
 * The content script is built separately (vite.content.config.ts) as ONE self-contained classic
 * script, because Chrome cannot load shared ES-module chunks into a content script.
 * manifest.json and icons are copied as-is from /public.
 */
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    // Always on: see vite.content.config.ts for why.
    sourcemap: true,
    minify: mode === 'development' ? false : 'esbuild',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        background: resolve(__dirname, 'src/background.ts'),
        offscreen: resolve(__dirname, 'offscreen.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
}));
