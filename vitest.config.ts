import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
    // Deterministic engine: no watch-mode globals, explicit imports only.
    globals: false,
    reporters: ['default'],
  },
});
