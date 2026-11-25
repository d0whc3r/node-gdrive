import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    testTimeout: 35_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'cli/**/*.ts'],
      exclude: ['cli/cli.ts', 'src/types.ts'],
      reporter: ['text', 'lcov']
    }
  }
});
