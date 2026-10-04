import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import { applyAssignments, stageRows, toTransactionPayload, type ColumnMapping } from './pipeline'
import { CATEGORY_TAXONOMY } from '../../data'

const RUN = process.env.HALCYON_GATE2 === '1'
const URL_ = process.env.SUPABASE_URL ?? ''
const ANON = process.env.SUPABASE_ANON_KEY ?? ''
const REPORT_PATH = process.env.HALCYON_GATE2_REPORT ?? '/private/tmp/halcyon-gate2-categorization.json'
const EXISTING_EMAIL = process.env.HALCYON_GATE2_EXISTING_EMAIL ?? ''
const SAMPLES = join(__dirname, '..', '..', '..', '..', 'Sample datasets')

const MAPPINGS: Record<string, ColumnMapping> = {
  'AMEX.csv': {
    dateCol: 'Date', descCol: 'Description', amountCol: 'Amount', invertAmount: true,
  },
  'St George CC.csv': {
    dateCol: 'Date', descCol: 'Description', debitCol: 'Debit', creditCol: 'Credit',
    categoryCol: 'Category', subcategoryCol: 'SubCategory',
  },
  'St George Trans.csv': {
    dateCol: 'Date', descCol: 'Description', debitCol: 'Debit', creditCol: 'Credit',
    categoryCol: 'Category', subcategoryCol: 'SubCategory',
  },
  'St George Savings.csv': {
    dateCol: 'Date', descCol: 'Description', debitCol: 'Debit', creditCol: 'Credit',
    categoryCol: 'Category', subcategoryCol: 'SubCategory',
  },
  'MAcq Trans.csv': {
    dateCol: 'Transaction Date', descCol: 'Details', debitCol: 'Debit', creditCol: 'Credit',
    categoryCol: 'Category', subcategoryCol: 'Subcategory',
  },
  'Macq Savings.csv': {
    dateCol: 'Transaction Date', descCol: 'Details', debitCol: 'Debit', creditCol: 'Credit',
    categoryCol: 'Category', subcategoryCol: 'Subcategory',
  },
}

type Assignment = Parameters<typeof applyAssignments>[1][number]
type TransactionRow = {
  id: string
  account_id: string
  date: string
  merchant: string
  merchant_key: string
  original_description: string
  amount: number
  category: string
  subcategory: string | null
  category_source: 'user' | 'bank' | 'ai' | 'seed' | null
  category_confidence: number | null
  needs_review: boolean
}

function safeTarget() {
  expect(URL_).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/)
  expect(URL_).not.toMatch(/:54321\/?$/)
  expect(ANON).not.toBe('')
  expect(process.env.HALCYON_TEST_TARGET_ID).toMatch(/^halcyon-(gate2|golden)-isolated-/)
  expect(process.env.HALCYON_ALLOW_DESTRUCTIVE_TEST_FIXTURES).toBe('isolated-only')
}

