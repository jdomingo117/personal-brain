import { defineConfig } from '@playwright/test'

const port = Number(process.env.HALCYON_GOLDEN_APP_PORT ?? 55300)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  testMatch: 'golden-pass.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 12 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [['line'], ['html', { outputFolder: 'playwright-report-golden', open: 'never' }]],
  outputDir: 'test-results/golden',
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 30_000,
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
