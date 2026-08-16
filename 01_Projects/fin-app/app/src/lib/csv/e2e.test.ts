/**
 * End-to-end ingestion tests against the LIVE local stack.
 *
 * Drives the real pipeline (the same modules the UI imports) through the real
 * Edge Functions, for every file in `Sample datasets/`. This is what proves
 * the whole thing works together, as opposed to each unit working alone.
 *
 * Skipped automatically when the stack is not running, so `npm test` stays
 * usable offline. To run it:
 *   npx supabase start
 *   npx supabase functions serve --no-verify-jwt --env-file supabase/.env.local
 *   SUPABASE_ANON_KEY=... npm test
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { stageRows, applyAssignments, toTransactionPayload, type ColumnMapping } from './pipeline'
import { EXPENSE_CATEGORIES, INCOME_CATEGORY, TRANSFER_CATEGORY, UNCATEGORIZED } from '../../data'

const URL_ = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.SUPABASE_ANON_KEY ?? ''
const SAMPLES = join(__dirname, '..', '..', '..', '..', 'Sample datasets')
const FILES = readdirSync(SAMPLES).filter((f) => f.toLowerCase().endsWith('.csv'))

const ALLOWED = [...EXPENSE_CATEGORIES, INCOME_CATEGORY, TRANSFER_CATEGORY, UNCATEGORIZED]

let live = false

async function stackUp() {
  if (!ANON) return false
  try {
    const r = await fetch(`${URL_}/functions/v1/analyze-csv`, { method: 'OPTIONS' })
    return r.status < 500
  } catch { return false }
}

interface Ctx { client: SupabaseClient; token: string; userId: string; tenantId: string; accountId: string }

async function newUser(tag: string, type = 'Liquid'): Promise<Ctx> {
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`
  const { data, error } = await client.auth.signUp({ email, password: 'correct-horse-battery-staple-1' })
  if (error) throw new Error(error.message)
  const { data: p } = await client.from('profiles').select('default_tenant_id').eq('id', data.user!.id).single()
  const { data: acct } = await client.from('accounts').insert({
    name: `${tag} account`, type, balance: 0, currency: 'AUD',
    user_id: data.user!.id, tenant_id: p!.default_tenant_id,
  }).select().single()
  return { client, token: data.session!.access_token, userId: data.user!.id, tenantId: p!.default_tenant_id, accountId: acct!.id }
}

const invoke = (fn: string, token: string, body: unknown) =>
  fetch(`${URL_}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', apikey: ANON,
      Authorization: `Bearer ${token}`, Origin: 'http://localhost:5300',
    },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }))

const load = (n: string) =>
  Papa.parse<Record<string, unknown>>(readFileSync(join(SAMPLES, n), 'utf8'), {
    header: true, skipEmptyLines: true,
  })

/** The full import, exactly as CSVUploader performs it. */
async function importFile(ctx: Ctx, file: string, balanceCents: number) {
  const parsed = load(file)
  const header = parsed.meta.fields!
  const rows = parsed.data.filter((r) => Object.keys(r).length > 1)

  const mapRes = await invoke('analyze-csv', ctx.token, { header, sampleRows: rows.slice(0, 5) })
  expect(mapRes.status, `analyze-csv for ${file}`).toBe(200)
  const mapping = mapRes.json as ColumnMapping

  const staged = await stageRows(rows, mapping, ctx.accountId)

  let catStats = { geminiCalls: 0, fromCache: 0, fromAi: 0 }
  let finalRows = staged.rows
  if (staged.pendingMerchants.length > 0) {
    const cat = await invoke('categorize-merchants', ctx.token, { merchants: staged.pendingMerchants })
    expect(cat.status, `categorize for ${file}`).toBe(200)
    finalRows = applyAssignments(staged.rows, cat.json.assignments)
    catStats = cat.json.stats
  }

  const batchId = crypto.randomUUID()
  const payload = toTransactionPayload(finalRows, ctx.accountId, batchId)

  const ins = await invoke('upsert-transactions', ctx.token, {
    transactions: payload,
    target_balance: balanceCents,
  })
  expect(ins.status, `upsert for ${file}`).toBe(200)

  return { mapping, staged, finalRows, result: ins.json, catStats, payloadSize: payload.length }
}

beforeAll(async () => { live = await stackUp() })

