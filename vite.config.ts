import tailwindcss from '@tailwindcss/vite';
import react from '@tailwindcss/vite';
import path from 'path';
import {defineConfig} from 'vite';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), cloudflare()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});