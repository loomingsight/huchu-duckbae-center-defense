import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/assets/**/*.test.ts'],
    globals: true,
    environment: 'node',
    restoreMocks: true,
    coverage: { reporter: ['text', 'html'] },
  },
});
