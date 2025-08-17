import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/vitest.setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    restoreMocks: true,
    isolate: true,
  },
});
