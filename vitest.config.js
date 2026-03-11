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
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 70,
        branches: 63,
        functions: 69,
        lines: 74,
      },
    },
  },
});
