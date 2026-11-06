import path from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import jsx from '@vitejs/plugin-vue-jsx';
import tailwindcss from '@tailwindcss/vite';
import { viteTailwindReferencePlugin } from '../../internal/vite-config/src/plugins/tailwind-reference.ts';
const root = process.env.COOKIEFLARE_ROOT;
if (!root) throw new Error('Build Vben through npm run build:vben from Cookieflare.');
export default defineConfig({
  base: './',
  plugins: [viteTailwindReferencePlugin(), vue(), jsx(), tailwindcss()],
  resolve: { dedupe: ['vue', 'vue-router'], alias: {
    '@cookieflare/api': path.join(root, 'frontend/api.ts'),
    '@cookieflare/openapi': path.join(root, 'frontend/openapi.ts'),
    '@cookieflare/icons': path.join(root, '.wrangler/vben-icons.ts'),
    '@iconify/vue': path.join(root, 'node_modules/@iconify/vue/dist/iconify.js'),
  } },
  define: { 'process.env.NODE_ENV': JSON.stringify('production'), 'import.meta.env.VITE_APP_STORE_SECURE_KEY': JSON.stringify('cookieflare-ui-preferences-no-credentials') },
  build: { target: 'es2022', outDir: path.join(root, 'public/admin-assets/vben'), emptyOutDir: true,
    lib: { entry: 'src/main.ts', formats: ['es'], fileName: () => 'console.js', cssFileName: 'console' },
  },
});
