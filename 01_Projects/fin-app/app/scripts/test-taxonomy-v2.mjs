#!/usr/bin/env node
/** Phase 3 taxonomy identity, validation, and RLS integration tests. */
import { check, section, exitWithSummary, newUserWithAccount, invoke } from './lib/harness.mjs'

async function main() {
  console.log('\n\x1b[1mTaxonomy v2 — Phase 3\x1b[0m')
  const owner = await newUserWithAccount('taxonomy-v2-owner')
  const other = await newUserWithAccount('taxonomy-v2-other')

  section('Canonical reference taxonomy')
  const categories = await owner.client.from('taxonomy_categories')
    .select('id, display_name, classification, sort_order').eq('active', true).order('sort_order')
  check('authenticated users can read the canonical taxonomy', !categories.error && categories.data?.length === 17, categories.error?.message ?? `${categories.data?.length} rows`)
  check('the taxonomy has exactly 13 reporting expense categories', categories.data?.filter((row) => row.classification === 'expense').length === 13, JSON.stringify(categories.data))
  check('stable IDs are independent of display labels', categories.data?.some((row) => row.id === 'financial-and-admin' && row.display_name === 'Financial & admin'), JSON.stringify(categories.data))

  const subcategories = await owner.client.from('taxonomy_subcategories')
    .select('id, category_id, display_name').eq('active', true)
  check('subcategories carry stable parent identities', subcategories.data?.some((row) => row.id === 'shopping.household' && row.category_id === 'shopping' && row.display_name === 'Household'), subcategories.error?.message)

  section('Application-boundary validation and ID synchronization')
  const description = `TAXONOMY V2 ${crypto.randomUUID()}`
  const seed = await invoke('upsert-transactions', owner.token, {
    account_id: owner.accountId,
    date: '2026-08-13',
    original_description: description,
    merchant: 'Taxonomy Test Merchant',
    category: 'Shopping',
    subcategory: 'Household',
    category_source: 'bank',
    amount: -2345,
  })
  check('a canonical category pair is accepted', seed.status === 200, JSON.stringify(seed.json))
  const stored = await owner.client.from('transactions')
    .select('id, category, subcategory, category_id, subcategory_id')
    .eq('original_description', description).single()
  check('transaction stores stable category and subcategory IDs', stored.data?.category_id === 'shopping' && stored.data?.subcategory_id === 'shopping.household', JSON.stringify(stored.data))

  const legacy = await invoke('upsert-transactions', owner.token, {
    account_id: owner.accountId, date: '2026-08-13',
    original_description: `LEGACY ${crypto.randomUUID()}`, merchant: 'Legacy',
    category: 'Retail', subcategory: 'Home', category_source: 'bank', amount: -100,
  })
  check('retired taxonomy labels are rejected at the Edge Function', legacy.status === 422, `status=${legacy.status} ${JSON.stringify(legacy.json)}`)

  const invalidPair = await invoke('upsert-transactions', owner.token, {
    account_id: owner.accountId, date: '2026-08-13',
    original_description: `BAD PAIR ${crypto.randomUUID()}`, merchant: 'Bad Pair',
    category: 'Food & drink', subcategory: 'Car insurance', category_source: 'bank', amount: -100,
  })
  check('invalid parent/subcategory pairs are rejected at the Edge Function', invalidPair.status === 422, `status=${invalidPair.status} ${JSON.stringify(invalidPair.json)}`)

  const uncategorizedDescription = `UNCATEGORIZED ${crypto.randomUUID()}`
  const uncategorized = await invoke('upsert-transactions', owner.token, {
    account_id: owner.accountId, date: '2026-08-13',
    original_description: uncategorizedDescription, merchant: 'Unknown',
    category: 'Uncategorized', amount: -100,
  })
  check('Uncategorized remains a valid explicit state', uncategorized.status === 200, `status=${uncategorized.status} ${JSON.stringify(uncategorized.json)}`)
  const unknownRow = await owner.client.from('transactions')
    .select('category_id, subcategory_id').eq('original_description', uncategorizedDescription).single()
  check('Uncategorized has a stable category ID and no invented subcategory', unknownRow.data?.category_id === 'uncategorized' && unknownRow.data?.subcategory_id === null, JSON.stringify(unknownRow.data))

  section('Database constraint and correction integrity')
  const directInvalid = await owner.client.from('transactions').insert({
    user_id: owner.userId, tenant_id: owner.tenantId, account_id: owner.accountId,
    date: '2026-08-13', original_description: `DIRECT BAD ${crypto.randomUUID()}`,
    merchant: 'Direct Bad', category: 'Food & drink', subcategory: 'Car insurance', amount: -100,
  })
  check('the database trigger also rejects invalid taxonomy pairs', Boolean(directInvalid.error), directInvalid.error?.message)

  const correction = await invoke('update-transaction-category', owner.token, {
    action: 'edit', transaction_id: stored.data?.id,
    category: 'Financial & admin', subcategory: 'Bank fees',
  })
  check('ledger correction accepts the new taxonomy', correction.status === 200, JSON.stringify(correction.json))
  const corrected = await owner.client.from('transactions')
    .select('category, subcategory, category_id, subcategory_id').eq('id', stored.data?.id).single()
  check('ledger correction synchronizes stable IDs', corrected.data?.category_id === 'financial-and-admin' && corrected.data?.subcategory_id === 'financial-and-admin.bank-fees', JSON.stringify(corrected.data))

  const budget = await owner.client.from('budgets').insert({
    user_id: owner.userId, tenant_id: owner.tenantId,
    category: 'Food & drink', amount_limit: 50000,
  }).select('category, category_id').single()
  check('budget categories receive the same stable identity', budget.data?.category_id === 'food-and-drink', budget.error?.message ?? JSON.stringify(budget.data))

  section('Tenant visibility')
  const hiddenRuns = await other.client.from('taxonomy_migration_runs')
    .select('id').eq('tenant_id', owner.tenantId)
  const hiddenEvents = await other.client.from('taxonomy_migration_events')
    .select('id').eq('tenant_id', owner.tenantId)
  check('migration runs are tenant-isolated', !hiddenRuns.error && hiddenRuns.data?.length === 0, hiddenRuns.error?.message ?? JSON.stringify(hiddenRuns.data))
  check('row-level migration events are tenant-isolated', !hiddenEvents.error && hiddenEvents.data?.length === 0, hiddenEvents.error?.message ?? JSON.stringify(hiddenEvents.data))

  exitWithSummary()
}

main().catch((error) => {
  console.error('\x1b[31mHarness error:\x1b[0m', error.message)
  process.exit(2)
})
