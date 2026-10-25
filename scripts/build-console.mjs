import { build } from 'esbuild';
import { copyFile, mkdir, rm } from 'node:fs/promises';
await rm('public/admin-assets', { recursive: true, force: true });
await mkdir('public/admin-assets', { recursive: true });
await build({ entryPoints: ['frontend/console.tsx', 'frontend/reference.tsx'], bundle: true, minify: true, splitting: true, format: 'esm', target: 'es2022', outdir: 'public/admin-assets', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'linked', logLevel: 'info' });
await copyFile('frontend/favicon.svg', 'public/admin-assets/favicon.svg');
