import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

const icons = {
  16: '/icon/16.png',
  32: '/icon/32.png',
  48: '/icon/48.png',
  128: '/icon/128.png',
};

export default defineConfig({
  srcDir: 'src',
  hooks: {
    'build:publicAssets'(wxt, files) {
      for (const filename of ['LICENSE', 'THIRD_PARTY_LICENSES.txt']) {
        files.push({
          absoluteSrc: resolve(wxt.config.root, filename),
          relativeDest: filename === 'LICENSE' ? 'LICENSE.txt' : filename,
        });
      }
    },
  },
  manifest: {
    name: 'Login Pilot',
    description: 'Automatically submits registered login forms after autofill.',
    permissions: ['activeTab', 'notifications', 'storage'],
    icons,
    action: {
      default_title: 'Login Pilot',
      default_icon: icons,
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
import { resolve } from 'node:path';
