import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const version = JSON.parse(readFileSync(new URL('./public/version.json', import.meta.url), 'utf8')).version as string;

/**
 * Build only. Vite writes the stylesheet link in <head>, where it blocks the first paint: a white
 * screen on a slow first launch. At the end of <body> the loading screen of index.html (inline CSS)
 * paints first, and the module script still waits for the stylesheet, so the game starts styled.
 */
function lateCss(): Plugin {
  return {
    name: 'late-css',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const links: string[] = [];
        const rest = html.replace(/[ \t]*<link rel="stylesheet"[^>]*>\n?/g, (m) => {
          links.push(m.trim());
          return '';
        });
        return links.length ? rest.replace('</body>', `    ${links.join('\n    ')}\n  </body>`) : html;
      },
    },
  };
}

export default defineConfig({
  plugins: [lateCss()],
  base: '/',
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { target: 'es2020', assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
});
