import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Keep unit tests isolated from the Cloudflare/Vite development server plugins.
// The production build is validated separately by the CI workflow.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  test: {
    fileParallelism: false,
  },
});
