import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import ui from '@nuxt/ui/vite';

export default defineConfig({
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [vue(), ui({ ui: { colors: { primary: 'blue', neutral: 'slate' } },
    icon: { clientBundle: { scan: true } },
  })],
  build: { outDir: 'public/admin-assets', emptyOutDir: true, target: 'es2022',
    lib: { entry: 'frontend/main.ts', formats: ['es'], fileName: () => 'console.js', cssFileName: 'console' },
  },
});
