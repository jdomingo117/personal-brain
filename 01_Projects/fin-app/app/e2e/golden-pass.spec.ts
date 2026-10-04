import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { createClient, type Session } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const ANON = process.env.SUPABASE_ANON_KEY ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const TARGET = process.env.HALCYON_TEST_TARGET_ID ?? ''
const PASSWORD = 'correct-horse-battery-staple-1'
const SAMPLES = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../Sample datasets')
const MACQUARIE_MAPPING = {
  dateCol: 'Transaction Date',
  descCol: 'Details',
  debitCol: 'Debit',
  creditCol: 'Credit',
  categoryCol: 'Category',
  subcategoryCol: 'Subcategory',
  dateFormat: 'DD MMM YYYY',
}
const MACQUARIE_HEADERS = [
  'Transaction Date', 'Details', 'Account', 'Category', 'Subcategory', 'Tags',
  'Notes', 'Debit', 'Credit', 'Balance', 'Original Description',
]

if (
  process.env.HALCYON_ALLOW_DESTRUCTIVE_TEST_FIXTURES !== 'isolated-only'
  || !/^halcyon-golden-isolated-/.test(TARGET)
  || !SUPABASE_URL || /:54321\/?$/.test(SUPABASE_URL)
  || !ANON || !SERVICE
) {
  throw new Error('Golden pass requires the self-provisioned isolated target; run npm run test:golden.')
}

const service = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
let userId = ''
let tenantId = ''
let email = ''
let session: Session

