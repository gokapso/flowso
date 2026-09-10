import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  build: {
    outDir: fileURLToPath(new URL('../dist/playground', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 4310,
    proxy: {
      '/__sim': { target: process.env.SIM_API_URL ?? 'http://localhost:4311', changeOrigin: true },
    },
  },
});
