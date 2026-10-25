import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
await mkdir('public/admin-assets', { recursive: true });
await build({ entryPoints: ['frontend/console.tsx'], bundle: true, minify: true, splitting: true, format: 'esm', target: 'es2022', outdir: 'public/admin-assets', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'linked', logLevel: 'info' });
await copyFile('frontend/favicon.svg', 'public/admin-assets/favicon.svg');