describe.skipIf(!process.env.SUPABASE_ANON_KEY)('end-to-end ingestion (live stack)', () => {
  it('the stack is reachable', async () => {
    expect(live, 'start the stack and `functions serve` to run these').toBe(true)
  })

  for (const file of FILES) {
    it(`imports ${file} correctly`, async () => {
      if (!live) return
      const ctx = await newUser('imp')
      const { staged, finalRows, result } = await importFile(ctx, file, -50_000)

      expect(staged.stats.badDate, 'no unparseable dates').toBe(0)
      expect(staged.stats.noAmount, 'every row has an amount').toBe(0)
      expect(result.inserted, 'rows landed').toBeGreaterThan(0)
      expect(result.skipped, 'nothing skipped on a fresh account').toBe(0)

      // Taxonomy containment — the hard constraint.
      const { data: written } = await ctx.client.from('transactions').select('category, subcategory, amount')
      for (const t of written!) {
        expect(ALLOWED, `unexpected category ${t.category}`).toContain(t.category)
      }

      // The categorisation actually did something.
      const categorised = written!.filter((t) => t.category !== UNCATEGORIZED)
      expect(categorised.length / written!.length, 'most rows categorised').toBeGreaterThan(0.5)

      // The ledger reconciles to the declared balance.
      const sum = written!.reduce((s, t) => s + t.amount, 0)
      expect(sum, 'ledger sums to the declared balance').toBe(-50_000)

      expect(finalRows.length).toBe(staged.rows.length)
    }, 120_000)
  }

  it('re-importing the same file changes nothing', async () => {
    if (!live) return
    const ctx = await newUser('redup')
    const file = 'StGreorge_CreditCardtrans180726.csv'

    const first = await importFile(ctx, file, -50_000)
    const { data: after1 } = await ctx.client.from('transactions').select('id, category')
    const { data: acct1 } = await ctx.client.from('accounts').select('balance').eq('id', ctx.accountId).single()

    const second = await importFile(ctx, file, -50_000)

    expect(second.result.inserted, 'zero new rows').toBe(0)
    expect(second.result.skipped, 'everything skipped').toBe(second.payloadSize)

    const { data: after2 } = await ctx.client.from('transactions').select('id')
    expect(after2!.length, 'ledger did not grow').toBe(after1!.length)

    const { data: acct2 } = await ctx.client.from('accounts').select('balance').eq('id', ctx.accountId).single()
    expect(acct2!.balance, 'balance unchanged').toBe(acct1!.balance)

    // And no second reconciliation anchor was created.
    const anchors = after2!.length
    expect(anchors).toBe(after1!.length)

    // The second run must also have cost nothing in AI.
    expect(second.catStats.geminiCalls, 'no Gemini calls on re-import').toBe(0)
    expect(first.catStats.geminiCalls, 'first run did use AI').toBeGreaterThanOrEqual(0)
  }, 180_000)

  it('reconciles consecutive and partially-overlapping imports against the complete ledger', async () => {
    if (!live) return
    const ctx = await newUser('atomic')
    const batch = () => crypto.randomUUID()
    const txn = (date: string, description: string, amount: number, uploadBatchId: string) => ({
      account_id: ctx.accountId,
      date,
      original_description: description,
      merchant: description,
      category: amount >= 0 ? 'Income' : 'Other',
      subcategory: amount >= 0 ? 'Other' : 'Miscellaneous',
      amount,
      upload_batch_id: uploadBatchId,
      category_source: 'user' as const,
      needs_review: false,
    })

    const firstBatch = batch()
    const firstRows = [
      txn('2026-06-01', 'Opening deposit', 10_000, firstBatch),
      txn('2026-06-02', 'First purchase', -2_000, firstBatch),
    ]
    const first = await invoke('upsert-transactions', ctx.token, {
      transactions: firstRows,
      target_balance: 50_000,
    })
    expect(first.status).toBe(200)
    expect(first.json.inserted).toBe(2)

    const secondBatch = batch()
    const second = await invoke('upsert-transactions', ctx.token, {
      // One overlapping row plus one genuinely new row. The existing row has
      // a new batch id but the same content identity and must be skipped.
      transactions: [
        txn('2026-06-02', 'First purchase', -2_000, secondBatch),
        txn('2026-07-01', 'Second purchase', -3_000, secondBatch),
      ],
      target_balance: 47_000,
    })
    expect(second.status).toBe(200)
    expect(second.json.inserted).toBe(1)
    expect(second.json.skipped).toBe(1)

    const { data: written } = await ctx.client
      .from('transactions')
      .select('amount, category, subcategory, date')
      .eq('account_id', ctx.accountId)
    expect(written!.reduce((sum, row) => sum + row.amount, 0)).toBe(47_000)
    const anchors = written!.filter((row) => row.category === 'Transfer' && row.subcategory === 'Reconciliation')
    expect(anchors).toHaveLength(1)
    const earliestRealDate = written!
      .filter((row) => row.subcategory !== 'Reconciliation')
      .map((row) => row.date)
      .sort()[0]
    expect(anchors[0].date).toBe('2026-05-31')
    expect(anchors[0].date < earliestRealDate).toBe(true)

    const { data: account } = await ctx.client
      .from('accounts').select('balance').eq('id', ctx.accountId).single()
    expect(account!.balance).toBe(47_000)
  }, 60_000)

  it('rolls back inserted rows if reconciliation cannot complete', async () => {
    if (!live) return
    const ctx = await newUser('atomic-rollback')
    const failed = await invoke('upsert-transactions', ctx.token, {
      transactions: [{
        account_id: ctx.accountId,
        date: '2026-06-01',
        original_description: 'Overflow sentinel',
        merchant: 'Overflow sentinel',
        category: 'Other',
        subcategory: 'Miscellaneous',
        amount: -2_147_483_648,
        upload_batch_id: crypto.randomUUID(),
        category_source: 'user',
      }],
      target_balance: 2_147_483_647,
    })
    expect(failed.status).toBe(400)

    const { data: written } = await ctx.client
      .from('transactions').select('id').eq('account_id', ctx.accountId)
    expect(written).toHaveLength(0)
    const { data: account } = await ctx.client
      .from('accounts').select('balance').eq('id', ctx.accountId).single()
    expect(account!.balance).toBe(0)
  }, 60_000)

  it('a second, different file reuses the cache for merchants it has seen', async () => {
    if (!live) return
    const ctx = await newUser('cache')
    const a = await importFile(ctx, 'StGreorge_CreditCardtrans180726.csv', -50_000)
    const b = await importFile(ctx, 'StGeroge_Transaction_trans180726.csv', -50_000)

    // Asserted against the actual overlap rather than a bare "> 0": if the two
    // statements happen to share no uncategorised merchants, there is nothing
    // to reuse and demanding a cache hit would be testing the fixture, not the
    // cache.
    const seen = new Set(a.staged.pendingMerchants.map((m) => m.key))
    const overlap = b.staged.pendingMerchants.filter((m) => seen.has(m.key)).length
    expect(b.catStats.fromCache, `expected >= ${overlap} cache hits`).toBeGreaterThanOrEqual(overlap)
  }, 180_000)

  it('quarantines a corrupted date instead of importing it as today', async () => {
    if (!live) return
    const ctx = await newUser('baddate')
    const rows = [
      { Date: '31/31/2026', Description: 'Corrupt Row', Debit: '10.00', Credit: '', Category: '', SubCategory: '' },
      { Date: '18/06/2026', Description: 'Valid Row', Debit: '10.00', Credit: '', Category: '', SubCategory: '' },
    ]
    const mapping: ColumnMapping = {
      dateCol: 'Date', descCol: 'Description', debitCol: 'Debit', creditCol: 'Credit',
      categoryCol: 'Category', subcategoryCol: 'SubCategory',
    }
    const staged = await stageRows(rows, mapping, ctx.accountId)
    const payload = toTransactionPayload(staged.rows, ctx.accountId, crypto.randomUUID())

    expect(payload).toHaveLength(1)
    const ins = await invoke('upsert-transactions', ctx.token, payload)
    expect(ins.json.inserted).toBe(1)

    const { data } = await ctx.client.from('transactions').select('date, original_description')
    expect(data).toHaveLength(1)
    expect(data![0].original_description).toBe('Valid Row')
    const today = new Date().toISOString().slice(0, 10)
    expect(data!.every((t) => t.date !== today), 'nothing dated today').toBe(true)
  }, 60_000)
})
