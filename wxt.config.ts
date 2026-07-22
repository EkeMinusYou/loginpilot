import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'loginpilot',
    description: 'Automatically submits registered login forms after autofill.',
    permissions: ['activeTab', 'notifications', 'storage'],
    action: {
      default_title: 'loginpilot',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
