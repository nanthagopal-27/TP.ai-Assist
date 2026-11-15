import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Second build pass: the content script as a single self-contained IIFE (dist/content.js).
 * Content scripts cannot import shared chunks, so everything it needs is bundled in.
 */
export default defineConfig(({ mode }) => ({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    // Always on: this is only ever loaded unpacked for local dev/testing, never shipped to the
    // Chrome Web Store, so there's no downside - and it makes console errors point at real
    // TypeScript file/line numbers instead of unreadable minified positions.
    sourcemap: true,
    minify: mode === 'development' ? false : 'esbuild',
    lib: {
      entry: resolve(__dirname, 'src/content.ts'),
      formats: ['iife'],
      name: 'OrbitContent',
      fileName: () => 'content.js',
    },
  },
}));
