import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
if (
  process.env.HALCYON_ALLOW_DESTRUCTIVE_TEST_FIXTURES !== 'isolated-only'
  || !process.env.HALCYON_TEST_TARGET_ID
  || ['http://127.0.0.1:54321', 'http://localhost:54321'].includes(SUPABASE_URL.replace(/\/$/, ''))
) {
  throw new Error('Ledger browser fixtures require an explicitly identified isolated Supabase target; see SYSTEM_INTEGRITY.md.')
}
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const PASSWORD = 'correct-horse-battery-staple-1'

interface Fixture {
  email: string
  userId: string
  tenantId: string
  service: SupabaseClient
}

let fixture: Fixture

function isoDaysBefore(index: number) {
  const date = new Date(Date.UTC(2026, 7, 15))
  date.setUTCDate(date.getUTCDate() - index)
  return date.toISOString().slice(0, 10)
}

async function seedFixture(): Promise<Fixture> {
  if (!ANON_KEY || !SERVICE_KEY) throw new Error('Browser tests require local Supabase credentials')
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = `ledger-browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  let userId: string | null = null
  let tenantId: string | null = null
  try {
    const { data: auth, error: authError } = await client.auth.signUp({ email, password: PASSWORD })
    if (authError || !auth.user) throw new Error(`fixture signup failed: ${authError?.message}`)
    const seededUserId = auth.user.id
    userId = seededUserId
    const { data: profile, error: profileError } = await client.from('profiles')
      .select('default_tenant_id').eq('id', userId).single()
    if (profileError || !profile?.default_tenant_id) throw new Error(`fixture profile failed: ${profileError?.message}`)
    const seededTenantId = profile.default_tenant_id
    tenantId = seededTenantId
    const accountId = crypto.randomUUID()
    const { error: accountError } = await service.from('accounts').insert({
      id: accountId, user_id: seededUserId, tenant_id: seededTenantId,
      name: 'Ledger browser regression', type: 'Liquid', balance: 0, currency: 'AUD',
    })
    if (accountError) throw new Error(`fixture account failed: ${accountError.message}`)

    const base = {
      user_id: seededUserId, tenant_id: seededTenantId, account_id: accountId,
      category_source: 'bank', category_confidence: 0.9, needs_review: false,
      kind: 'expense', kind_source: 'derived', is_recurring: false, recurring_source: 'derived',
      is_subscription: false, subscription_source: 'derived', spending_nature: null,
      is_reimbursable: false, is_tax_related: false,
    }
    const capRows = Array.from({ length: 507 }, (_, index) => ({
      ...base, id: crypto.randomUUID(), date: isoDaysBefore(index),
      original_description: `E2E CAP ${String(index + 1).padStart(3, '0')}`,
      merchant: `E2E CAP ${String(index + 1).padStart(3, '0')}`,
      category: 'Food & drink', subcategory: 'Coffee', amount: -(500 + index),
    }))
    const specialRows = [
      { ...base, id: crypto.randomUUID(), date: '2027-08-15', original_description: 'E2E MIXED COFFEE', merchant: 'E2E MIXED COFFEE', category: 'Food & drink', subcategory: 'Coffee', amount: -1200 },
      { ...base, id: crypto.randomUUID(), date: '2027-08-14', original_description: 'E2E MIXED GROCERIES', merchant: 'E2E MIXED GROCERIES', category: 'Food & drink', subcategory: 'Groceries', amount: -1900 },
      { ...base, id: crypto.randomUUID(), date: '2027-08-13', original_description: 'E2E ATTR EXPENSE', merchant: 'E2E ATTR EXPENSE', category: 'Shopping', subcategory: 'Household', amount: -2100 },
      { ...base, id: crypto.randomUUID(), date: '2027-08-12', original_description: 'E2E ATTR INCOME', merchant: 'E2E ATTR INCOME', category: 'Income', subcategory: 'Salary', amount: 75000, kind: 'income', kind_source: 'user', is_recurring: true, recurring_source: 'user', is_subscription: true, subscription_source: 'user', spending_nature: 'essential', is_reimbursable: true, is_tax_related: true },
      { ...base, id: crypto.randomUUID(), date: '2027-08-11', original_description: 'E2E PROTECTED RECONCILIATION', merchant: 'E2E PROTECTED RECONCILIATION', category: 'Transfer', subcategory: 'Reconciliation', amount: 100 },
    ]
    for (let index = 0; index < capRows.length; index += 150) {
      const { error } = await service.from('transactions').insert(capRows.slice(index, index + 150))
      if (error) throw new Error(`cap fixture failed: ${error.message}`)
    }
    const { error: specialError } = await service.from('transactions').insert(specialRows)
    if (specialError) throw new Error(`special fixture failed: ${specialError.message}`)
    return { email, userId: seededUserId, tenantId: seededTenantId, service }
  } catch (error) {
    if (tenantId) await service.from('tenants').delete().eq('id', tenantId)
    if (userId) await service.auth.admin.deleteUser(userId)
    throw error
  }
}

async function loginToLedger(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(fixture.email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL('/')
  await page.getByRole('button', { name: 'Ledger', exact: true }).click()
  await expect(page).toHaveURL('/ledger')
  await expect(page.getByRole('heading', { name: 'Ledger' })).toBeVisible()
}

async function filterLedger(page: Page, query: string, count: number) {
  await page.getByRole('textbox', { name: 'Search ledger' }).fill(query)
  await expect(page.getByText(`${count} transaction${count === 1 ? '' : 's'}`, { exact: true })).toBeVisible()
}

test.describe.serial('Ledger bulk browser regressions', () => {
  test.beforeAll(async () => { fixture = await seedFixture() })
  test.afterAll(async () => {
    if (!fixture) return
    await fixture.service.from('tenants').delete().eq('id', fixture.tenantId)
    await fixture.service.auth.admin.deleteUser(fixture.userId)
  })
  test.beforeEach(async ({ page }) => { await loginToLedger(page) })

  test('mixed fields remain unchanged until an explicit impact is chosen', async ({ page }) => {
    await filterLedger(page, 'E2E MIXED', 2)
    await page.getByRole('button', { name: 'Select all matching (2)' }).click()
    await page.getByRole('button', { name: 'Correct categories (2)' }).click()
    const dialog = page.getByRole('dialog', { name: 'Correct 2 transactions' })
    await expect(dialog.getByLabel('Bulk category')).toHaveValue('Food & drink')
    await expect(dialog.getByLabel('Bulk subcategory')).toHaveValue('__leave_unchanged__')
    await expect(dialog.getByText('Coffee (1) · Groceries (1)')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Apply to selection' })).toBeDisabled()
    await dialog.getByLabel('Bulk subcategory').selectOption('Dining & takeaway')
    await expect(dialog.getByText(/2 of 2 subcategories/)).toBeVisible()
    await expect(dialog.getByText(/2 of 2 ledger entries will be updated/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Apply to selection' })).toBeEnabled()
    await dialog.press('Escape')
    await expect(page.getByRole('button', { name: 'Correct categories (2)' })).toBeFocused()
  })

  test('cross-page selection reports its scope and clears globally', async ({ page }) => {
    await filterLedger(page, 'E2E CAP', 507)
    await page.getByRole('checkbox').nth(0).check()
    await page.getByRole('checkbox').nth(1).check()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Select page (50)' }).click()
    await expect(page.getByRole('status')).toHaveText('52 selected · 50 on this page · 2 elsewhere')
    await page.getByRole('button', { name: 'Clear all (52)' }).click()
    await expect(page.getByRole('status')).toHaveCount(0)
    await expect(page.getByRole('checkbox').first()).not.toBeChecked()
  })

  test('select all matching enforces and processes the visible 500-row boundary', async ({ page }) => {
    await filterLedger(page, 'E2E CAP', 507)
    await page.getByRole('button', { name: 'Select first 500 of 507 matching' }).click()
    await expect(page.getByRole('status')).toHaveText('500 selected · 50 on this page · 450 elsewhere')
    await expect(page.getByText('Bulk limit: 500 rows per correction.')).toBeVisible()
    for (let pageNumber = 1; pageNumber < 11; pageNumber++) await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Page 11 of 11')).toBeVisible()
    const finalPageChecks = page.getByRole('checkbox')
    await expect(finalPageChecks).toHaveCount(7)
    for (let index = 0; index < 7; index++) await expect(finalPageChecks.nth(index)).toBeDisabled()

    await page.getByRole('button', { name: 'Correct categories (500)' }).click()
    const dialog = page.getByRole('dialog', { name: 'Correct 500 transactions' })
    await dialog.getByLabel('Bulk subcategory').selectOption('Dining & takeaway')
    await dialog.getByRole('button', { name: 'Apply to selection' }).click()
    await expect(dialog.getByText('Updated 500 transactions.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Undo bulk correction' }).click()
    await expect(dialog.getByText('Updated 500 transactions.')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Done', exact: true }).click()
    await page.getByRole('button', { name: 'Clear all (500)' }).click()
  })

  test('kind and attributes update safely with exact reporting impact and grouped undo', async ({ page }) => {
    await filterLedger(page, 'E2E ATTR', 2)
    await page.getByRole('button', { name: 'Select all matching (2)' }).click()
    await page.getByRole('button', { name: 'Edit attributes (2)' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit accounting & attributes for 2' })
    for (const label of ['Bulk transaction kind', 'Bulk recurring', 'Bulk subscription', 'Bulk spending nature', 'Bulk reimbursable', 'Bulk tax-related']) {
      await expect(dialog.getByLabel(label)).toHaveValue('__leave_unchanged__')
    }
    await expect(dialog.getByRole('button', { name: 'Apply to selection' })).toBeDisabled()
    await dialog.getByLabel('Bulk transaction kind').selectOption('transfer')
    await dialog.getByLabel('Bulk recurring').selectOption('true')
    await dialog.getByLabel('Bulk tax-related').selectOption('false')
    await expect(dialog.getByText('Expense reporting decreases by $21.00.')).toBeVisible()
    await expect(dialog.getByText('Earned income decreases by $750.00.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Apply to selection' }).click()
    await expect(dialog.getByText('Updated 2 transactions.')).toBeVisible()
    await expect(dialog.getByText('Transfer (2)')).toBeVisible()
    await dialog.getByRole('button', { name: 'Undo bulk attributes' }).click()
    await expect(dialog.getByText('Expense (1) · Income (1)')).toBeVisible()
    await expect(dialog.getByText('No (1) · Yes (1)').first()).toBeVisible()
  })

  test('protected rows block attribute edits atomically', async ({ page }) => {
    await filterLedger(page, 'E2E PROTECTED', 1)
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Edit attributes (1)' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit accounting & attributes for 1' })
    await expect(dialog.getByRole('alert')).toContainText('Remove the 1 system reconciliation entry')
    await dialog.getByLabel('Bulk tax-related').selectOption('true')
    await expect(dialog.getByRole('button', { name: 'Apply to selection' })).toBeDisabled()
  })

  test('all Ledger dialogs trap focus and restore the opener or completed-flow fallback', async ({ page }) => {
    await filterLedger(page, 'E2E ATTR', 2)
    const rowOpener = page.getByRole('button', { name: /E2E ATTR INCOME/ })
    await rowOpener.click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeFocused()
    await drawer.press('Tab')
    await expect(page.getByRole('button', { name: 'Close transaction detail' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(page.getByRole('button', { name: 'Split transaction' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Close transaction detail' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(rowOpener).toBeFocused()

    const rulesOpener = page.getByRole('button', { name: 'Rules & review policy' })
    await rulesOpener.click()
    await expect(page.getByRole('dialog', { name: 'Rules & review policy' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(page.getByRole('button', { name: 'Save review policy' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Close rules and review policy' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(rulesOpener).toBeFocused()

    await page.getByRole('button', { name: 'Select all matching (2)' }).click()
    const categoryOpener = page.getByRole('button', { name: 'Correct categories (2)' })
    await categoryOpener.click()
    await expect(page.getByRole('dialog', { name: 'Correct 2 transactions' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(categoryOpener).toBeFocused()

    const attributesOpener = page.getByRole('button', { name: 'Edit attributes (2)' })
    await attributesOpener.click()
    const attributes = page.getByRole('dialog', { name: 'Edit accounting & attributes for 2' })
    await expect(attributes).toBeFocused()
    await attributes.getByLabel('Bulk tax-related').selectOption('false')
    await attributes.getByRole('button', { name: 'Apply to selection' }).click()
    await expect(attributes.getByText('Updated 1 transaction.')).toBeVisible()
    await attributes.getByRole('button', { name: 'Done and clear selection' }).click()
    await expect(page.getByRole('button', { name: 'Select page (2)' })).toBeFocused()
    await expect(page.getByRole('status')).toHaveCount(0)
  })
})
