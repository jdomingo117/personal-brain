#!/usr/bin/env node
/** Kind, attributes, safe bulk editing, contra-expense, audit, undo, and RLS checks. */
import { check, section, exitWithSummary, newUserWithAccount, invoke } from './lib/harness.mjs'

async function seed(user, description, category, subcategory, amount) {
  const result = await invoke('upsert-transactions', user.token, {
    account_id: user.accountId, date: '2026-08-14', original_description: description,
    merchant: description, category, subcategory, amount, category_source: 'bank',
  })
  if (result.status !== 200) throw new Error(`seed failed: ${JSON.stringify(result.json)}`)
  const { data, error } = await user.client.from('transactions_analytic').select('*')
    .eq('original_description', description).single()
  if (error) throw error
  return data
}

async function main() {
  console.log('\n\x1b[1mTransaction kind and attributes — Phase 4\x1b[0m')
  const owner = await newUserWithAccount('classification-owner')
  const other = await newUserWithAccount('classification-other')

  section('Derived kind and contra-expense semantics')
  const expense = await seed(owner, `CLASS EXPENSE ${crypto.randomUUID()}`, 'Shopping', 'Household', -5000)
  const income = await seed(owner, `CLASS INCOME ${crypto.randomUUID()}`, 'Income', 'Salary', 100000)
  const refund = await seed(owner, `CLASS REFUND ${crypto.randomUUID()}`, 'Income', 'Refund', 1200)
  const reimbursement = await seed(owner, `CLASS REIMBURSEMENT ${crypto.randomUUID()}`, 'Income', 'Reimbursement', 800)
  const transfer = await seed(owner, `CLASS TRANSFER ${crypto.randomUUID()}`, 'Transfer', 'Internal', -2000)
  const subscription = await seed(owner, `CLASS SUBSCRIPTION ${crypto.randomUUID()}`, 'Lifestyle', 'Streaming', -1500)
  const anchor = await seed(owner, 'Opening Balance Offset (Reconciliation)', 'Transfer', 'Reconciliation', 100)
  check('expense purpose derives expense behavior', expense.kind === 'expense' && expense.kind_source === 'derived', JSON.stringify(expense))
  check('salary derives earned-income behavior', income.kind === 'income', JSON.stringify(income))
  check('refund is not recorded as earned income', refund.kind === 'refund', JSON.stringify(refund))
  check('reimbursement is not recorded as earned income', reimbursement.kind === 'reimbursement', JSON.stringify(reimbursement))
  check('account movement derives transfer behavior', transfer.kind === 'transfer' && transfer.is_transfer === true, JSON.stringify(transfer))
  check('subscription is an attribute on its spending purpose', subscription.kind === 'expense' && subscription.category === 'Lifestyle' && subscription.is_subscription === true, JSON.stringify(subscription))
  check('reconciliation derives a protected adjustment', anchor.kind === 'adjustment' && anchor.kind_source === 'system' && anchor.is_transfer === false, JSON.stringify(anchor))

  section('Audited independent classification')
  const edit = await invoke('update-transaction-classification', owner.token, {
    action: 'edit', transaction_id: expense.id, kind: 'refund',
    is_recurring: true, is_subscription: true, spending_nature: 'discretionary',
    is_reimbursable: true, is_tax_related: true,
  })
  check('classification edit succeeds with an undo identity', edit.status === 200 && typeof edit.json?.edit_id === 'string', JSON.stringify(edit.json))
  const changed = await owner.client.from('transactions_analytic')
    .select('category,subcategory,kind,kind_source,is_recurring,recurring_source,is_subscription,subscription_source,spending_nature,is_reimbursable,is_tax_related,is_transfer')
    .eq('id', expense.id).single()
  check('kind changes independently of spending purpose', changed.data?.category === 'Shopping' && changed.data?.kind === 'refund' && changed.data?.kind_source === 'user', JSON.stringify(changed.data))
  check('all classification attributes persist with user precedence', changed.data?.is_recurring === true && changed.data?.recurring_source === 'user' && changed.data?.is_subscription === true && changed.data?.subscription_source === 'user' && changed.data?.spending_nature === 'discretionary' && changed.data?.is_reimbursable === true && changed.data?.is_tax_related === true, JSON.stringify(changed.data))

  const history = await owner.client.from('transaction_classification_edits').select('*').eq('id', edit.json.edit_id).single()
  check('before and after classification are durable', history.data?.before_kind === 'expense' && history.data?.after_kind === 'refund' && history.data?.after_attributes?.is_tax_related === true, JSON.stringify(history.data))

  const categoryEdit = await invoke('update-transaction-category', owner.token, {
    action: 'edit', transaction_id: expense.id, category: 'Food & drink', subcategory: 'Groceries',
  })
  check('a later category correction succeeds', categoryEdit.status === 200, JSON.stringify(categoryEdit.json))
  const preserved = await owner.client.from('transactions').select('category,kind,kind_source,is_subscription,subscription_source').eq('id', expense.id).single()
  check('category correction cannot overwrite manual kind or subscription choice', preserved.data?.category === 'Food & drink' && preserved.data?.kind === 'refund' && preserved.data?.kind_source === 'user' && preserved.data?.is_subscription === true && preserved.data?.subscription_source === 'user', JSON.stringify(preserved.data))

  const undo = await invoke('update-transaction-classification', owner.token, { action: 'undo', edit_id: edit.json.edit_id })
  check('latest classification edit is undoable', undo.status === 200 && undo.json?.kind === 'expense', JSON.stringify(undo.json))
  const restored = await owner.client.from('transactions').select('kind,kind_source,is_recurring,is_subscription,spending_nature,is_reimbursable,is_tax_related').eq('id', expense.id).single()
  check('undo restores the complete prior classification state', restored.data?.kind === 'expense' && restored.data?.kind_source === 'derived' && restored.data?.is_recurring === false && restored.data?.is_subscription === false && restored.data?.spending_nature === null && restored.data?.is_reimbursable === false && restored.data?.is_tax_related === false, JSON.stringify(restored.data))

  const recategoriseToIncome = await invoke('update-transaction-category', owner.token, {
    action: 'edit', transaction_id: expense.id, category: 'Income', subcategory: 'Salary',
  })
  const rederived = await owner.client.from('transactions').select('category,kind,kind_source').eq('id', expense.id).single()
  check('category correction re-derives kind only when kind has not been manually pinned', recategoriseToIncome.status === 200 && rederived.data?.kind === 'income' && rederived.data?.kind_source === 'derived', JSON.stringify(rederived.data))

  section('Partial bulk attributes and grouped undo')
  const bulkFirst = await seed(owner, `CLASS BULK FIRST ${crypto.randomUUID()}`, 'Shopping', 'Household', -2100)
  const bulkSecond = await seed(owner, `CLASS BULK SECOND ${crypto.randomUUID()}`, 'Income', 'Salary', 75000)
  const makeMixed = await invoke('update-transaction-classification', owner.token, {
    action: 'edit', transaction_id: bulkSecond.id, kind: 'income', is_recurring: false,
    is_subscription: true, spending_nature: 'essential', is_reimbursable: true, is_tax_related: false,
  })
  check('fixture creates heterogeneous classification state', makeMixed.status === 200, JSON.stringify(makeMixed.json))
  const bulkEdit = await invoke('update-transaction-classification', owner.token, {
    action: 'bulk_edit', transaction_ids: [bulkFirst.id, bulkSecond.id],
    is_recurring: true, is_tax_related: true,
  })
  check('partial bulk classification succeeds as one operation', bulkEdit.status === 200 && bulkEdit.json?.updated === 2 && typeof bulkEdit.json?.operation_id === 'string', JSON.stringify(bulkEdit.json))
  const bulkChanged = await owner.client.from('transactions').select('id,kind,kind_source,is_recurring,recurring_source,is_subscription,subscription_source,spending_nature,is_reimbursable,is_tax_related').in('id', [bulkFirst.id, bulkSecond.id])
  const firstChanged = bulkChanged.data?.find((row) => row.id === bulkFirst.id)
  const secondChanged = bulkChanged.data?.find((row) => row.id === bulkSecond.id)
  check('bulk edit changes only explicitly selected values and sources', firstChanged?.kind === 'expense' && firstChanged?.kind_source === 'derived' && firstChanged?.is_recurring === true && firstChanged?.recurring_source === 'user' && firstChanged?.is_subscription === false && firstChanged?.subscription_source === 'derived' && firstChanged?.is_tax_related === true, JSON.stringify(firstChanged))
  check('bulk edit preserves heterogeneous omitted attributes', secondChanged?.kind === 'income' && secondChanged?.kind_source === 'user' && secondChanged?.is_subscription === true && secondChanged?.subscription_source === 'user' && secondChanged?.spending_nature === 'essential' && secondChanged?.is_reimbursable === true && secondChanged?.is_tax_related === true, JSON.stringify(secondChanged))
  const bulkHistory = await owner.client.from('transaction_classification_edits').select('operation_id,scope,before_attributes,after_attributes').eq('operation_id', bulkEdit.json.operation_id)
  check('bulk classification history is grouped and scoped', bulkHistory.data?.length === 2 && bulkHistory.data.every((row) => row.scope === 'selection' && row.after_attributes?.recurring_source === 'user'), JSON.stringify(bulkHistory.data))
  const bulkUndo = await invoke('update-transaction-classification', owner.token, { action: 'undo_operation', operation_id: bulkEdit.json.operation_id })
  check('bulk classification undo restores all rows atomically', bulkUndo.status === 200 && bulkUndo.json?.restored === 2, JSON.stringify(bulkUndo.json))
  const bulkRestored = await owner.client.from('transactions').select('id,kind,kind_source,is_recurring,recurring_source,is_subscription,subscription_source,spending_nature,is_reimbursable,is_tax_related').in('id', [bulkFirst.id, bulkSecond.id])
  const firstRestored = bulkRestored.data?.find((row) => row.id === bulkFirst.id)
  const secondRestored = bulkRestored.data?.find((row) => row.id === bulkSecond.id)
  check('grouped undo restores each distinct prior classification', firstRestored?.kind === 'expense' && firstRestored?.kind_source === 'derived' && firstRestored?.is_recurring === false && firstRestored?.recurring_source === 'derived' && firstRestored?.is_tax_related === false && secondRestored?.is_subscription === true && secondRestored?.spending_nature === 'essential' && secondRestored?.is_reimbursable === true, JSON.stringify(bulkRestored.data))

  const staleBulk = await invoke('update-transaction-classification', owner.token, {
    action: 'bulk_edit', transaction_ids: [bulkFirst.id, bulkSecond.id], is_tax_related: true,
  })
  const laterEdit = await invoke('update-transaction-classification', owner.token, {
    action: 'edit', transaction_id: bulkFirst.id, kind: 'refund', is_recurring: false,
    is_subscription: false, spending_nature: null, is_reimbursable: false, is_tax_related: false,
  })
  const staleUndo = await invoke('update-transaction-classification', owner.token, { action: 'undo_operation', operation_id: staleBulk.json?.operation_id })
  const untouchedAfterStaleUndo = await owner.client.from('transactions').select('is_tax_related').eq('id', bulkSecond.id).single()
  check('a later single-row edit makes grouped undo stale', laterEdit.status === 200 && staleUndo.status === 409, `edit=${laterEdit.status} undo=${staleUndo.status}`)
  check('stale grouped undo is all-or-nothing', untouchedAfterStaleUndo.data?.is_tax_related === true, JSON.stringify(untouchedAfterStaleUndo.data))

  section('Maximum bulk classification boundary')
  const capRows = Array.from({ length: 500 }, (_, index) => ({
    id: crypto.randomUUID(), user_id: owner.userId, tenant_id: owner.tenantId, account_id: owner.accountId,
    date: '2026-08-14', original_description: `CLASSIFICATION CAP ${index + 1}`,
    merchant: `Classification Cap ${index + 1}`, category: 'Shopping', subcategory: 'Household',
    category_source: 'bank', category_confidence: 0.95, needs_review: false, amount: -(600 + index),
  }))
  const capSeed = await owner.client.from('transactions').insert(capRows)
  check('500-row classification fixture is accepted', !capSeed.error, capSeed.error?.message)
  const capBulk = await invoke('update-transaction-classification', owner.token, {
    action: 'bulk_edit', transaction_ids: capRows.map((row) => row.id), is_reimbursable: true,
  })
  check('maximum 500-row classification edit succeeds', capBulk.status === 200 && capBulk.json?.updated === 500, JSON.stringify(capBulk.json))
  const capUndo = await invoke('update-transaction-classification', owner.token, { action: 'undo_operation', operation_id: capBulk.json?.operation_id })
  check('maximum 500-row classification edit undoes atomically', capUndo.status === 200 && capUndo.json?.restored === 500, JSON.stringify(capUndo.json))
  const overCap = await invoke('update-transaction-classification', owner.token, {
    action: 'bulk_edit', transaction_ids: [...capRows.map((row) => row.id), bulkFirst.id], is_reimbursable: true,
  })
  check('501-row classification edit is rejected at validation', overCap.status === 422, `status=${overCap.status}`)
  await owner.client.from('transactions').delete().like('merchant', 'Classification Cap %')

  section('Operational kind and security boundaries')
  const kindTransfer = await invoke('update-transaction-classification', owner.token, {
    action: 'edit', transaction_id: expense.id, kind: 'transfer', is_recurring: false,
    is_subscription: false, spending_nature: null, is_reimbursable: false, is_tax_related: false,
  })
  const analyticTransfer = await owner.client.from('transactions_analytic').select('kind,is_transfer').eq('id', expense.id).single()
  check('analytic transfer behavior follows kind, not category text', kindTransfer.status === 200 && analyticTransfer.data?.kind === 'transfer' && analyticTransfer.data?.is_transfer === true, JSON.stringify(analyticTransfer.data))

  const locked = await invoke('update-transaction-classification', owner.token, {
    action: 'edit', transaction_id: anchor.id, kind: 'income', is_recurring: false,
    is_subscription: false, spending_nature: null, is_reimbursable: false, is_tax_related: false,
  })
  check('system reconciliation classification is locked', locked.status === 409, `status=${locked.status}`)
  const lockedBulk = await invoke('update-transaction-classification', owner.token, {
    action: 'bulk_edit', transaction_ids: [bulkSecond.id, anchor.id], is_tax_related: true,
  })
  check('a protected reconciliation row blocks the entire bulk edit', lockedBulk.status === 409, `status=${lockedBulk.status}`)
  const invalid = await invoke('update-transaction-classification', owner.token, {
    action: 'edit', transaction_id: expense.id, kind: 'purchase', is_recurring: false,
    is_subscription: false, spending_nature: null, is_reimbursable: false, is_tax_related: false,
  })
  check('unknown kinds are rejected by Zod', invalid.status === 422, `status=${invalid.status}`)

  const foreignHistory = await other.client.from('transaction_classification_edits').select('id').eq('transaction_id', expense.id)
  check('classification history is tenant-isolated', foreignHistory.data?.length === 0, JSON.stringify(foreignHistory.data))
  const foreignEdit = await invoke('update-transaction-classification', other.token, {
    action: 'edit', transaction_id: expense.id, kind: 'income', is_recurring: false,
    is_subscription: false, spending_nature: null, is_reimbursable: false, is_tax_related: false,
  })
  check('another tenant cannot edit classification', foreignEdit.status === 404, `status=${foreignEdit.status}`)
  const foreignBulk = await invoke('update-transaction-classification', other.token, {
    action: 'bulk_edit', transaction_ids: [bulkSecond.id], is_tax_related: false,
  })
  check('another tenant cannot bulk-edit classification', foreignBulk.status === 404, `status=${foreignBulk.status}`)
  const directRpc = await owner.client.rpc('edit_transaction_classification', {
    p_tenant_id: owner.tenantId, p_transaction_id: expense.id, p_actor_id: owner.userId,
    p_kind: 'income', p_is_recurring: false, p_is_subscription: false,
    p_spending_nature: null, p_is_reimbursable: false, p_is_tax_related: false,
  })
  check('browser cannot bypass the Edge Function through the RPC', Boolean(directRpc.error), directRpc.error?.message)
  const directBulkRpc = await owner.client.rpc('bulk_edit_transaction_classification', {
    p_tenant_id: owner.tenantId, p_transaction_ids: [bulkSecond.id], p_actor_id: owner.userId,
    p_update_kind: false, p_kind: null, p_update_is_recurring: false, p_is_recurring: null,
    p_update_is_subscription: false, p_is_subscription: null,
    p_update_spending_nature: false, p_spending_nature: null,
    p_update_is_reimbursable: false, p_is_reimbursable: null,
    p_update_is_tax_related: true, p_is_tax_related: false,
  })
  check('browser cannot bypass the Edge Function through the bulk classification RPC', Boolean(directBulkRpc.error), directBulkRpc.error?.message)
  const audit = await owner.client.from('audit_log').select('action').in('action', ['transaction.classification_edited','transaction.classification_edit_undone'])
  check('classification edits and undo are audit logged', (audit.data?.length ?? 0) >= 3, `${audit.data?.length ?? 0} events`)

  exitWithSummary()
}

main().catch((error) => { console.error('\x1b[31mHarness error:\x1b[0m', error.message); process.exit(2) })
