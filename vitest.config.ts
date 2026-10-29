import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Keep unit tests isolated from the Cloudflare runtime plugin used by the production build.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    fileParallelism: false,
  },
});
