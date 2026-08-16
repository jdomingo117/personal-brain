#!/usr/bin/env node
/**
 * Durable upload history and atomic undo integration tests.
 * Requires the local stack and functions serve process.
 */
import {
  check, section, exitWithSummary, newUserWithAccount, invoke,
} from './lib/harness.mjs'

function rows(accountId, count, prefix, amount = 100) {
  return Array.from({ length: count }, (_, index) => ({
    account_id: accountId,
    date: '2026-08-01',
    original_description: `${prefix} ${index}`,
    merchant: `${prefix} ${index}`,
    category: 'Income',
    amount,
  }))
}

async function main() {
  console.log('\n\x1b[1mUpload batches — durable history and atomic undo\x1b[0m')
  const a = await newUserWithAccount('upload-batch-a')
  const b = await newUserWithAccount('upload-batch-b')

  // Deliberately exceed PostgREST's usual 1,000-row response cap. The old
  // JavaScript reduce would have missed the tail when recalculating balance.
  section('First-class metadata beyond the response cap')
  const baseBatch = crypto.randomUUID()
  const baseRows = rows(a.accountId, 1101, 'BASE')
  const base = await invoke('upsert-transactions', a.token, {
    transactions: baseRows.map((row) => ({ ...row, upload_batch_id: baseBatch })),
    target_balance: 110100,
    file_name: 'long-history.csv',
    source_row_count: 1103,
    blocked_count: 1,
  })
  check('large import succeeds', base.status === 200, JSON.stringify(base.json))
  check('all 1,101 rows inserted', base.json?.inserted === 1101, `inserted=${base.json?.inserted}`)

  const baseMeta = await a.client.from('upload_batches').select('*').eq('id', baseBatch).single()
  check('batch is independently queryable', !baseMeta.error, baseMeta.error?.message)
  check('filename and source counts persist',
    baseMeta.data?.file_name === 'long-history.csv'
      && baseMeta.data?.source_row_count === 1103
      && baseMeta.data?.inserted_count === 1101
      && baseMeta.data?.blocked_count === 1,
    JSON.stringify(baseMeta.data),
  )
  const invalidCounts = await invoke('upsert-transactions', a.token, {
    transactions: rows(a.accountId, 2, 'INVALID-COUNTS'),
    source_row_count: 1,
  })
  check('inconsistent source counts are rejected at validation', invalidCounts.status === 422,
    `status=${invalidCounts.status}`)

  section('Atomic undo uses SQL SUM over the complete surviving ledger')
  const secondBatch = crypto.randomUUID()
  const secondRows = rows(a.accountId, 1, 'SECOND', 50)
  const second = await invoke('upsert-transactions', a.token, {
    transactions: secondRows.map((row) => ({ ...row, upload_batch_id: secondBatch })),
    target_balance: 110150,
    file_name: 'one-more-row.csv',
    source_row_count: 1,
    blocked_count: 0,
  })
  check('second import succeeds', second.status === 200, JSON.stringify(second.json))

  const undo = await invoke('delete-upload-batch', a.token, {
    upload_batch_id: secondBatch,
    account_id: a.accountId,
  })
  check('undo succeeds', undo.status === 200, JSON.stringify(undo.json))
  check('one row removed', undo.json?.removed === 1, JSON.stringify(undo.json))
  check('complete 1,101-row ledger is summed', undo.json?.newBalance === 110100,
    `newBalance=${undo.json?.newBalance}`)

  const account = await a.client.from('accounts').select('balance').eq('id', a.accountId).single()
  check('account balance commits with deletion', account.data?.balance === 110100,
    `balance=${account.data?.balance}`)
  const secondMeta = await a.client.from('upload_batches')
    .select('undone_at, removed_count').eq('id', secondBatch).single()
  check('batch remains as an undone audit record',
    Boolean(secondMeta.data?.undone_at) && secondMeta.data?.removed_count === 1,
    JSON.stringify(secondMeta.data),
  )

  const again = await invoke('delete-upload-batch', a.token, {
    upload_batch_id: secondBatch,
    account_id: a.accountId,
  })
  check('repeated undo is idempotent', again.status === 200 && again.json?.alreadyUndone === true,
    JSON.stringify(again.json))

  section('Metadata write boundary and tenant isolation')
  const forged = await a.client.from('upload_batches').update({ undone_at: new Date().toISOString() })
    .eq('id', baseBatch).select('id')
  check('browser cannot forge batch state', Boolean(forged.error), forged.error?.message)

  const hidden = await b.client.from('upload_batches').select('id').eq('id', baseBatch)
  check('other tenant cannot read batch metadata', hidden.data?.length === 0,
    `${hidden.data?.length} rows`)
  const crossTenantUndo = await invoke('delete-upload-batch', b.token, {
    upload_batch_id: baseBatch,
    account_id: b.accountId,
  })
  check('other tenant cannot undo the batch', crossTenantUndo.status !== 200,
    `status=${crossTenantUndo.status}`)

  const stillThere = await a.client.from('transactions')
    .select('id', { count: 'exact', head: true }).eq('upload_batch_id', baseBatch)
  check('rejected cross-tenant undo changes nothing', stillThere.count === 1101,
    `count=${stillThere.count}`)

  exitWithSummary()
}

main().catch((error) => {
  console.error('\x1b[31mHarness error:\x1b[0m', error.message)
  process.exit(2)
})
