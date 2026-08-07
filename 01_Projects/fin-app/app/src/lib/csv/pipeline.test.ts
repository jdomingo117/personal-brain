/**
 * Pipeline tests — staging behaviour over real sample files.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import { stageRows, applyAssignments, toTransactionPayload, buildAnchor } from './pipeline'

const SAMPLES = join(__dirname, '..', '..', '..', '..', 'Sample datasets')
const load = (n: string) =>
  Papa.parse<Record<string, string>>(readFileSync(join(SAMPLES, n), 'utf8'), {
    header: true, skipEmptyLines: true,
  }).data.filter((r) => Object.keys(r).length > 1)

const STG = {
  dateCol: 'Date', descCol: 'Description', debitCol: 'Debit', creditCol: 'Credit',
  categoryCol: 'Category', subcategoryCol: 'SubCategory',
}
const ACCOUNT = '11111111-1111-1111-1111-111111111111'

describe('stageRows', () => {
  it('stages every row of a real file as importable', async () => {
    const res = await stageRows(load('StGreorge_CreditCardtrans180726.csv'), STG, ACCOUNT)
    expect(res.stats.total).toBeGreaterThan(0)
    expect(res.stats.badDate).toBe(0)
    expect(res.stats.noAmount).toBe(0)
    expect(res.stats.importable).toBe(res.stats.total)
  })

  it('uses the bank category column for free (tier 1)', async () => {
    const res = await stageRows(load('StGreorge_CreditCardtrans180726.csv'), STG, ACCOUNT)
    expect(res.stats.fromBankCategory).toBeGreaterThan(0)
    const banked = res.rows.filter((r) => r.categorySource === 'bank')
    for (const r of banked) expect(r.category).not.toBe('Uncategorized')
  })

  it('reports unmapped bank categories rather than hiding them', async () => {
    const res = await stageRows(load('StGreorge_CreditCardtrans180726.csv'), STG, ACCOUNT)
    // These two genuinely have no home in the 7 expense categories.
    expect(res.unmappedBankCategories).toContain('Fees & Charges')
  })

  it('only asks the AI about merchants the bank did not classify', async () => {
    const res = await stageRows(load('StGreorge_CreditCardtrans180726.csv'), STG, ACCOUNT)
    const bankedKeys = new Set(res.rows.filter((r) => r.categorySource === 'bank').map((r) => r.merchantKey))
    for (const m of res.pendingMerchants) expect(bankedKeys.has(m.key)).toBe(false)
  })

  it('deduplicates merchants so the AI batch is far smaller than the row count', async () => {
    const res = await stageRows(load('AMEX_transactions.csv'), {
      dateCol: 'Date', descCol: 'Description', amountCol: 'Amount', invertAmount: true,
    }, ACCOUNT)
    expect(res.pendingMerchants.length).toBeLessThanOrEqual(res.stats.total)
  })

  it('QUARANTINES an unparseable date instead of dating it today', async () => {
    const rows = [
      { Date: '31/31/2026', Description: 'Broken Row', Debit: '10.00', Credit: '' },
      { Date: '18/06/2026', Description: 'Good Row', Debit: '10.00', Credit: '' },
    ]
    const res = await stageRows(rows, STG, ACCOUNT)
    const bad = res.rows.find((r) => r.originalDescription === 'Broken Row')!
    expect(bad.date).toBeNull()
    expect(bad.issues).toContain('bad-date')
    expect(bad.include).toBe(false)
    expect(res.stats.importable).toBe(1)

    // And it must never reach the payload.
    const payload = toTransactionPayload(res.rows, ACCOUNT, 'batch-1')
    expect(payload).toHaveLength(1)
    expect(payload[0].original_description).toBe('Good Row')
  })

  it('marks a row with no resolvable amount', async () => {
    const res = await stageRows(
      [{ Date: '18/06/2026', Description: 'No Amount', Debit: '', Credit: '' }],
      STG, ACCOUNT,
    )
    expect(res.rows[0].issues).toContain('no-amount')
    expect(res.rows[0].include).toBe(false)
  })

  it('flags low confidence when the date format is ambiguous', async () => {
    const res = await stageRows(
      [{ Date: '03/04/2026', Description: 'X', Debit: '1.00', Credit: '' }],
      STG, ACCOUNT,
    )
    expect(res.dateFormatConfident).toBe(false)
  })
})

describe('applyAssignments', () => {
  it('fills in AI categories but never overwrites a bank-sourced one', async () => {
    const res = await stageRows(load('StGreorge_CreditCardtrans180726.csv'), STG, ACCOUNT)
    const banked = res.rows.find((r) => r.categorySource === 'bank')!
    const applied = applyAssignments(res.rows, [
      { key: banked.merchantKey, category: 'Investing', subcategory: null, source: 'ai' },
    ])
    const after = applied.find((r) => r.id === banked.id)!
    expect(after.category).toBe(banked.category)
    expect(after.categorySource).toBe('bank')
  })

  it('marks Uncategorized results for review', async () => {
    const res = await stageRows(
      [{ Date: '18/06/2026', Description: 'Mystery Co', Debit: '5.00', Credit: '' }],
      { ...STG, categoryCol: null, subcategoryCol: null }, ACCOUNT,
    )
    const applied = applyAssignments(res.rows, [
      { key: res.rows[0].merchantKey, category: 'Uncategorized', subcategory: null, source: 'ai' },
    ])
    expect(applied[0].needsReview).toBe(true)
  })
})

describe('buildAnchor', () => {
  it('makes the ledger sum to the declared balance', async () => {
    const res = await stageRows(load('StGreorge_CreditCardtrans180726.csv'), STG, ACCOUNT)
    const target = -125_00
    const anchor = buildAnchor(res.rows, ACCOUNT, target, 'b1')!
    const net = toTransactionPayload(res.rows, ACCOUNT, 'b1')
      .reduce((s, r) => s + r.amount, 0)
    expect(net + anchor.row.amount).toBe(target)
  })

  it('dates the anchor before the earliest imported row', async () => {
    const res = await stageRows(load('StGreorge_CreditCardtrans180726.csv'), STG, ACCOUNT)
    const anchor = buildAnchor(res.rows, ACCOUNT, -125_00, 'b1')!
    const earliest = toTransactionPayload(res.rows, ACCOUNT, 'b1')
      .map((r) => r.date).sort()[0]
    expect(anchor.row.date < earliest).toBe(true)
  })

  it('is categorised as Transfer so it never counts as spending', async () => {
    const res = await stageRows(load('StGreorge_CreditCardtrans180726.csv'), STG, ACCOUNT)
    const anchor = buildAnchor(res.rows, ACCOUNT, -125_00, 'b1')!
    expect(anchor.row.category).toBe('Transfer')
    expect(anchor.row.subcategory).toBe('Reconciliation')
  })

  it('is omitted entirely when no adjustment is needed', async () => {
    const res = await stageRows(load('StGreorge_CreditCardtrans180726.csv'), STG, ACCOUNT)
    const net = toTransactionPayload(res.rows, ACCOUNT, 'b1').reduce((s, r) => s + r.amount, 0)
    expect(buildAnchor(res.rows, ACCOUNT, net, 'b1')).toBeNull()
  })
})
