import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright — E2E critical journeys against the live (seeded) store
 * (PLANS.md §8). Vitest (unit/component) is the fast per-PR gate; Playwright
 * runs on merge to `develop` and nightly to keep PRs fast.
 *
 * `webServer` (auto-build + preview the Worker) is wired in Phase 8 alongside
 * the first purchase-funnel spec. Until then, start the app yourself and point
 * `PLAYWRIGHT_BASE_URL` at it.
 */
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
