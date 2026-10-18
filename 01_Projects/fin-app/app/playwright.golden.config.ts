import { defineConfig } from '@playwright/test'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const port = Number(process.env.HALCYON_GOLDEN_APP_PORT ?? 55300)
const baseURL = `http://127.0.0.1:${port}`
const reviewReportDir = process.env.HALCYON_REVIEW_REPORT_DIR
  ?? (process.env.HALCYON_REVIEW_BROWSER === '1' ? resolve(tmpdir(), `halcyon-review-browser-${process.pid}`) : undefined)

export default defineConfig({
  testDir: './e2e',
  testMatch: process.env.HALCYON_REVIEW_BROWSER === '1' ? 'ledger-bulk.spec.ts' : 'golden-pass.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 12 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [['line'], ['html', { outputFolder: reviewReportDir ? `${reviewReportDir}/report` : 'playwright-report-golden', open: 'never' }]],
  outputDir: reviewReportDir ? `${reviewReportDir}/results` : 'test-results/golden',
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