async function invoke(token: string, fn: string, body: unknown) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}`, Origin: 'http://127.0.0.1:55300' },
    body: JSON.stringify(body),
  })
  const json = await response.json().catch(() => null)
  expect(response.status, `${fn}: ${JSON.stringify(json)}`).toBe(200)
  return json
}

async function importCsv(page: Page, accountName: string, file: string, expectedRows: number, balance: string) {
  await page.goto('/ingestion')
  await expect(page.getByRole('heading', { name: 'Ingestion' })).toBeVisible()
  const accountValue = await page.getByLabel('Import into').locator('option')
    .filter({ hasText: accountName }).getAttribute('value')
  expect(accountValue).toBeTruthy()
  await page.getByLabel('Import into').selectOption(accountValue!)
  await page.locator('input[type=file]').setInputFiles(resolve(SAMPLES, file))
  await expect(page.getByText(/Layout recognised/)).toBeVisible()
  await page.getByRole('button', { name: `Stage ${expectedRows} rows` }).click()
  await expect(page.getByText(`${expectedRows} ready`, { exact: true })).toBeVisible({ timeout: 180_000 })
  const continueButton = page.getByRole('button', { name: `Continue (${expectedRows} rows)` })
  await expect(continueButton).toBeEnabled({ timeout: 180_000 })
  await continueButton.click()
  await page.getByLabel(`Current balance of ${accountName}`).fill(balance)
  await page.getByRole('button', { name: `Import ${expectedRows} rows` }).click()
  await expect(page.getByText('Import complete', { exact: true })).toBeVisible({ timeout: 180_000 })
  await expect(page.getByText(`${expectedRows} imported`, { exact: true })).toBeVisible()
}

test.describe.serial('isolated golden pass', () => {
  test.beforeAll(async () => {
    email = `golden-${Date.now()}@example.test`
    const client = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
    const signup = await client.auth.signUp({ email, password: PASSWORD })
    if (signup.error || !signup.data.user || !signup.data.session) throw new Error(signup.error?.message ?? 'Golden signup failed')
    userId = signup.data.user.id
    session = signup.data.session
    const profile = await client.from('profiles').select('default_tenant_id').eq('id', userId).single()
    if (profile.error || !profile.data?.default_tenant_id) throw new Error(profile.error?.message ?? 'Golden profile missing')
    tenantId = profile.data.default_tenant_id

    const fingerprint = createHash('sha256').update(MACQUARIE_HEADERS.join('|')).digest('hex')
    const saved = await service.from('static_profiles').insert({
      user_id: userId,
      tenant_id: tenantId,
      name: 'Golden Macquarie layout',
      header_fingerprint: fingerprint,
      mappings: MACQUARIE_MAPPING,
    })
    if (saved.error) throw new Error(`Could not seed deterministic CSV layout: ${saved.error.message}`)
  })

  test.afterAll(async () => {
    if (tenantId) await service.from('tenants').delete().eq('id', tenantId)
    if (userId) await service.auth.admin.deleteUser(userId)
  })

  test('creates accounts, imports real statements, resolves the 203-link batch, and reviews categorisation', async ({ page }) => {
    const browserErrors: string[] = []
    page.on('pageerror', (error) => browserErrors.push(error.message))

    // Authentication itself has dedicated browser coverage. Install the
    // fixture session through the application's own Supabase client so its
    // configured storage key and auth event lifecycle are exercised exactly.
    await page.goto('/login')
    await page.evaluate(async (fixtureSession) => {
      // @ts-expect-error Browser-side Vite module URL, resolved by the dev server.
      const { supabase } = await import('/src/lib/supabaseClient.ts')
      const { error } = await supabase.auth.setSession({
        access_token: fixtureSession.access_token,
        refresh_token: fixtureSession.refresh_token,
      })
      if (error) throw new Error(error.message)
    }, session)
    await page.goto('/onboarding')
    await expect(page).toHaveURL(/\/onboarding$/)
    await page.getByLabel('Callsign').fill('Golden Operator')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByLabel('Account Name').fill('Macquarie Transactions')
    await page.getByLabel('Account Type').selectOption('Liquid')
    await page.getByRole('button', { name: 'Initialize Ledger' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)

    const accountsAfterOnboarding = await service.from('accounts').select('id,name').eq('tenant_id', tenantId)
    expect(accountsAfterOnboarding.error).toBeNull()
    const transactionAccount = accountsAfterOnboarding.data?.find((account) => account.name === 'Macquarie Transactions')
    expect(transactionAccount).toBeTruthy()

    const auth = await createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
      .auth.signInWithPassword({ email, password: PASSWORD })
    expect(auth.error).toBeNull()
    await invoke(auth.data.session!.access_token, 'manage-account-identifier', {
      action: 'add', account_id: transactionAccount!.id, value: '3692',
    })

    await page.goto('/accounts')
    await page.getByRole('button', { name: '+ Add Account' }).click()
    const addDialog = page.getByRole('heading', { name: 'Add Account' }).locator('..').locator('..')
    await addDialog.getByLabel('Account Name').fill('Macquarie Savings')
    await addDialog.getByLabel('Account Type').selectOption('Savings')
    await addDialog.getByLabel('Last 4 digits (Optional)').fill('3965')
    await addDialog.getByRole('button', { name: 'Add Account', exact: true }).click()
    await expect(page.getByRole('option', { name: /Macquarie Savings/ })).toBeAttached()

    await importCsv(page, 'Macquarie Transactions', 'MAcq Trans.csv', 565, '3.05')
    await importCsv(page, 'Macquarie Savings', 'Macq Savings.csv', 234, '141283.29')

    await page.getByRole('button', { name: 'Review transfers' }).click()
    await expect(page).toHaveURL(/\/transfers$/)
    await expect(page.getByText('202 transfers need your review')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('Linked automatically (1)')).toBeVisible()
    await expect(page.getByText('The safe batch limit is 200. 1 transfer will remain for the next action.')).toBeVisible()
    await page.getByRole('button', { name: 'Confirm 200 internal transfers' }).click()
    await expect(page.getByText('2 transfers need your review')).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: 'Confirm 1 internal transfer' }).click()
    await expect(page.getByText('1 transfer need your review')).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: 'Review 1 ambiguous match' }).click()
    await page.getByRole('button', { name: 'Confirm internal transfer', exact: true }).click()
    await expect(page.getByText('Everything is reviewed.')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('alert')).toHaveCount(0)

    const imported = await service.from('transactions')
      .select('id,original_description,category_source,subcategory,upload_batch_id')
      .eq('tenant_id', tenantId)
    expect(imported.error).toBeNull()
    const sourceRows = imported.data?.filter((row) => row.subcategory !== 'Reconciliation') ?? []
    expect(sourceRows).toHaveLength(799)
    expect(new Set(sourceRows.map((row) => row.upload_batch_id).filter(Boolean)).size).toBe(2)
    const reviewed = await service.from('transfer_decisions')
      .select('id', { count: 'exact' }).eq('tenant_id', tenantId).eq('verdict', 'confirmed')
    expect(reviewed.error).toBeNull()
    expect(reviewed.count).toBe(202)

    const aiRow = sourceRows.find((row) => row.category_source === 'ai')
    expect(aiRow, 'The real corpus should exercise AI categorisation before review.').toBeTruthy()
    await page.goto('/ledger')
    await page.getByLabel('Search ledger').fill(aiRow!.original_description)
    await expect(page.getByText('1 transaction', { exact: true })).toBeVisible()
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Review with engine (1)' }).click()
    const reviewDialog = page.getByRole('dialog', { name: 'Review with categorisation engine' })
    await expect(reviewDialog).toBeVisible()
    await expect(reviewDialog.getByText('Asking the current engine for fresh suggestions…')).toHaveCount(0, { timeout: 120_000 })
    await expect(reviewDialog.getByRole('alert')).toHaveCount(0)
    await reviewDialog.getByRole('button', { name: 'Cancel' }).click()

    const accounts = await service.from('accounts').select('name,balance').eq('tenant_id', tenantId)
    expect(accounts.error).toBeNull()
    expect(Object.fromEntries((accounts.data ?? []).map((account) => [account.name, account.balance]))).toMatchObject({
      'Macquarie Transactions': 305,
      'Macquarie Savings': 14_128_329,
    })
    expect(browserErrors).toEqual([])
  })
})
