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

async function invokeResponse(token: string, fn: string, body: unknown) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}`, Origin: 'http://127.0.0.1:55300' },
    body: JSON.stringify(body),
  })
  const json = await response.json().catch(() => null)
  return { response, json }
}

async function invoke(token: string, fn: string, body: unknown) {
  const { response, json } = await invokeResponse(token, fn, body)
  expect(response.status, `${fn}: ${JSON.stringify(json)}`).toBe(200)
  return json
}

async function createFixtureAccount(name: string) {
  const created = await service.from('accounts').insert({
    tenant_id: tenantId,
    user_id: userId,
    name,
    type: 'Liquid',
    currency: 'AUD',
    balance: 0,
  }).select('id').single()
  expect(created.error).toBeNull()
  return created.data!.id
}

function importRow(accountId: string, date: string, description: string, amount: number, batchId: string) {
  return {
    account_id: accountId,
    date,
    original_description: description,
    merchant: description,
    category: amount >= 0 ? 'Income' : 'Shopping',
    subcategory: amount >= 0 ? 'Other' : 'General retail',
    amount,
    upload_batch_id: batchId,
  }
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

  test('enforces the 5,000-source-row boundary while preserving one server-generated reconciliation anchor', async () => {
    const created = await service.from('accounts').insert({
      tenant_id: tenantId,
      user_id: userId,
      name: 'Golden ingestion limit account',
      type: 'Liquid',
      currency: 'AUD',
      balance: 0,
    }).select('id').single()
    expect(created.error).toBeNull()
    const accountId = created.data!.id
    const batchId = crypto.randomUUID()
    const rows = Array.from({ length: 5_000 }, (_, index) => ({
      account_id: accountId,
      date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
      original_description: `Golden limit transaction ${index}`,
      merchant: `Golden limit merchant ${index}`,
      category: 'Income',
      subcategory: 'Other',
      amount: 1,
      upload_batch_id: batchId,
    }))

    const imported = await invoke(session.access_token, 'upsert-transactions', {
      transactions: rows,
      target_balance: 0,
      file_name: 'exactly-5000.csv',
      source_row_count: 5_000,
      blocked_count: 0,
    })
    expect(imported).toMatchObject({ inserted: 5_000, skipped: 0, reconciliationAmount: -5_000 })

    const transactionRows = await service.from('transactions')
      .select('id', { count: 'exact', head: true }).eq('account_id', accountId)
    const reconciliationRows = await service.from('transactions')
      .select('id').eq('account_id', accountId).eq('subcategory', 'Reconciliation')
    expect(transactionRows.error).toBeNull()
    expect(reconciliationRows.error).toBeNull()
    expect(transactionRows.count).toBe(5_001)
    expect(reconciliationRows.data).toHaveLength(1)

    const batch = await service.from('upload_batches')
      .select('source_row_count,inserted_count,skipped_count,blocked_count,reconciliation_amount')
      .eq('id', batchId).single()
    expect(batch.error).toBeNull()
    expect(batch.data).toEqual({
      source_row_count: 5_000,
      inserted_count: 5_000,
      skipped_count: 0,
      blocked_count: 0,
      reconciliation_amount: -5_000,
    })

    const beforeRejected = transactionRows.count
    const { response, json } = await invokeResponse(session.access_token, 'upsert-transactions', {
      transactions: [{
        account_id: accountId,
        date: '2026-02-01',
        original_description: 'Must not be imported',
        merchant: 'Must not be imported',
        category: 'Income',
        subcategory: 'Other',
        amount: 1,
        upload_batch_id: crypto.randomUUID(),
      }],
      source_row_count: 5_001,
      blocked_count: 0,
    })
    expect(response.status, JSON.stringify(json)).toBe(422)

    const afterRejected = await service.from('transactions')
      .select('id', { count: 'exact', head: true }).eq('account_id', accountId)
    expect(afterRejected.error).toBeNull()
    expect(afterRejected.count).toBe(beforeRejected)
  })

  test('keeps the categorisation endpoint boundary at 300 merchants', async () => {
    const { response, json } = await invokeResponse(session.access_token, 'categorize-merchants', {
      merchants: Array.from({ length: 301 }, (_, index) => ({
        key: `golden-boundary-${index}`,
        display: `Golden boundary ${index}`,
        direction: 'outflow',
        sampleDescriptions: [`Golden boundary ${index}`],
      })),
    })
    expect(response.status, JSON.stringify(json)).toBe(422)
  })

  test('preserves sequential-import counts, partial-overlap dedupe and one replacement reconciliation anchor', async () => {
    const accountId = await createFixtureAccount('Golden sequential import account')
    const firstBatch = crypto.randomUUID()
    const first = await invoke(session.access_token, 'upsert-transactions', {
      transactions: [
        importRow(accountId, '2026-04-01', 'Golden opening income', 10_000, firstBatch),
        importRow(accountId, '2026-04-02', 'Golden shared purchase', -2_000, firstBatch),
      ],
      target_balance: 50_000,
      file_name: 'golden-first.csv',
      source_row_count: 2,
      blocked_count: 0,
    })
    expect(first).toMatchObject({ inserted: 2, skipped: 0, reconciliationAmount: 42_000 })

    const secondBatch = crypto.randomUUID()
    const second = await invoke(session.access_token, 'upsert-transactions', {
      transactions: [
        importRow(accountId, '2026-04-02', 'Golden shared purchase', -2_000, secondBatch),
        importRow(accountId, '2026-04-03', 'Golden newly seen purchase', -3_000, secondBatch),
      ],
      target_balance: 47_000,
      file_name: 'golden-overlap.csv',
      source_row_count: 2,
      blocked_count: 0,
    })
    expect(second).toMatchObject({ inserted: 1, skipped: 1, reconciliationAmount: 42_000 })

    const ledger = await service.from('transactions')
      .select('amount,subcategory', { count: 'exact' }).eq('account_id', accountId)
    expect(ledger.error).toBeNull()
    expect(ledger.count).toBe(4)
    expect(ledger.data?.filter((row) => row.subcategory === 'Reconciliation')).toHaveLength(1)
    expect((ledger.data ?? []).reduce((total, row) => total + row.amount, 0)).toBe(47_000)

    const account = await service.from('accounts').select('balance').eq('id', accountId).single()
    expect(account.error).toBeNull()
    expect(account.data?.balance).toBe(47_000)
    const batches = await service.from('upload_batches')
      .select('id,inserted_count,skipped_count,source_row_count,reconciliation_amount')
      .in('id', [firstBatch, secondBatch])
    expect(batches.error).toBeNull()
    expect(batches.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: firstBatch, inserted_count: 2, skipped_count: 0, source_row_count: 2, reconciliation_amount: 42_000 }),
      expect.objectContaining({ id: secondBatch, inserted_count: 1, skipped_count: 1, source_row_count: 2, reconciliation_amount: 42_000 }),
    ]))
  })

  test('rolls back the complete import when reconciliation would exceed integer-cent range', async () => {
    const accountId = await createFixtureAccount('Golden atomic rollback account')
    const batchId = crypto.randomUUID()
    const { response, json } = await invokeResponse(session.access_token, 'upsert-transactions', {
      transactions: [importRow(accountId, '2026-04-04', 'Golden overflow purchase', -2_147_483_648, batchId)],
      target_balance: 2_147_483_647,
      file_name: 'golden-overflow.csv',
      source_row_count: 1,
      blocked_count: 0,
    })
    expect(response.status, JSON.stringify(json)).toBe(400)

    const rows = await service.from('transactions').select('id', { count: 'exact', head: true }).eq('account_id', accountId)
    const batch = await service.from('upload_batches').select('id', { count: 'exact', head: true }).eq('id', batchId)
    const account = await service.from('accounts').select('balance').eq('id', accountId).single()
    expect(rows.error).toBeNull()
    expect(batch.error).toBeNull()
    expect(account.error).toBeNull()
    expect(rows.count).toBe(0)
    expect(batch.count).toBe(0)
    expect(account.data?.balance).toBe(0)
  })

  test('allows CSV history before connected-account cutover but rejects provider-owned dates and reconciliation', async () => {
    const accountId = await createFixtureAccount('Golden connected cutover account')
    const connection = await service.from('provider_connections').insert({
      tenant_id: tenantId,
      user_id: userId,
      provider: 'up',
      status: 'active',
      token_hint: 'golden',
    }).select('id').single()
    expect(connection.error).toBeNull()
    const linked = await service.from('account_connections').insert({
      tenant_id: tenantId,
      connection_id: connection.data!.id,
      account_id: accountId,
      provider: 'up',
      provider_account_id: `golden-${crypto.randomUUID()}`,
      provider_account_type: 'TRANSACTIONAL',
      provider_ownership: 'INDIVIDUAL',
      cutover_date: '2026-06-01',
    })
    expect(linked.error).toBeNull()

    const beforeCutover = await invoke(session.access_token, 'upsert-transactions', {
      transactions: [importRow(accountId, '2026-05-31', 'Golden pre-cutover history', -100, crypto.randomUUID())],
      source_row_count: 1,
      blocked_count: 0,
    })
    expect(beforeCutover).toMatchObject({ inserted: 1, skipped: 0 })

    const afterCutover = await invokeResponse(session.access_token, 'upsert-transactions', {
      transactions: [importRow(accountId, '2026-06-01', 'Golden provider-owned history', -200, crypto.randomUUID())],
      source_row_count: 1,
      blocked_count: 0,
    })
    expect(afterCutover.response.status, JSON.stringify(afterCutover.json)).toBe(409)
    expect(afterCutover.json).toMatchObject({ error: 'connected_account_period_overlap', cutover_date: '2026-06-01' })

    const reconciliation = await invokeResponse(session.access_token, 'upsert-transactions', {
      transactions: [importRow(accountId, '2026-05-31', 'Golden forbidden connected reconciliation', -300, crypto.randomUUID())],
      target_balance: 10_000,
      source_row_count: 1,
      blocked_count: 0,
    })
    expect(reconciliation.response.status, JSON.stringify(reconciliation.json)).toBe(409)
    expect(reconciliation.json).toMatchObject({ error: 'connected_account_reconciliation_forbidden', cutover_date: '2026-06-01' })

    const rows = await service.from('transactions').select('id', { count: 'exact', head: true }).eq('account_id', accountId)
    const account = await service.from('accounts').select('balance').eq('id', accountId).single()
    expect(rows.error).toBeNull()
    expect(account.error).toBeNull()
    expect(rows.count).toBe(1)
    expect(account.data?.balance).toBe(0)
  })

  test('persists a saved CSV profile by fingerprint without duplicate layouts', async () => {
    const headers = ['Golden date', 'Golden details', 'Golden debit', 'Golden credit']
    const initialMappings = {
      dateCol: 'Golden date',
      descCol: 'Golden details',
      debitCol: 'Golden debit',
      creditCol: 'Golden credit',
      dateFormat: 'DD/MM/YYYY',
    }
    const created = await invoke(session.access_token, 'upsert-profile', {
      headers,
      displayName: 'Golden original layout',
      mappings: initialMappings,
    })
    const updatedMappings = { ...initialMappings, descCol: 'Golden credit', categoryCol: null }
    const updated = await invoke(session.access_token, 'upsert-profile', {
      headers,
      displayName: 'Golden corrected layout',
      mappings: updatedMappings,
    })
    expect(updated.id).toBe(created.id)

    const profiles = await service.from('static_profiles')
      .select('id,name,mappings').eq('tenant_id', tenantId).eq('header_fingerprint', created.header_fingerprint)
    expect(profiles.error).toBeNull()
    expect(profiles.data).toHaveLength(1)
    expect(profiles.data?.[0]).toMatchObject({
      id: created.id,
      name: 'Golden corrected layout',
      mappings: expect.objectContaining({ descCol: 'Golden credit', categoryCol: null }),
    })
  })

  test('resolves active tenant custom taxonomy pairs and rejects invalid or cross-tenant pairs before import', async () => {
    const custom = await invoke(session.access_token, 'manage-taxonomy', {
      action: 'create_subcategory', category: 'Shopping', name: 'Golden household project',
    })
    const dormant = await invoke(session.access_token, 'manage-taxonomy', {
      action: 'create_subcategory', category: 'Shopping', name: 'Golden dormant project',
    })
    const deactivated = await service.from('tenant_subcategories')
      .update({ active: false }).eq('id', dormant.id)
    expect(deactivated.error).toBeNull()

    const created = await service.from('accounts').insert({
      tenant_id: tenantId,
      user_id: userId,
      name: 'Golden taxonomy account',
      type: 'Liquid',
      currency: 'AUD',
      balance: 0,
    }).select('id').single()
    expect(created.error).toBeNull()
    const accountId = created.data!.id

    const imported = await invoke(session.access_token, 'upsert-transactions', {
      transactions: [{
        account_id: accountId,
        date: '2026-03-01',
        original_description: 'Golden custom taxonomy purchase',
        merchant: 'Golden custom taxonomy purchase',
        category: 'shopping',
        subcategory: 'golden household project',
        amount: -1_234,
        upload_batch_id: crypto.randomUUID(),
      }],
      source_row_count: 1,
      blocked_count: 0,
    })
    expect(imported).toMatchObject({ inserted: 1, skipped: 0 })

    const written = await service.from('transactions')
      .select('category,subcategory,category_id,custom_subcategory_id')
      .eq('account_id', accountId).single()
    expect(written.error).toBeNull()
    expect(written.data).toMatchObject({
      category: 'Shopping',
      subcategory: 'Golden household project',
      category_id: 'shopping',
      custom_subcategory_id: custom.id,
    })

    const beforeInvalid = await service.from('transactions')
      .select('id', { count: 'exact', head: true }).eq('account_id', accountId)
    const invalidPairs = [
      { category: 'Food & drink', subcategory: 'Car insurance', description: 'Golden wrong parent' },
      { category: 'Not a Halcyon category', subcategory: null, description: 'Golden unknown category' },
      { category: 'Shopping', subcategory: 'Golden dormant project', description: 'Golden inactive custom' },
    ]
    for (const invalid of invalidPairs) {
      const { response, json } = await invokeResponse(session.access_token, 'upsert-transactions', {
        transactions: [{
          account_id: accountId,
          date: '2026-03-02',
          original_description: invalid.description,
          merchant: invalid.description,
          category: invalid.category,
          subcategory: invalid.subcategory,
          amount: -1,
          upload_batch_id: crypto.randomUUID(),
        }],
        source_row_count: 1,
        blocked_count: 0,
      })
      expect(response.status, JSON.stringify(json)).toBe(422)
      expect(json).toMatchObject({ error: 'invalid_taxonomy_pair' })
    }
    const afterInvalid = await service.from('transactions')
      .select('id', { count: 'exact', head: true }).eq('account_id', accountId)
    expect(afterInvalid.count).toBe(beforeInvalid.count)

    const directClient = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
    const directSession = await directClient.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })
    expect(directSession.error).toBeNull()
    const directWrite = await directClient.from('transactions').insert({
      tenant_id: tenantId, user_id: userId, account_id: accountId, date: '2026-03-03',
      original_description: 'Forbidden direct write', merchant: 'Forbidden direct write',
      category: 'Shopping', subcategory: 'Golden household project', amount: -1,
    })
    expect(directWrite.error).toBeTruthy()

    let foreignUserId = ''
    let foreignTenantId = ''
    try {
      const foreignEmail = `golden-taxonomy-foreign-${Date.now()}@example.test`
      const foreign = await service.auth.admin.createUser({
        email: foreignEmail,
        password: PASSWORD,
        email_confirm: true,
      })
      expect(foreign.error).toBeNull()
      foreignUserId = foreign.data.user!.id
      const foreignProfile = await service.from('profiles')
        .select('default_tenant_id').eq('id', foreignUserId).single()
      expect(foreignProfile.error).toBeNull()
      foreignTenantId = foreignProfile.data!.default_tenant_id
      const foreignAccount = await service.from('accounts').insert({
        tenant_id: foreignTenantId,
        user_id: foreignUserId,
        name: 'Golden foreign taxonomy account',
        type: 'Liquid',
        currency: 'AUD',
        balance: 0,
      }).select('id').single()
      expect(foreignAccount.error).toBeNull()
      const foreignSignIn = await createClient(SUPABASE_URL, ANON, {
        auth: { persistSession: false, autoRefreshToken: false },
      }).auth.signInWithPassword({ email: foreignEmail, password: PASSWORD })
      expect(foreignSignIn.error).toBeNull()
      const { response, json } = await invokeResponse(foreignSignIn.data.session!.access_token, 'upsert-transactions', {
        transactions: [{
          account_id: foreignAccount.data!.id,
          date: '2026-03-04',
          original_description: 'Foreign tenant custom label',
          merchant: 'Foreign tenant custom label',
          category: 'Shopping',
          subcategory: 'Golden household project',
          amount: -1,
          upload_batch_id: crypto.randomUUID(),
        }],
        source_row_count: 1,
        blocked_count: 0,
      })
      expect(response.status, JSON.stringify(json)).toBe(422)
      expect(json).toMatchObject({ error: 'invalid_taxonomy_pair' })
    } finally {
      if (foreignTenantId) await service.from('tenants').delete().eq('id', foreignTenantId)
      if (foreignUserId) await service.auth.admin.deleteUser(foreignUserId)
    }
  })
})
