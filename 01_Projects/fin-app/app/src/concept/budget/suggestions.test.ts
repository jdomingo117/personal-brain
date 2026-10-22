import { describe, expect, it } from 'vitest'
import { draftFree, expenseTotal, historyFixture, medianCents, outcome, suggest, whatIf } from './suggestions'
import { freshBudget } from './model'

describe('fictional assisted budget engine', () => {
  const evidence = () => suggest(historyFixture('complete'), 'monthly', '2026-10-01')
  const goal = () => ({ ...freshBudget().goals[0], name: 'Snowboard', target: 90000, opening: 30000, monthly: 10000 })
  it('uses exact median cents and reconciles fixture transfers, repayments, refunds, replaced and split-parent rows', () => {
    expect(medianCents([101, 100])).toBe(101)
    expect(medianCents([])).toBeNull()
    const result = evidence()
    expect(result.eligible).toBe(true)
    expect(result.periodTotals).toEqual([170000, 180000, 180000, 210000])
    expect(result.median).toBe(180000)
    expect(result.observedTotal).toBe(740000)
    expect(expenseTotal(historyFixture('complete').rows)).toBe(740000)
    expect(draftFree(result.defaults)).toBe(30000)
  })
  it('rejects insufficient, missing-account, no-history and integrity evidence without zero-filling', () => {
    for (const id of ['short', 'gap', 'empty', 'integrity'] as const) expect(suggest(historyFixture(id), 'monthly', '2026-10-01').eligible).toBe(false)
    expect(suggest(historyFixture('gap'), 'monthly', '2026-10-01').periodTotals).toEqual([180000, 210000])
    expect(suggest(historyFixture('empty'), 'monthly', '2026-10-01').median).toBeNull()
    const foreign = historyFixture('complete'); foreign.currency = 'USD'
    expect(suggest(foreign, 'monthly', '2026-10-01').eligible).toBe(false)
  })
  it('uses complete anchor-aligned fortnights, not half of monthly figures', () => {
    const result = suggest(historyFixture('complete'), 'fortnightly', '2026-10-12')
    expect(result.eligible).toBe(true)
    expect(result.periodTotals.length).toBeGreaterThanOrEqual(6)
    expect(result.periodTotals.some(n => n !== 90000)).toBe(true)
    expect(result.median).toBe(medianCents(result.periodTotals))
    expect(result.labels[0]).not.toBe('2026-06-01 / 2026-06-30')
    expect(result.defaults.bills).toBe(12000)
    expect(suggest(historyFixture('short'), 'fortnightly', '2026-10-12').eligible).toBe(false)
  })
  it('retains uncategorised expenses, flags variability and fingerprints source revisions', () => {
    const h = historyFixture('complete')
    h.rows[0].category = ''
    h.rows[0].amount += 300000
    const result = suggest(h, 'monthly', '2026-10-01')
    expect(result.uncategorised).toBe(317500)
    expect(result.variable).toBe(true)
    expect(result.fingerprint).not.toBe(evidence().fingerprint)
    expect(result.observedTotal).toBe(1040000)
    h.rows.push({ ...h.rows[0] })
    expect(suggest(h, 'monthly', '2026-10-01').eligible).toBe(false)
  })
  it('preserves a signed gap rather than quietly cutting costs', () => {
    const result = suggest(historyFixture('underfunded'), 'monthly', '2026-10-01')
    expect(result.defaults.bills).toBe(250000)
    expect(result.defaults.everyday).toBe(180000)
    expect(draftFree(result.defaults)).toBe(-420000)
  })
  it('reassigns an amount once and never alters protected values or input records', () => {
    const e = evidence(), d = e.defaults
    const next = whatIf(d, e, { source: 'other', amount: 5000, destination: 'goal', future: false, goal: goal() })
    expect(next.everyday).toBe(175000)
    expect(next.goalAmount).toBe(15000)
    expect(next.freeAfter).toBe(next.freeBefore)
    expect(d.everyday).toBe(180000)
    expect(d.bills).toBe(250000)
    expect(whatIf(d, e, { source: 'other', amount: 5000, destination: 'unassigned', future: false, goal: null }).freeAfter).toBe(35000)
  })
  it('blocks spent allowance, missing sources/goals and excessive or malformed amounts', () => {
    const e = evidence()
    for (const amount of [-1, 40001, 0.5]) expect(() => whatIf(e.defaults, e, { source: 'other', amount, destination: 'goal', future: false, goal: goal() })).toThrow()
    expect(() => whatIf(e.defaults, e, { source: 'dining', amount: 5000, destination: 'goal', future: false, goal: goal() })).toThrow()
    expect(whatIf(e.defaults, e, { source: 'dining', amount: 5000, destination: 'goal', future: true, goal: goal() }).sourceAfter).toBe(25000)
    expect(() => whatIf(e.defaults, e, { source: 'other', amount: 1000, destination: 'goal', future: false, goal: null })).toThrow()
  })
  it('uses dated conditional outcomes with a bounded horizon and no zero/paused/unknown predictions', () => {
    expect(outcome(goal(), 10000, 'monthly', '2026-10-01')).toContain('6 contributions')
    expect(outcome(goal(), 15000, 'monthly', '2026-10-01')).toContain('4 contributions')
    expect(outcome(goal(), 10000, 'fortnightly', '2026-10-12')).toContain('3 Jan 2027')
    expect(outcome(goal(), 1, 'monthly', '2026-10-01')).toBe('More than a year at this amount')
    expect(outcome({ ...goal(), paused: true }, 10000, 'monthly', '2026-10-01')).toBe('No finish estimate yet')
    expect(outcome({ ...goal(), target: null }, 10000, 'monthly', '2026-10-01')).toBe('No finish estimate yet')
    expect(outcome(goal(), 0, 'monthly', '2026-10-01')).toBe('No finish estimate yet')
    expect(outcome({ ...goal(), neededBy: '2026-11-01' }, 10000, 'monthly', '2026-10-01')).toContain('Still needs $500.00')
  })
})
