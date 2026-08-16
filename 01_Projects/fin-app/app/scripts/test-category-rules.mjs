#!/usr/bin/env node
/** Phase 2 bulk correction and merchant-rule integration tests. */
import { check, section, exitWithSummary, newUserWithAccount, invoke } from './lib/harness.mjs'

async function seed(user, merchant, suffix, category = 'Food & drink', subcategory = 'Coffee') {
  const description = `${merchant} ${suffix}`
  const result = await invoke('upsert-transactions', user.token, {
    account_id: user.accountId,
    date: '2026-08-13',
    original_description: description,
    merchant,
    category,
    subcategory,
    category_source: 'bank',
    amount: -1250,
  })
  if (result.status !== 200) throw new Error(`seed failed: ${JSON.stringify(result.json)}`)
  const { data, error } = await user.client.from('transactions')
    .select('id, merchant_key, category, subcategory, category_source')
    .eq('original_description', description).single()
  if (error) throw error
  return data
}

async function main() {
  console.log('\n\x1b[1mBulk categories and merchant rules — Phase 2\x1b[0m')
  const owner = await newUserWithAccount('category-rule-owner')
  const other = await newUserWithAccount('category-rule-other')
  const merchant = `Phase Two Merchant ${crypto.randomUUID().slice(0, 8)}`
  const first = await seed(owner, merchant, 'ONE')
  const second = await seed(owner, merchant, 'TWO')

  section('Durable merchant identity')
  check('ingested transactions have a stable merchant key', first.merchant_key === merchant.toLowerCase(), JSON.stringify(first))
  check('matching merchant displays share the same key', second.merchant_key === first.merchant_key, JSON.stringify(second))

  section('Atomic selected-transaction correction')
  const bulk = await invoke('update-transaction-category', owner.token, {
    action: 'bulk_edit', transaction_ids: [first.id, second.id],
    category: 'Shopping', subcategory: 'Household',
  })
  check('bulk correction succeeds as one operation', bulk.status === 200 && bulk.json?.updated === 2 && typeof bulk.json?.operation_id === 'string', JSON.stringify(bulk.json))
  const bulkRows = await owner.client.from('transactions')
    .select('id, category, subcategory, category_source, category_confidence')
    .in('id', [first.id, second.id])
  check('every selected row receives manual provenance', bulkRows.data?.every((row) => row.category === 'Shopping' && row.subcategory === 'Household' && row.category_source === 'user' && row.category_confidence === 1), JSON.stringify(bulkRows.data))
  const bulkHistory = await owner.client.from('transaction_category_edits')
    .select('operation_id, scope').eq('operation_id', bulk.json.operation_id)
  check('bulk history is grouped and scoped', bulkHistory.data?.length === 2 && bulkHistory.data.every((row) => row.scope === 'selection'), JSON.stringify(bulkHistory.data))

  const undo = await invoke('update-transaction-category', owner.token, {
    action: 'undo_operation', operation_id: bulk.json.operation_id,
  })
  check('bulk correction can be undone atomically', undo.status === 200 && undo.json?.restored === 2, JSON.stringify(undo.json))
  const restored = await owner.client.from('transactions').select('category, subcategory, category_source').in('id', [first.id, second.id])
  check('bulk undo restores every prior classification', restored.data?.every((row) => row.category === 'Food & drink' && row.subcategory === 'Coffee' && row.category_source === 'bank'), JSON.stringify(restored.data))

  section('Mixed fields are preserved unless explicitly changed')
  const makeMixed = await invoke('update-transaction-category', owner.token, {
    action: 'bulk_edit', transaction_ids: [second.id],
    category: 'Food & drink', subcategory: 'Groceries',
  })
  check('fixture can create a mixed subcategory selection', makeMixed.status === 200 && makeMixed.json?.updated === 1, JSON.stringify(makeMixed.json))
  const partial = await invoke('update-transaction-category', owner.token, {
    action: 'bulk_edit', transaction_ids: [first.id, second.id],
    subcategory: 'Dining & takeaway',
  })
  check('subcategory-only correction succeeds', partial.status === 200 && partial.json?.updated === 2 && partial.json?.category_updated === false && partial.json?.subcategory_updated === true, JSON.stringify(partial.json))
  const partialRows = await owner.client.from('transactions').select('category, subcategory').in('id', [first.id, second.id])
  check('omitted category is preserved on every selected row', partialRows.data?.every((row) => row.category === 'Food & drink' && row.subcategory === 'Dining & takeaway'), JSON.stringify(partialRows.data))
  const partialUndo = await invoke('update-transaction-category', owner.token, {
    action: 'undo_operation', operation_id: partial.json.operation_id,
  })
  const partialRestored = await owner.client.from('transactions').select('id, category, subcategory').in('id', [first.id, second.id])
  check('partial correction undo restores each distinct prior subcategory', partialUndo.status === 200 && partialRestored.data?.find((row) => row.id === first.id)?.subcategory === 'Coffee' && partialRestored.data?.find((row) => row.id === second.id)?.subcategory === 'Groceries', JSON.stringify(partialRestored.data))
  const missingSubcategory = await invoke('update-transaction-category', owner.token, {
    action: 'bulk_edit', transaction_ids: [first.id, second.id], category: 'Shopping',
  })
  check('category changes require an explicit subcategory choice', missingSubcategory.status === 422, `status=${missingSubcategory.status}`)

  section('Maximum selected-set boundary')
  const capRows = Array.from({ length: 500 }, (_, index) => ({
    id: crypto.randomUUID(), user_id: owner.userId, tenant_id: owner.tenantId, account_id: owner.accountId,
    date: '2026-08-13', original_description: `BULK CAP HARNESS ${index + 1}`,
    merchant: `Bulk Cap Harness ${index + 1}`, category: 'Food & drink', subcategory: 'Coffee',
    category_source: 'bank', category_confidence: 0.95, needs_review: false, amount: -(500 + index),
  }))
  const capSeed = await owner.client.from('transactions').insert(capRows)
  check('500-row boundary fixture is accepted', !capSeed.error, capSeed.error?.message)
  const capBulk = await invoke('update-transaction-category', owner.token, {
    action: 'bulk_edit', transaction_ids: capRows.map((row) => row.id), subcategory: 'Dining & takeaway',
  })
  check('maximum 500-row correction succeeds', capBulk.status === 200 && capBulk.json?.updated === 500, JSON.stringify(capBulk.json))
  const capChanged = await owner.client.from('transactions').select('id', { count: 'exact', head: true })
    .like('merchant', 'Bulk Cap Harness %').eq('subcategory', 'Dining & takeaway')
  check('all 500 boundary rows changed', capChanged.count === 500, `count=${capChanged.count}`)
  const capUndo = await invoke('update-transaction-category', owner.token, {
    action: 'undo_operation', operation_id: capBulk.json?.operation_id,
  })
  check('maximum 500-row correction undoes atomically', capUndo.status === 200 && capUndo.json?.restored === 500, JSON.stringify(capUndo.json))
  const overCap = await invoke('update-transaction-category', owner.token, {
    action: 'bulk_edit', transaction_ids: [...capRows.map((row) => row.id), first.id], subcategory: 'Dining & takeaway',
  })
  check('501-row correction is rejected at validation', overCap.status === 422, `status=${overCap.status}`)
  await owner.client.from('transactions').delete().like('merchant', 'Bulk Cap Harness %')

  section('Merchant-wide impact preview and durable rule')
  const preview = await invoke('apply-merchant-rule', owner.token, {
    action: 'preview', merchantKey: first.merchant_key, merchantDisplay: merchant,
    category: 'Health & wellbeing', subcategory: 'Medical', applyToExisting: true,
  })
  check('preview reports existing and changed impact without writing', preview.status === 200 && preview.json?.existing_matches === 2 && preview.json?.transactions_to_update === 2, JSON.stringify(preview.json))
  const beforeApply = await owner.client.from('transactions').select('category').eq('id', first.id).single()
  check('preview is read-only', beforeApply.data?.category === 'Food & drink', JSON.stringify(beforeApply.data))

  const apply = await invoke('apply-merchant-rule', owner.token, {
    action: 'apply', merchantKey: first.merchant_key, merchantDisplay: merchant,
    category: 'Health & wellbeing', subcategory: 'Medical', applyToExisting: true,
  })
  check('rule application updates both existing matches', apply.status === 200 && apply.json?.updated === 2 && apply.json?.existing_matches === 2, JSON.stringify(apply.json))
  const rule = await owner.client.from('merchant_rules').select('category, subcategory, source, confidence').eq('merchant_key', first.merchant_key).single()
  check('future rule is durable with user precedence', rule.data?.category === 'Health & wellbeing' && rule.data?.subcategory === 'Medical' && rule.data?.source === 'user' && rule.data?.confidence === 1, JSON.stringify(rule.data))

  const resolved = await invoke('categorize-merchants', owner.token, {
    merchants: [{
      key: first.merchant_key, display: merchant, direction: 'outflow',
      sampleDescriptions: [merchant], bankCategory: 'Food & drink', bankSubcategory: 'Dining & takeaway',
    }],
  })
  check('user rule outranks a later bank category', resolved.status === 200 && resolved.json?.assignments?.[0]?.source === 'user' && resolved.json?.assignments?.[0]?.category === 'Health & wellbeing', JSON.stringify(resolved.json))

  section('Tenant and mutation-boundary integrity')
  const foreignBulk = await invoke('update-transaction-category', other.token, {
    action: 'bulk_edit', transaction_ids: [first.id], category: 'Other', subcategory: 'Miscellaneous',
  })
  check('another tenant cannot bulk-edit selected rows', foreignBulk.status === 404, `status=${foreignBulk.status}`)
  const foreignPreview = await invoke('apply-merchant-rule', other.token, {
    action: 'preview', merchantKey: first.merchant_key, merchantDisplay: merchant,
    category: 'Other', subcategory: 'Miscellaneous', applyToExisting: true,
  })
  check('another tenant sees no matching impact', foreignPreview.status === 200 && foreignPreview.json?.existing_matches === 0, JSON.stringify(foreignPreview.json))
  const directRpc = await owner.client.rpc('bulk_edit_transaction_categories', {
    p_tenant_id: owner.tenantId, p_transaction_ids: [first.id], p_actor_id: owner.userId,
    p_category: 'Other', p_subcategory: 'Miscellaneous',
  })
  check('browser cannot bypass the Edge Function through the bulk RPC', Boolean(directRpc.error), directRpc.error?.message)
  const directPartialRpc = await owner.client.rpc('bulk_edit_transaction_categories', {
    p_tenant_id: owner.tenantId, p_transaction_ids: [first.id], p_actor_id: owner.userId,
    p_category: null, p_subcategory: 'Coffee', p_update_category: false, p_update_subcategory: true,
  })
  check('browser cannot bypass the Edge Function through the partial bulk RPC', Boolean(directPartialRpc.error), directPartialRpc.error?.message)

  exitWithSummary()
}

main().catch((error) => {
  console.error('\x1b[31mHarness error:\x1b[0m', error.message)
  process.exit(2)
})
