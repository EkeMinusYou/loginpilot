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
