import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { localizeHtml } from './localize.ts';
import { privacyHtml } from './privacy.ts';
import { relative, dirname, sep } from 'node:path';

const template = new URL('./index.html', import.meta.url);

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    {
      name: 'loginpilot-localized-pages',
      transformIndexHtml: {
        order: 'pre',
        handler(_html, context) {
          const entry = relative(fileURLToPath(new URL('.', import.meta.url)), context.filename).split(sep).join('/');
          const locale = entry.startsWith('en/') ? 'en' : 'ja';
          const depth = dirname(entry) === '.' ? 0 : dirname(entry).split('/').length;
          const html = localizeHtml(readFileSync(template, 'utf8'), locale, depth);
          if (!entry.includes('/privacy/')) return html;
          const policy = new URL(`../../docs/privacy${locale === 'en' ? '.en' : ''}.md`, import.meta.url);
          return privacyHtml(html, readFileSync(policy, 'utf8'), locale);
        },
      },
    },
    tailwindcss(),
  ],
  build: {
    outDir: fileURLToPath(new URL('../../.output/lp', import.meta.url)),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rolldownOptions: {
      input: {
        index: fileURLToPath(template),
        ja: fileURLToPath(new URL('./ja/index.html', import.meta.url)),
        en: fileURLToPath(new URL('./en/index.html', import.meta.url)),
        jaPrivacy: fileURLToPath(new URL('./ja/privacy/index.html', import.meta.url)),
        enPrivacy: fileURLToPath(new URL('./en/privacy/index.html', import.meta.url)),
      },
    },
  },
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
