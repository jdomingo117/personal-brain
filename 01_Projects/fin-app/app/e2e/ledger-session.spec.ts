import { test, expect, type Page } from '@playwright/test'

async function openSetup(page: Page) {
  await page.getByRole('button', { name: /^(Review categories|Continue review)/ }).click()
  return page.getByRole('dialog', { name: 'Find suggestions worth a look' })
}

async function previewBatch(page: Page, index = 0) {
  const setup = await openSetup(page)
  await setup.getByLabel('Choose a batch').selectOption(String(index))
  await setup.getByRole('button', { name: 'Preview suggestions' }).click()
}

// This fixture mocks every review operation in memory and never uses a Supabase target.
test.beforeEach(async ({ page }) => { await page.goto('/e2e/fixtures/ledger-session.html') })

test('attention shortcut shows the exact union and restores filters without clearing selection', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Search ledger' }).fill('Merchant 010')
  await page.getByRole('checkbox', { name: /Select Merchant 010/ }).check()
  await page.getByRole('button', { name: 'Needs attention 2', exact: true }).click()
  await expect(page.getByText('2 transactions', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Merchant 000/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Merchant 001/ })).toBeVisible()
  await expect(page.getByText(/1 selected · 0 on this page · 1 elsewhere/)).toBeVisible()
  await page.getByRole('button', { name: 'Restore previous filters' }).click()
  await expect(page.getByRole('textbox', { name: 'Search ledger' })).toHaveValue('Merchant 010')
  await expect(page.getByRole('checkbox', { name: /Select Merchant 010/ })).toBeChecked()
})

test('batches remain stable after applying and require confirmation before leaving undo', async ({ page }) => {
  await previewBatch(page)
  let dialog = page.getByRole('dialog', { name: 'Review with categorisation engine' })
  await expect(dialog.getByText(/Batch 1 of 2 · 500 available/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Apply accepted (1)' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Review next batch (70)' }).click()
  await expect(dialog.getByText(/discards the changes selected/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Stay on this batch' }).click()
  await dialog.getByRole('button', { name: 'Apply accepted (1)' }).click()
  await expect(dialog.getByRole('button', { name: 'Undo review' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Review next batch (70)' }).click()
  await expect(dialog.getByText(/closes this batch and its Undo review button/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Continue to next batch' }).click()
  dialog = page.getByRole('dialog', { name: 'Review with categorisation engine' })
  await expect(dialog.getByText(/Batch 2 of 2 · 70 available/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Suggested (1)' })).toBeVisible()
  const calls = await page.evaluate(() => (window as unknown as { ledgerFixtureCalls: Array<{ action: string; transaction_ids?: string[] }> }).ledgerFixtureCalls)
  const previews = calls.filter((call) => call.action === 'preview').map((call) => call.transaction_ids!)
  expect(previews.map((ids) => ids.length)).toEqual([500, 70])
  expect(previews[1]).toEqual(Array.from({ length: 70 }, (_, index) => `txn-${500 + index}`))
  expect(new Set(previews.flat()).size).toBe(570)
})

test('batch 2 can be chosen directly', async ({ page }) => {
  await previewBatch(page, 1)
  const dialog = page.getByRole('dialog', { name: 'Review with categorisation engine' })
  await expect(dialog.getByText(/Batch 2 of 2 · 70 available/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Suggested (1)' })).toBeVisible()
  const calls = await page.evaluate(() => (window as unknown as { ledgerFixtureCalls: Array<{ transaction_ids?: string[] }> }).ledgerFixtureCalls)
  expect(calls[0].transaction_ids?.[0]).toBe('txn-500')
})

test('a failed preview does not advance the batch and can be retried', async ({ page }) => {
  await page.evaluate(() => { (window as unknown as { ledgerFixtureFailure: boolean }).ledgerFixtureFailure = true })
  await previewBatch(page)
  const dialog = page.getByRole('dialog', { name: 'Review with categorisation engine' })
  await expect(dialog.getByText('Couldn’t prepare suggestions')).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Review next batch/ })).toHaveCount(0)
  await page.evaluate(() => { (window as unknown as { ledgerFixtureFailure: boolean }).ledgerFixtureFailure = false })
  await dialog.getByRole('button', { name: 'Try preview again' }).click()
  await expect(dialog.getByRole('button', { name: 'Suggested (1)' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Review next batch (70)' })).toBeVisible()
})

test('setup stays no-write, traps focus, and restores the toolbar opener', async ({ page }) => {
  const setup = await openSetup(page)
  await expect(setup).toBeFocused()
  await setup.press('Shift+Tab')
  await expect(setup.getByRole('button', { name: 'Preview suggestions' })).toBeFocused()
  await setup.press('Tab')
  await expect(setup.getByRole('button', { name: 'Close review setup' })).toBeFocused()
  expect(await page.evaluate(() => (window as unknown as { ledgerFixtureCalls: unknown[] }).ledgerFixtureCalls)).toEqual([])
  await setup.press('Escape')
  await expect(page.getByRole('button', { name: 'Review categories' })).toBeFocused()
  await previewBatch(page)
  const preview = page.getByRole('dialog', { name: 'Review with categorisation engine' })
  await expect(preview.getByRole('button', { name: 'Suggested (1)' })).toBeVisible()
  await preview.getByRole('button', { name: 'Close preview', exact: true }).last().click()
  await expect(page.getByRole('button', { name: 'Continue review' })).toBeFocused()
  const continued = await openSetup(page)
  await expect(continued.getByLabel('Choose a batch')).toHaveValue('1')
})

test('attention count follows narrowed results and other views remain available', async ({ page }) => {
  await page.getByRole('button', { name: 'Needs attention 2', exact: true }).click()
  await page.getByRole('textbox', { name: 'Search ledger' }).fill('Merchant 001')
  await expect(page.getByRole('button', { name: 'Needs attention 1', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /More views/ }).click()
  await page.getByRole('button', { name: 'AI', exact: true }).click()
  await expect(page.getByRole('button', { name: 'AI', exact: true })).toBeVisible()
})

test('empty review explains unavailable scopes without sending a request', async ({ page }) => {
  await page.goto('/e2e/fixtures/ledger-session.html?empty')
  await page.getByRole('button', { name: 'Needs attention 0', exact: true }).click()
  await expect(page.getByText('All caught up. No transactions need attention.')).toBeVisible()
  const setup = await openSetup(page)
  await expect(setup.getByRole('radio', { name: /Review unclassified/ })).toBeDisabled()
  await expect(setup.getByRole('radio', { name: /Check existing categories/ })).toBeDisabled()
  await expect(setup.getByRole('button', { name: 'Preview suggestions' })).toBeDisabled()
  await expect(setup.getByText('No transactions are available for review.')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { ledgerFixtureCalls: unknown[] }).ledgerFixtureCalls)).toEqual([])
})
