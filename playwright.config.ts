import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for MicroFlex E2E Tests
 *
 * Run via Docker (uses isolated microflex_test database):
 *   docker compose --profile test run --rm test-e2e
 *
 * Or locally (requires running app + DATABASE_URL pointing to test DB):
 *   npx playwright test
 */
export default defineConfig({
  testDir: './tests/e2e',

  /* Global setup/teardown — truncates transactional tables for clean test runs */
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',

  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['html', { open: 'never', outputFolder: 'tests/e2e/report' }],
    ['list']
  ],

  use: {
    /* Base URL — app is at :5000 in Docker */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5000',

    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* No webServer block — tests run against a running Docker app instance */
});
