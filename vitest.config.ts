import { defineConfig } from 'vitest/config';

// Vitest — unit/lib/component tests against typed fixtures (PLANS.md §8).
// E2E (Playwright) lives in playwright.config.ts.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**/*.ts'],
      // Codegen output is generated; don't gate coverage on it.
      exclude: ['src/lib/shopify/generated/**'],
      // No thresholds yet (Phase 0 has minimal coverage). Add per-phase
      // thresholds in Phase 2+ once format/cart/currency logic exists.
    },
  },
});
