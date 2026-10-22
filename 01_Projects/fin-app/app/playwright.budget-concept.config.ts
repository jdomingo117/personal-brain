import { defineConfig } from '@playwright/test'

// Fictional browser-only review. No Supabase, auth fixtures or real-data writes.
export default defineConfig({
  testDir: './e2e', testMatch: 'budget-concept.spec.ts', fullyParallel: false, workers: 1,
  timeout: 30000, expect: { timeout: 5000 }, reporter: 'list',
  outputDir: '/tmp/halcyon-budget-concept-results',
  use: { baseURL: 'http://127.0.0.1:5314', viewport: { width: 1440, height: 1100 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -- --port 5314 --host 127.0.0.1', url: 'http://127.0.0.1:5314/budget-concept.html', reuseExistingServer: true, timeout: 30000 },
})
