#!/usr/bin/env node
/** Phase 5 custom taxonomy, exact splits, rule management, policy and RLS checks. */
import { check, section, exitWithSummary, newUserWithAccount, invoke } from './lib/harness.mjs'

async function seed(user, description, amount = -10000) {
  const result = await invoke('upsert-transactions', user.token, { account_id: user.accountId, date: '2026-08-14', original_description: description, merchant: description, category: 'Shopping', subcategory: 'General retail', amount, category_source: 'bank' })
  if (result.status !== 200) throw new Error(JSON.stringify(result.json))
  const { data, error } = await user.client.from('transactions').select('*').eq('original_description', description).single()
  if (error) throw error
  return data
}

async function main() {
  console.log('\n\x1b[1mPhase 5 — splits, customisation and policy\x1b[0m')
  const owner = await newUserWithAccount('phase5-owner')
  const other = await newUserWithAccount('phase5-other')
  const txn = await seed(owner, `PHASE5 MIXED ${crypto.randomUUID()}`)

  section('Tenant custom subcategory')
  const custom = await invoke('manage-taxonomy', owner.token, { action: 'create_subcategory', category: 'Shopping', name: 'Workshop supplies' })
  check('custom expense subcategory is created through the Edge boundary', custom.status === 200 && custom.json?.display_name === 'Workshop supplies', JSON.stringify(custom.json))
  const visible = await owner.client.from('tenant_subcategories').select('*').eq('id', custom.json.id).single()
  check('custom subcategory is tenant-readable', visible.data?.display_name === 'Workshop supplies', JSON.stringify(visible.data))
  const foreignCustom = await other.client.from('tenant_subcategories').select('id').eq('id', custom.json.id)
  check('custom subcategory is tenant-isolated', foreignCustom.data?.length === 0, JSON.stringify(foreignCustom.data))
  const duplicate = await invoke('manage-taxonomy', owner.token, { action: 'create_subcategory', category: 'Shopping', name: 'workshop SUPPLIES' })
  check('custom names are unique case-insensitively within a category', duplicate.status >= 400, `status=${duplicate.status}`)
  const invalidTop = await invoke('manage-taxonomy', owner.token, { action: 'create_subcategory', category: 'Income', name: 'Side thing' })
  check('custom subcategories cannot redefine non-expense semantics', invalidTop.status >= 400, `status=${invalidTop.status}`)
  const correction = await invoke('update-transaction-category', owner.token, { action: 'edit', transaction_id: txn.id, category: 'Shopping', subcategory: 'Workshop supplies' })
  check('transaction corrections accept the tenant subcategory', correction.status === 200 && correction.json?.subcategory === 'Workshop supplies', JSON.stringify(correction.json))
  const identity = await owner.client.from('transactions').select('subcategory,subcategory_id').eq('id', txn.id).single()
  const customIdentity = await owner.client.from('transactions').select('subcategory,subcategory_id,custom_subcategory_id').eq('id', txn.id).single()
  check('custom subcategory receives a stable tenant identity', customIdentity.data?.subcategory_id === null && customIdentity.data?.custom_subcategory_id === custom.json.id, JSON.stringify(customIdentity.data))

  section('Exact-cent split reporting')
  const split = await invoke('manage-transaction-split', owner.token, { action: 'replace', transaction_id: txn.id, allocations: [
    { position: 0, amount: -6500, kind: 'expense', category: 'Shopping', subcategory: 'Workshop supplies', note: 'Materials' },
    { position: 1, amount: -3500, kind: 'expense', category: 'Food & drink', subcategory: 'Groceries', note: 'Food' },
  ] })
  check('valid exact-cent split succeeds with undo identity', split.status === 200 && split.json?.allocations?.length === 2 && split.json?.edit_id, JSON.stringify(split.json))
  const allocations = await owner.client.from('transaction_allocations').select('*').eq('transaction_id', txn.id).order('position')
  check('split allocations preserve exact signed cents', allocations.data?.reduce((sum, row) => sum + row.amount, 0) === txn.amount, JSON.stringify(allocations.data))
  check('split allocations preserve purpose and custom identity', allocations.data?.[0]?.subcategory === 'Workshop supplies' && allocations.data?.[0]?.custom_subcategory_id === custom.json.id, JSON.stringify(allocations.data?.[0]))
  const parent = await owner.client.from('transactions').select('amount,category,subcategory').eq('id', txn.id).single()
  check('splitting does not mutate the immutable bank amount', parent.data?.amount === txn.amount, JSON.stringify(parent.data))
  const badTotal = await invoke('manage-transaction-split', owner.token, { action: 'replace', transaction_id: txn.id, allocations: [
    { position: 0, amount: -6000, kind: 'expense', category: 'Shopping', subcategory: null, note: null },
    { position: 1, amount: -3000, kind: 'expense', category: 'Shopping', subcategory: null, note: null },
  ] })
  check('non-reconciling split is rejected before persistence', badTotal.status === 400, `status=${badTotal.status}`)
  const stillExact = await owner.client.from('transaction_allocations').select('amount').eq('transaction_id', txn.id)
  check('rejected replacement leaves the prior exact split intact', stillExact.data?.reduce((sum, row) => sum + row.amount, 0) === txn.amount, JSON.stringify(stillExact.data))
  const foreignRows = await other.client.from('transaction_allocations').select('id').eq('transaction_id', txn.id)
  check('split rows are tenant-isolated', foreignRows.data?.length === 0, JSON.stringify(foreignRows.data))
  const foreignEdit = await invoke('manage-transaction-split', other.token, { action: 'replace', transaction_id: txn.id, allocations: [
    { position: 0, amount: -5000, kind: 'expense', category: 'Shopping', subcategory: null, note: null },
    { position: 1, amount: -5000, kind: 'expense', category: 'Shopping', subcategory: null, note: null },
  ] })
  check('another tenant cannot split the transaction', foreignEdit.status === 404, `status=${foreignEdit.status}`)
  const directSplit = await owner.client.rpc('replace_transaction_allocations', { p_tenant: owner.tenantId, p_transaction: txn.id, p_actor: owner.userId, p_allocations: [] })
  check('browser cannot bypass the split Edge Function', Boolean(directSplit.error), directSplit.error?.message)
  const undo = await invoke('manage-transaction-split', owner.token, { action: 'undo', edit_id: split.json.edit_id })
  check('latest split edit is guarded and undoable', undo.status === 200 && undo.json?.allocations?.length === 0, JSON.stringify(undo.json))
  const cleared = await owner.client.from('transaction_allocations').select('id').eq('transaction_id', txn.id)
  check('undo restores the unsplit reporting state', cleared.data?.length === 0, JSON.stringify(cleared.data))

  section('Rules and review policy')
  const policy = await invoke('manage-classification-policy', owner.token, { ai_confidence_threshold: 0.9, review_ai_missing_subcategory: true })
  check('review policy is saved through its Edge boundary', policy.status === 200 && policy.json?.ai_confidence_threshold === 0.9, JSON.stringify(policy.json))
  const storedPolicy = await owner.client.from('classification_review_policies').select('*').single()
  check('review policy is tenant-readable', storedPolicy.data?.ai_confidence_threshold === 0.9 && storedPolicy.data?.review_ai_missing_subcategory, JSON.stringify(storedPolicy.data))
  const lowDescription = `PHASE5 LOW AI ${crypto.randomUUID()}`
  const highDescription = `PHASE5 HIGH AI ${crypto.randomUUID()}`
  await invoke('upsert-transactions', owner.token, { account_id: owner.accountId, date: '2026-08-14', original_description: lowDescription, merchant: lowDescription, category: 'Shopping', subcategory: 'General retail', amount: -101, category_source: 'ai', category_confidence: 0.8 })
  await invoke('upsert-transactions', owner.token, { account_id: owner.accountId, date: '2026-08-14', original_description: highDescription, merchant: highDescription, category: 'Shopping', subcategory: 'General retail', amount: -102, category_source: 'ai', category_confidence: 0.95 })
  const confidenceRows = await owner.client.from('transactions').select('original_description,category_confidence,needs_review').in('original_description', [lowDescription, highDescription])
  const low = confidenceRows.data?.find((row) => row.original_description === lowDescription)
  const high = confidenceRows.data?.find((row) => row.original_description === highDescription)
  check('AI confidence is persisted on imported transactions', low?.category_confidence === 0.8 && high?.category_confidence === 0.95, JSON.stringify(confidenceRows.data))
  check('configured threshold sends only the low-confidence AI row to review', low?.needs_review === true && high?.needs_review === false, JSON.stringify(confidenceRows.data))
  const foreignPolicy = await other.client.from('classification_review_policies').select('*')
  check('review policy is tenant-isolated', foreignPolicy.data?.length === 0, JSON.stringify(foreignPolicy.data))
  const directPolicy = await owner.client.rpc('set_classification_review_policy', { p_tenant: owner.tenantId, p_actor: owner.userId, p_threshold: 0.5, p_missing: false })
  check('browser cannot bypass the policy Edge Function', Boolean(directPolicy.error), directPolicy.error?.message)

  const rule = await invoke('apply-merchant-rule', owner.token, { action: 'apply', merchantKey: txn.merchant_key, merchantDisplay: txn.merchant, category: 'Shopping', subcategory: 'Workshop supplies', applyToExisting: true })
  check('reusable merchant rules accept tenant subcategories', rule.status === 200, JSON.stringify(rule.json))
  const ruleRow = await owner.client.from('merchant_rules').select('*').eq('merchant_key', txn.merchant_key).single()
  check('managed user rule is visible with stable custom identity', ruleRow.data?.source === 'user' && ruleRow.data?.custom_subcategory_id === custom.json.id, JSON.stringify(ruleRow.data))
  const remove = await invoke('manage-merchant-rule', owner.token, { action: 'delete', rule_id: ruleRow.data.id })
  check('user rule can be deleted without rewriting history', remove.status === 200 && remove.json?.deleted, JSON.stringify(remove.json))
  const deleted = await owner.client.from('merchant_rules').select('id').eq('id', ruleRow.data.id)
  check('deleted rule no longer affects future classification', deleted.data?.length === 0, JSON.stringify(deleted.data))
  const foreignDelete = await invoke('manage-merchant-rule', other.token, { action: 'delete', rule_id: ruleRow.data.id })
  check('another tenant cannot manage the rule', foreignDelete.status === 404, `status=${foreignDelete.status}`)
  const audit = await owner.client.from('audit_log').select('action').in('action', ['taxonomy.subcategory_created','transaction.split_replaced','transaction.split_undone','classification.policy_updated','merchant_rule.deleted'])
  check('Phase 5 mutations are audit logged', new Set(audit.data?.map((row) => row.action)).size === 5, JSON.stringify(audit.data))

  exitWithSummary()
}
main().catch((error) => { console.error('\x1b[31mHarness error:\x1b[0m', error.message); process.exit(2) })
