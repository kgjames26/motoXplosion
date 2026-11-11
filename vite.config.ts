import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const version = JSON.parse(readFileSync(new URL('./public/version.json', import.meta.url), 'utf8')).version as string;

export default defineConfig({
  base: '/',
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { target: 'es2020', assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
});
