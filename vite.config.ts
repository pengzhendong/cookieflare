import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [react()],
  build: { outDir: 'public/admin-assets', emptyOutDir: true, target: 'es2022',
    lib: { entry: 'frontend/main.tsx', formats: ['es'], fileName: () => 'console.js', cssFileName: 'console' },
  },
});
