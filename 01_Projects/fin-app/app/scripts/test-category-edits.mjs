#!/usr/bin/env node
/**
 * Phase 1 editable-ledger integration tests.
 * Requires the local stack and functions serve process.
 */
import {
  check, section, exitWithSummary, newUserWithAccount, invoke,
} from './lib/harness.mjs'

async function seed(user, description, category = 'Food & drink', subcategory = 'Coffee') {
  const result = await invoke('upsert-transactions', user.token, {
    account_id: user.accountId,
    date: '2026-08-12',
    original_description: description,
    merchant: description,
    category,
    subcategory,
    category_source: 'bank',
    amount: -750,
  })
  if (result.status !== 200) throw new Error(`seed failed: ${JSON.stringify(result.json)}`)
  const { data, error } = await user.client.from('transactions')
    .select('id, category, subcategory, category_source, category_confidence, needs_review')
    .eq('original_description', description).single()
  if (error) throw error
  return data
}

async function main() {
  console.log('\n\x1b[1mTransaction category edits — Phase 1\x1b[0m')
  const owner = await newUserWithAccount('category-edit-owner')
  const other = await newUserWithAccount('category-edit-other')
  const original = await seed(owner, `CATEGORY EDIT ${crypto.randomUUID()}`)

  section('Validated transaction-only edit')
  const edit = await invoke('update-transaction-category', owner.token, {
    action: 'edit', transaction_id: original.id,
    category: 'Shopping', subcategory: 'Household',
  })
  check('edit succeeds', edit.status === 200, JSON.stringify(edit.json))
  check('edit returns an undo identity', typeof edit.json?.edit_id === 'string', JSON.stringify(edit.json))

  const changed = await owner.client.from('transactions')
    .select('category, subcategory, category_source, category_confidence, needs_review')
    .eq('id', original.id).single()
  check('transaction is recategorised', changed.data?.category === 'Shopping' && changed.data?.subcategory === 'Household', JSON.stringify(changed.data))
  check('manual provenance and confidence are recorded', changed.data?.category_source === 'user' && changed.data?.category_confidence === 1 && changed.data?.needs_review === false, JSON.stringify(changed.data))

  const analytic = await owner.client.from('transactions_analytic')
    .select('category, category_confidence').eq('id', original.id).single()
  check('analytic ledger view exposes confidence', analytic.data?.category === 'Shopping' && analytic.data?.category_confidence === 1, JSON.stringify(analytic.data))

  const history = await owner.client.from('transaction_category_edits').select('*').eq('id', edit.json.edit_id).single()
  check('before and after values are durable', history.data?.before_category === 'Food & drink' && history.data?.after_category === 'Shopping', JSON.stringify(history.data))

  section('Taxonomy and system-entry guards')
  const badPair = await invoke('update-transaction-category', owner.token, {
    action: 'edit', transaction_id: original.id,
    category: 'Food & drink', subcategory: 'Car insurance',
  })
  check('invalid category/subcategory pair is rejected', badPair.status === 422, `status=${badPair.status}`)

  const reconciliation = await seed(owner, 'Opening Balance Offset (Reconciliation)', 'Transfer', 'Reconciliation')
  const locked = await invoke('update-transaction-category', owner.token, {
    action: 'edit', transaction_id: reconciliation.id,
    category: 'Other', subcategory: 'Miscellaneous',
  })
  check('system reconciliation entry is locked', locked.status === 409, `status=${locked.status}`)

  section('Guarded undo and stale-undo protection')
  const second = await invoke('update-transaction-category', owner.token, {
    action: 'edit', transaction_id: original.id,
    category: 'Health & wellbeing', subcategory: 'Medical',
  })
  check('a later edit succeeds', second.status === 200, JSON.stringify(second.json))

  const staleUndo = await invoke('update-transaction-category', owner.token, {
    action: 'undo', edit_id: edit.json.edit_id,
  })
  check('an older edit cannot overwrite the newer correction', staleUndo.status === 409, `status=${staleUndo.status}`)

  const undoSecond = await invoke('update-transaction-category', owner.token, {
    action: 'undo', edit_id: second.json.edit_id,
  })
  check('latest edit can be undone', undoSecond.status === 200 && undoSecond.json?.category === 'Shopping', JSON.stringify(undoSecond.json))
  const undoFirst = await invoke('update-transaction-category', owner.token, {
    action: 'undo', edit_id: edit.json.edit_id,
  })
  check('prior edit becomes undoable after the latest is reversed', undoFirst.status === 200 && undoFirst.json?.category === 'Food & drink', JSON.stringify(undoFirst.json))

  const restored = await owner.client.from('transactions')
    .select('category, subcategory, category_source, category_confidence')
    .eq('id', original.id).single()
  check('undo restores original classification metadata', restored.data?.category === 'Food & drink' && restored.data?.subcategory === 'Coffee' && restored.data?.category_source === 'bank' && restored.data?.category_confidence === null, JSON.stringify(restored.data))

  section('Tenant and write-boundary integrity')
  const hiddenHistory = await other.client.from('transaction_category_edits').select('id').eq('transaction_id', original.id)
  check('another tenant cannot read edit history', hiddenHistory.data?.length === 0, JSON.stringify(hiddenHistory.data))
  const crossTenant = await invoke('update-transaction-category', other.token, {
    action: 'edit', transaction_id: original.id,
    category: 'Other', subcategory: 'Miscellaneous',
  })
  check('another tenant cannot edit the transaction', crossTenant.status === 404, `status=${crossTenant.status}`)

  const directRpc = await owner.client.rpc('edit_transaction_category', {
    p_tenant_id: owner.tenantId,
    p_transaction_id: original.id,
    p_actor_id: owner.userId,
    p_category: 'Other',
    p_subcategory: 'Miscellaneous',
  })
  check('browser cannot bypass the Edge Function through the RPC', Boolean(directRpc.error), directRpc.error?.message)
  const forgedHistory = await owner.client.from('transaction_category_edits')
    .update({ after_category: 'Other' }).eq('id', edit.json.edit_id).select('id')
  check('browser cannot rewrite category history', Boolean(forgedHistory.error), forgedHistory.error?.message)

  const audit = await owner.client.from('audit_log')
    .select('action, metadata').in('action', ['transaction.category_edited', 'transaction.category_edit_undone'])
  check('edits and undos are written to the append-only audit log', (audit.data?.length ?? 0) >= 4, `${audit.data?.length ?? 0} events`)

  exitWithSummary()
}

main().catch((error) => {
  console.error('\x1b[31mHarness error:\x1b[0m', error.message)
  process.exit(2)
})
