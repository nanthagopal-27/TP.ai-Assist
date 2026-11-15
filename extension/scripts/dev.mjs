// Watch mode: rebuilds dist/ on every save (side panel + service worker, and the content script).
import { execFileSync, spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
rmSync(join(root, 'dist'), { recursive: true, force: true });
try { execFileSync(process.execPath, [join(root, 'scripts', 'copy-ocr.mjs')], { cwd: root, stdio: 'inherit' }); } catch { /* run npm install first */ }
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const run = (args) => spawn(process.execPath, [vite, ...args], { cwd: root, stdio: 'inherit' });

const a = run(['build', '--watch', '--mode', 'development']);
const b = run(['build', '--watch', '--mode', 'development', '--config', 'vite.content.config.ts']);
const stop = () => { a.kill(); b.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
