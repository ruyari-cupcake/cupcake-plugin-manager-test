import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: [
        'src/plugin-header.js',       // RisuAI @arg declarations only
        'src/index.js',                // Re-export barrel (no logic)
      ],
      reporter: ['text', 'json-summary', 'json'],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 92,
      },
    },
  },
});
