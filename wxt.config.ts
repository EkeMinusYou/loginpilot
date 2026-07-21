import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Auto Sign-in',
    description: 'Automatically submits registered login forms after autofill.',
    permissions: ['activeTab', 'notifications', 'storage'],
    action: {
      default_title: 'Auto Sign-in',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
