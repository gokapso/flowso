import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';

const external = [...builtinModules, ...builtinModules.map((name) => `node:${name}`), 'vue'];

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: false,
    target: 'node20',
    minify: false,
    sourcemap: true,
    lib: {
      entry: {
        index: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        schema: fileURLToPath(new URL('./src/schema/index.ts', import.meta.url)),
        runtime: fileURLToPath(new URL('./src/runtime/index.ts', import.meta.url)),
        validator: fileURLToPath(new URL('./src/validator/index.ts', import.meta.url)),
        endpoint: fileURLToPath(new URL('./src/endpoint/index.ts', import.meta.url)),
        vue: fileURLToPath(new URL('./src/vue/index.ts', import.meta.url)),
        catalog: fileURLToPath(new URL('./src/catalog/index.ts', import.meta.url)),
        'cli/main': fileURLToPath(new URL('./src/cli/main.ts', import.meta.url)),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external,
      output: {
        assetFileNames: (asset) => (asset.name?.endsWith('.css') ? 'vue/theme.css' : 'assets/[name][extname]'),
      },
    },
  },
});