async function invoke(token: string, fn: string, body: unknown) {
  const response = await fetch(`${URL_}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      Origin: 'http://localhost:5300',
    },
    body: JSON.stringify(body),
  })
  return { status: response.status, json: await response.json().catch(() => null) }
}

function counts<T>(rows: T[], key: (row: T) => string) {
  return Object.fromEntries([...rows.reduce((map, row) => {
    const value = key(row)
    map.set(value, (map.get(value) ?? 0) + 1)
    return map
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
}

function reviewBatches(rows: TransactionRow[]) {
  const groups = new Map<string, TransactionRow[]>()
  for (const row of rows.filter((item) => item.category_source !== 'bank' && item.category_source !== 'user')) {
    const group = groups.get(row.merchant_key) ?? []
    group.push(row)
    groups.set(row.merchant_key, group)
  }

  const batches: TransactionRow[][] = []
  let batch: TransactionRow[] = []
  let merchants = 0
  for (const group of groups.values()) {
    if (batch.length > 0 && (batch.length + group.length > 200 || merchants === 40)) {
      batches.push(batch)
      batch = []
      merchants = 0
    }
    batch.push(...group)
    merchants++
  }
  if (batch.length > 0) batches.push(batch)

  const protectedSample = rows.filter((item) => item.category_source === 'bank').slice(0, 20)
  if (protectedSample.length > 0) {
    if (batches.length === 0) batches.push(protectedSample)
    else batches[0].push(...protectedSample.slice(0, Math.max(0, 500 - batches[0].length)))
  }
  return batches
}

const EXPECTATIONS = [
  { pattern: /woolworth|coles|\baldi\b|\biga\b/i, exclude: /aldimobile/i, category: 'Food & drink' },
  { pattern: /netflix|spotify|\bstan\b/i, category: 'Lifestyle' },
  { pattern: /opal|transport for nsw/i, category: 'Transport' },
  { pattern: /chemist|pharmacy|priceline/i, category: 'Health & wellbeing' },
  { pattern: /\b(bp|ampol|caltex|shell)\b/i, category: 'Transport' },
] as const

describe.skipIf(!RUN)('Gate 2 categorisation quality', () => {
  it('imports the representative bank corpus and produces fresh review previews', async () => {
    safeTarget()
    const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
    const email = EXISTING_EMAIL || `gate2-quality-${Date.now()}@example.test`
    const auth = EXISTING_EMAIL
      ? await client.auth.signInWithPassword({ email, password: 'correct-horse-battery-staple-1' })
      : await client.auth.signUp({ email, password: 'correct-horse-battery-staple-1' })
    expect(auth.error).toBeNull()
    const token = auth.data.session?.access_token
    expect(token).toBeTruthy()
    const profile = await client.from('profiles').select('default_tenant_id').eq('id', auth.data.user!.id).single()
    expect(profile.error).toBeNull()

    const fileResults: Array<Record<string, unknown>> = []
    const allTransactions: TransactionRow[] = []
    let importGeminiCalls = 0
    let importFromAi = 0
    let importFromBank = 0

    if (EXISTING_EMAIL) {
      const accounts = await client.from('accounts').select('id,name').order('created_at')
      expect(accounts.error).toBeNull()
      for (const account of accounts.data ?? []) {
        const written = await client.from('transactions')
          .select('id,account_id,date,merchant,merchant_key,original_description,amount,category,subcategory,category_source,category_confidence,needs_review')
          .eq('account_id', account.id)
        expect(written.error).toBeNull()
        const rows = written.data as TransactionRow[]
        allTransactions.push(...rows)
        fileResults.push({
          file: account.name.replace(/^Gate 2 /, ''),
          imported: rows.length,
          distinctMerchants: new Set(rows.map((row) => row.merchant_key)).size,
          bankRows: rows.filter((row) => row.category_source === 'bank').length,
          aiRows: rows.filter((row) => row.category_source === 'ai').length,
          reviewRows: rows.filter((row) => row.needs_review).length,
          categorizedRows: rows.filter((row) => row.category !== 'Uncategorized').length,
        })
      }
      const categorizationAudit = await client.from('audit_log')
        .select('metadata').eq('action', 'merchants.categorized')
      expect(categorizationAudit.error).toBeNull()
      for (const event of categorizationAudit.data ?? []) {
        importGeminiCalls += Number(event.metadata?.gemini_calls ?? 0)
        importFromAi += Number(event.metadata?.from_ai ?? 0)
        importFromBank += Number(event.metadata?.from_bank ?? 0)
      }
    } else for (const [file, mapping] of Object.entries(MAPPINGS)) {
      const account = await client.from('accounts').insert({
        name: `Gate 2 ${file}`,
        type: file.includes('CreditCard') || file.startsWith('AMEX') ? 'Credit Card' : 'Liquid',
        balance: 0,
        currency: 'AUD',
        user_id: auth.data.user!.id,
        tenant_id: profile.data!.default_tenant_id,
      }).select('id').single()
      expect(account.error).toBeNull()

      const parsed = Papa.parse<Record<string, unknown>>(readFileSync(join(SAMPLES, file), 'utf8'), {
        header: true, skipEmptyLines: true,
      })
      expect(parsed.errors).toEqual([])
      const rawRows = parsed.data.filter((row) => Object.keys(row).length > 1)
      const staged = await stageRows(rawRows, mapping, account.data!.id)
      expect(staged.stats.badDate).toBe(0)
      expect(staged.stats.noAmount).toBe(0)

      const assignments: Assignment[] = []
      const categorization = { geminiCalls: 0, fromAi: 0, fromBank: 0, fromCache: 0 }
      for (let offset = 0; offset < staged.pendingMerchants.length; offset += 300) {
        const result = await invoke(token!, 'categorize-merchants', {
          merchants: staged.pendingMerchants.slice(offset, offset + 300),
        })
        expect(result.status, JSON.stringify(result.json)).toBe(200)
        assignments.push(...result.json.assignments)
        for (const key of Object.keys(categorization) as Array<keyof typeof categorization>) {
          categorization[key] += Number(result.json.stats[key] ?? 0)
        }
      }
      importGeminiCalls += categorization.geminiCalls
      importFromAi += categorization.fromAi
      importFromBank += categorization.fromBank

      const finalRows = applyAssignments(staged.rows, assignments)
      const batchId = crypto.randomUUID()
      const payload = toTransactionPayload(finalRows, account.data!.id, batchId)
      const imported = await invoke(token!, 'upsert-transactions', {
        transactions: payload,
        file_name: file,
        source_row_count: rawRows.length,
        blocked_count: staged.stats.badDate + staged.stats.noAmount,
      })
      expect(imported.status, JSON.stringify(imported.json)).toBe(200)
      expect(imported.json.inserted).toBe(payload.length)
      expect(imported.json.skipped).toBe(0)

      const written = await client.from('transactions')
        .select('id,account_id,date,merchant,merchant_key,original_description,amount,category,subcategory,category_source,category_confidence,needs_review')
        .eq('account_id', account.data!.id)
      expect(written.error).toBeNull()
      allTransactions.push(...(written.data as TransactionRow[]))
      fileResults.push({
        file,
        sourceRows: rawRows.length,
        imported: payload.length,
        distinctMerchants: staged.pendingMerchants.length,
        bankRows: finalRows.filter((row) => row.categorySource === 'bank').length,
        aiRows: finalRows.filter((row) => row.categorySource === 'ai').length,
        reviewRows: finalRows.filter((row) => row.needsReview).length,
        categorizedRows: finalRows.filter((row) => row.category !== 'Uncategorized').length,
        categorization,
      })
    }

    const beforeRules = await client.from('merchant_rules').select('id', { count: 'exact', head: true })
    const beforeSnapshot = Object.fromEntries(allTransactions.map((row) => [row.id, {
      category: row.category,
      subcategory: row.subcategory,
      source: row.category_source,
      confidence: row.category_confidence,
      needsReview: row.needs_review,
    }]))

    const previewRows: any[] = []
    let previewGeminiCalls = 0
    for (const batch of reviewBatches(allTransactions)) {
      const preview = await invoke(token!, 'review-categorization', {
        action: 'preview', transaction_ids: batch.map((row) => row.id),
      })
      expect(preview.status, JSON.stringify(preview.json)).toBe(200)
      previewRows.push(...preview.json.rows)
      previewGeminiCalls += Number(preview.json.stats.geminiCalls ?? 0)
    }

    const afterRows: Array<Pick<TransactionRow, 'id' | 'category' | 'subcategory' | 'category_source' | 'category_confidence' | 'needs_review'>> = []
    const transactionIds = allTransactions.map((row) => row.id)
    for (let offset = 0; offset < transactionIds.length; offset += 100) {
      const result = await client.from('transactions')
        .select('id,category,subcategory,category_source,category_confidence,needs_review')
        .in('id', transactionIds.slice(offset, offset + 100))
      expect(result.error).toBeNull()
      afterRows.push(...(result.data as typeof afterRows))
    }
    expect(Object.fromEntries(afterRows.map((row) => [row.id, {
      category: row.category,
      subcategory: row.subcategory,
      source: row.category_source,
      confidence: row.category_confidence,
      needsReview: row.needs_review,
    }]))).toEqual(beforeSnapshot)
    const afterRules = await client.from('merchant_rules').select('id', { count: 'exact', head: true })
    expect(afterRules.count).toBe(beforeRules.count)

    const expectationFindings = previewRows.flatMap((row) => EXPECTATIONS
      .filter((rule) => rule.pattern.test(row.merchant)
        && !('exclude' in rule && rule.exclude.test(row.merchant))
        && row.proposed?.category !== rule.category)
      .map((rule) => ({
        merchant: row.merchant,
        expectedCategory: rule.category,
        currentCategory: row.current.category,
        proposedCategory: row.proposed?.category ?? null,
        status: row.status,
      })))

    const currentAiRows = allTransactions.filter((row) => row.category_source === 'ai')
    const report = {
      generatedAt: new Date().toISOString(),
      target: { projectId: process.env.HALCYON_TEST_TARGET_ID, url: URL_ },
      corpus: {
        files: Object.keys(MAPPINGS).length,
        rows: allTransactions.length,
        distinctMerchants: new Set(allTransactions.map((row) => row.merchant_key)).size,
      },
      import: {
        geminiCalls: importGeminiCalls,
        fromAiMerchants: importFromAi,
        fromBankMerchants: importFromBank,
        sourceCounts: counts(allTransactions, (row) => row.category_source ?? 'none'),
        categoryCounts: counts(allTransactions, (row) => row.category),
        needsReview: allTransactions.filter((row) => row.needs_review).length,
        uncategorized: allTransactions.filter((row) => row.category === 'Uncategorized').length,
        missingSubcategory: currentAiRows.filter((row) => !row.subcategory).length,
        confidenceCounts: counts(currentAiRows, (row) => String(row.category_confidence ?? 'none')),
        files: fileResults,
      },
      freshReview: {
        selected: previewRows.length,
        geminiCalls: previewGeminiCalls,
        statusCounts: counts(previewRows, (row) => row.status),
        proposedCategoryCounts: counts(previewRows.filter((row) => row.proposed), (row) => row.proposed.category),
        suggestions: previewRows.filter((row) => row.status === 'suggested').map((row) => ({
          merchant: row.merchant,
          current: row.current,
          proposed: row.proposed,
        })),
        changedCategoryCount: previewRows.filter((row) => row.status === 'suggested'
          && row.current.category !== row.proposed?.category).length,
        changedPairCount: previewRows.filter((row) => row.status === 'suggested'
          && (row.current.category !== row.proposed?.category
            || row.current.subcategory !== row.proposed?.subcategory)).length,
        unresolved: previewRows.filter((row) => row.status === 'unresolved').map((row) => row.merchant),
        expectationFindings,
        transactionMutationCount: 0,
        merchantCacheGrowth: (afterRules.count ?? 0) - (beforeRules.count ?? 0),
      },
    }
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)

    const allowedCategories = new Set([...Object.keys(CATEGORY_TAXONOMY), 'Income', 'Transfer', 'Investing', 'Uncategorized'])
    expect(allTransactions.every((row) => allowedCategories.has(row.category))).toBe(true)
    expect(allTransactions.filter((row) => row.category !== 'Uncategorized').length / allTransactions.length).toBeGreaterThan(0.9)
    expect(previewRows.some((row) => row.status === 'protected')).toBe(true)
    expect(previewRows.filter((row) => row.status !== 'protected').length).toBeGreaterThan(0)
    expect(expectationFindings).toEqual([])

    console.log(`Gate 2 report: ${REPORT_PATH}`)
  }, 600_000)
})
