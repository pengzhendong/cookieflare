import { build } from 'vite';
import { copyFile, mkdir, rm } from 'node:fs/promises';
await rm('public/admin-assets', { recursive: true, force: true });
await mkdir('public/admin-assets', { recursive: true });
await build();
// Scalar owns its stylesheet and hash inside a separate same-origin document.
await build({ configFile: false, define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { outDir: 'public/admin-assets', emptyOutDir: false,
  target: 'es2022', lib: { entry: 'frontend/reference.ts', formats: ['es'], fileName: () => 'reference.js', cssFileName: 'reference' },
} });
await copyFile('frontend/favicon.svg', 'public/admin-assets/cookieflare-icon.svg');
