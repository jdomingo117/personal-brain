#!/usr/bin/env node
/** Selected-row categorisation review contract. Requires an isolated test target. */
import { check, section, exitWithSummary, newUserWithAccount, invoke } from './lib/harness.mjs'

async function seed(user, description, source, confidence, category = 'Food & drink', subcategory = 'Coffee') {
  const write = await invoke('upsert-transactions', user.token, {
    account_id: user.accountId, date: '2026-09-17', original_description: description,
    merchant: description, category, subcategory, amount: -1234,
    category_source: source, category_confidence: confidence,
  })
  if (write.status !== 200) throw new Error(JSON.stringify(write.json))
  const { data, error } = await user.client.from('transactions').select('*').eq('original_description', description).single()
  if (error) throw error
  return data
}

function assignment(row, category, subcategory) {
  return {
    transaction_id: row.id,
    before_category: row.category,
    before_subcategory: row.subcategory,
    before_source: row.category_source,
    before_confidence: row.category_confidence,
    before_needs_review: row.needs_review,
    category,
    subcategory,
  }
}

async function main() {
  console.log('\n\x1b[1mCategorisation review — selected-row contract\x1b[0m')
  const owner = await newUserWithAccount('category-review-owner')
  const other = await newUserWithAccount('category-review-other')

  section('Preview protections')
  const bank = await seed(owner, `REVIEW BANK ${crypto.randomUUID()}`, 'bank', 1)
  const protectedPreview = await invoke('review-categorization', owner.token, {
    action: 'preview', transaction_ids: [bank.id],
  })
  check('bank classification is previewed as protected without an AI call',
    protectedPreview.status === 200
      && protectedPreview.json?.rows?.[0]?.status === 'protected'
      && protectedPreview.json?.stats?.geminiCalls === 0,
    JSON.stringify(protectedPreview.json))

  section('Atomic heterogeneous apply and undo')
  const aiOne = await seed(owner, `REVIEW AI ONE ${crypto.randomUUID()}`, 'ai', 0.6)
  const aiTwo = await seed(owner, `REVIEW AI TWO ${crypto.randomUUID()}`, 'ai', 0.65, 'Shopping', 'General retail')
  const applied = await invoke('review-categorization', owner.token, {
    action: 'apply', assignments: [
      assignment(aiOne, 'Transport', 'Fuel'),
      assignment(aiTwo, 'Home', 'Furnishings'),
    ],
  })
  check('different accepted suggestions apply under one operation',
    applied.status === 200 && applied.json?.updated === 2 && applied.json?.operation_id,
    JSON.stringify(applied.json))
  const changed = await owner.client.from('transactions')
    .select('id,category,subcategory,category_source,category_confidence,needs_review')
    .in('id', [aiOne.id, aiTwo.id]).order('id')
  check('accepted suggestions become reviewed Manual classifications',
    changed.data?.length === 2 && changed.data.every((row) => row.category_source === 'user' && row.category_confidence === 1 && row.needs_review === false),
    JSON.stringify(changed.data))
  const history = await owner.client.from('transaction_category_edits')
    .select('operation_id').eq('operation_id', applied.json.operation_id)
  check('one history operation records every accepted row', history.data?.length === 2, JSON.stringify(history.data))
  const undone = await invoke('update-transaction-category', owner.token, {
    action: 'undo_operation', operation_id: applied.json.operation_id,
  })
  check('the accepted review is guardedly undoable as one operation',
    undone.status === 200 && undone.json?.restored === 2, JSON.stringify(undone.json))

  section('Explicit custom choices and taxonomy boundaries')
  const custom = await invoke('manage-taxonomy', owner.token, { action: 'create_subcategory', category: 'Shopping', name: 'Review workshop supplies' })
  if (custom.status !== 200) throw new Error(`custom category fixture failed: ${JSON.stringify(custom.json)}`)
  const customApply = await invoke('review-categorization', owner.token, {
    action: 'apply', assignments: [assignment(aiOne, 'Shopping', 'review WORKSHOP supplies')],
  })
  const customRow = await owner.client.from('transactions').select('subcategory,custom_subcategory_id').eq('id', aiOne.id).single()
  check('an active tenant custom choice is canonicalised and keeps its stable identity',
    customApply.status === 200 && customRow.data?.subcategory === 'Review workshop supplies' && customRow.data?.custom_subcategory_id === custom.json.id,
    JSON.stringify({ result: customApply.json, row: customRow.data }))
  const customUndo = await invoke('update-transaction-category', owner.token, { action: 'undo_operation', operation_id: customApply.json.operation_id })
  check('a custom review choice participates in guarded undo', customUndo.status === 200 && customUndo.json?.restored === 1, JSON.stringify(customUndo.json))
  const otherRow = await seed(other, `REVIEW OTHER ${crypto.randomUUID()}`, 'ai', 0.6)
  const foreignCustom = await invoke('review-categorization', other.token, {
    action: 'apply', assignments: [assignment(otherRow, 'Shopping', 'Review workshop supplies')],
  })
  check('another tenant cannot select this custom subcategory', foreignCustom.status === 422, JSON.stringify(foreignCustom.json))
  const wrongCategory = await invoke('review-categorization', owner.token, {
    action: 'apply', assignments: [assignment(aiOne, 'Home', 'Review workshop supplies')],
  })
  check('a custom subcategory cannot be used under another category', wrongCategory.status === 422, JSON.stringify(wrongCategory.json))
  const reserved = await invoke('review-categorization', owner.token, {
    action: 'apply', assignments: [assignment(aiOne, 'Transfer', 'Reconciliation')],
  })
  check('manual choices cannot create system reconciliation entries', reserved.status === 422, JSON.stringify(reserved.json))

  section('Apply-time protection and stale-state rejection')
  const stale = await seed(owner, `REVIEW STALE ${crypto.randomUUID()}`, 'ai', 0.6)
  const manual = await invoke('update-transaction-category', owner.token, {
    action: 'edit', transaction_id: stale.id, category: 'Other', subcategory: 'Miscellaneous',
  })
  check('fixture receives an intervening manual correction', manual.status === 200, JSON.stringify(manual.json))
  const staleApply = await invoke('review-categorization', owner.token, {
    action: 'apply', assignments: [assignment(stale, 'Transport', 'Fuel')],
  })
  check('a stale preview cannot overwrite the intervening correction', staleApply.status === 409, JSON.stringify(staleApply.json))

  const foreignApply = await invoke('review-categorization', other.token, {
    action: 'apply', assignments: [assignment(aiOne, 'Transport', 'Fuel')],
  })
  check('another tenant cannot apply a review to the owner transaction', foreignApply.status >= 400, JSON.stringify(foreignApply.json))
  const direct = await owner.client.rpc('apply_categorization_review', {
    p_tenant_id: owner.tenantId, p_actor_id: owner.userId,
    p_assignments: [assignment(aiOne, 'Transport', 'Fuel')],
  })
  check('the browser cannot bypass the review Edge Function', Boolean(direct.error), direct.error?.message)
  const audit = await owner.client.from('audit_log').select('action')
    .in('action', ['transactions.categorization_review_previewed', 'transactions.categorization_review_applied'])
  check('preview and apply are audit logged', new Set(audit.data?.map((row) => row.action)).size === 2, JSON.stringify(audit.data))

  if (process.env.HALCYON_TEST_LIVE_GEMINI === '1') {
    section('Fresh provider preview')
    const merchant = `Woolworths Metro Gate One ${crypto.randomUUID().slice(0, 8)}`
    const ai = await seed(owner, merchant, 'ai', 0.51, 'Shopping', 'General retail')
    const fresh = await invoke('review-categorization', owner.token, {
      action: 'preview', transaction_ids: [ai.id],
    })
    check('eligible AI row receives a fresh model-backed preview',
      fresh.status === 200
        && fresh.json?.stats?.geminiCalls >= 1
        && fresh.json?.rows?.[0]?.proposed?.source === 'ai',
      JSON.stringify(fresh.json))
    const afterPreview = await owner.client.from('transactions')
      .select('category,subcategory,category_source,category_confidence,needs_review').eq('id', ai.id).single()
    check('fresh preview does not mutate the transaction',
      afterPreview.data?.category === ai.category
        && afterPreview.data?.subcategory === ai.subcategory
        && afterPreview.data?.category_source === ai.category_source
        && afterPreview.data?.category_confidence === ai.category_confidence,
      JSON.stringify(afterPreview.data))
    const cache = await owner.client.from('merchant_rules').select('id').eq('merchant_key', ai.merchant_key)
    check('fresh preview does not teach the durable merchant cache', cache.data?.length === 0, JSON.stringify(cache.data))
  }

  exitWithSummary()
}

main().catch((error) => { console.error('\x1b[31mHarness error:\x1b[0m', error.message); process.exit(2) })
