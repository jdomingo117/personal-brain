/** Deterministic fictional-data assistance. Not a live financial-data adapter. All money is cents. */
import { addDays, contributionDates, displayDate, occurrences, periodAt, validDate, type Frequency } from './frequency'
import { type Goal } from './model'
import { fmtCents } from '../../data'

export const METHOD = 'budget-assist-v1'
export const suggestionFixtures = [
  { id: 'complete', label: 'Complete history' }, { id: 'short', label: 'Limited history' },
  { id: 'gap', label: 'Missing account activity' }, { id: 'changed', label: 'Recent income change' },
  { id: 'underfunded', label: 'Funding gap' }, { id: 'integrity', label: 'Unresolved transfer' },
  { id: 'empty', label: 'No history' },
] as const
export type FixtureId = typeof suggestionFixtures[number]['id']
export const validFixture = (id: unknown): id is FixtureId => suggestionFixtures.some(f => f.id === id)
type Entry = { id: string; date: string; amount: number; category: string; kind: 'expense' | 'refund' | 'income' | 'transfer' | 'repayment'; pending?: boolean; replaced?: boolean; splitParent?: boolean }
export type History = { id: FixtureId; from: string; until: string; months: string[]; missing: string[]; currency: string; integrity: boolean; changed: boolean; rows: Entry[] }
export type DraftAmounts = { income: number; bills: number; upcoming: number; savings: number; everyday: number }
export type Assistance = { fingerprint: string; periodTotals: number[]; labels: string[]; monthlyCount: number; eligible: boolean; reasons: string[]; median: number | null; minimum: number | null; maximum: number | null; variable: boolean; observedIncome: number; observedTotal: number; uncategorised: number; source: { id: string; name: string; planned: number; spent: number }[]; defaults: DraftAmounts; payDates: string[]; bills: { name: string; date: string; amount: number }[] }

export function medianCents(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.floor((sorted[middle - 1] + sorted[middle] + 1) / 2)
}
export function historyFixture(id: FixtureId): History {
  const months = id === 'empty' ? [] : id === 'short' ? ['2026-08', '2026-09'] : ['2026-06', '2026-07', '2026-08', '2026-09']
  const rows: Entry[] = []
  for (const month of months) {
    const index = Number(month.slice(-2)) - 6
    const other = [70000, 80000, 80000, 110000][index]
    for (const day of ['05', '12', '19', '26']) {
      for (const [category, amount] of [['groceries', 17500], ['dining', 7500], ['other', other / 4]] as const) rows.push({ id: `${month}-${day}-${category}`, date: `${month}-${day}`, amount, category, kind: 'expense' })
    }
    rows.push({ id: `${month}-pay1`, date: `${month}-12`, amount: 300000, category: '', kind: 'income' }, { id: `${month}-pay2`, date: `${month}-26`, amount: 300000, category: '', kind: 'income' })
    // Refund pair nets to zero; exclude pending, superseded duplicates, split parent and own transfers.
    rows.push({ id: `${month}-return-buy`, date: `${month}-05`, amount: 4000, category: 'other', kind: 'expense' }, { id: `${month}-refund`, date: `${month}-12`, amount: 4000, category: 'other', kind: 'refund' },
      { id: `${month}-pending`, date: `${month}-19`, amount: 4500, category: 'dining', kind: 'expense', pending: true },
      { id: `${month}-old`, date: `${month}-19`, amount: 17500, category: 'groceries', kind: 'expense', replaced: true },
      { id: `${month}-parent`, date: `${month}-19`, amount: other / 4, category: 'other', kind: 'expense', splitParent: true },
      { id: `${month}-transfer`, date: `${month}-12`, amount: 200000, category: '', kind: 'transfer' },
      { id: `${month}-repay`, date: `${month}-26`, amount: 200000, category: '', kind: 'repayment' })
  }
  return { id, from: months.length ? `${months[0]}-01` : '2026-10-01', until: '2026-10-01', months,
    missing: id === 'gap' ? ['2026-06', '2026-07'] : [], currency: 'AUD', integrity: id !== 'integrity', changed: id === 'changed', rows }
}
const settled = (rows: Entry[]) => rows.filter(r => !r.pending && !r.replaced && !r.splitParent)
export const expenseTotal = (rows: Entry[]) => settled(rows).reduce((sum, r) => sum + (r.kind === 'expense' ? r.amount : r.kind === 'refund' ? -r.amount : 0), 0)
export const draftFree = (d: DraftAmounts, goal = 0) => d.income - d.bills - d.upcoming - d.savings - d.everyday - goal

export function suggest(history: History, frequency: Frequency, anchor: string): Assistance {
  const covered = [...new Set(history.months)].filter(m => /^2026-(04|05|06|07|08|09)$/.test(m) && !history.missing.includes(m)).sort()
  const totals: number[] = [], labels: string[] = []
  if (frequency === 'monthly') {
    for (const month of covered) { totals.push(expenseTotal(history.rows.filter(r => r.date.startsWith(month)))); labels.push(month) }
  } else if (covered.length) {
    let period = periodAt('fortnightly', anchor, history.from)
    if (period.start < history.from) period = { start: period.end, end: addDays(period.end, 14) }
    for (let n = 0; n < 14 && period.end <= history.until; n++, period = { start: period.end, end: addDays(period.end, 14) }) {
      let complete = true
      for (let date = period.start; date < period.end; date = addDays(date, 1)) if (!covered.includes(date.slice(0, 7))) complete = false
      if (complete) { totals.push(expenseTotal(history.rows.filter(r => r.date >= period.start && r.date < period.end))); labels.push(`${period.start} / ${addDays(period.end, -1)}`) }
    }
  }
  const reasons: string[] = []
  const canonical = settled(history.rows)
  const integral = canonical.every(r => Number.isSafeInteger(r.amount) && r.amount >= 0 && validDate(r.date)) && new Set(canonical.map(r => r.id)).size === canonical.length
  if (history.currency !== 'AUD') reasons.push('Choose AUD accounts before using these suggestions.')
  if (history.missing.length) reasons.push('Credit card activity is missing for June and July. Those months were not treated as zero.')
  if (covered.length < 3 || frequency === 'fortnightly' && totals.length < 6) reasons.push('There is not enough complete history for a suggested everyday amount. You can start with your own amounts now.')
  if (!history.integrity || !integral) reasons.push('Unresolved or invalid activity could change the totals. Check it before using a suggested plan.')
  const eligible = covered.length >= 3 && (frequency === 'monthly' || totals.length >= 6) && history.currency === 'AUD' && history.integrity && integral
  const middle = medianCents(totals)
  const current = periodAt(frequency, anchor)
  const schedule = occurrences(current)
  const pay = schedule.filter(r => r.kind === 'pay')
  const bills = schedule.filter(r => r.kind === 'bill')
  const everyday = eligible ? Math.max(0, middle!) : 0
  // Existing concept actuals remain in the activated plan. They are never erased by a suggestion.
  const currentSpending = frequency === 'monthly' ? [76000, 35000, 40000] : [18000, 9000, 12000]
  const dining = Math.min(everyday, frequency === 'monthly' ? 30000 : 15000)
  const groceries = Math.min(everyday - dining, frequency === 'monthly' ? 70000 : 35000)
  const rows = settled(history.rows.filter(r => covered.includes(r.date.slice(0, 7))))
  const minimum = totals.length ? Math.min(...totals) : null, maximum = totals.length ? Math.max(...totals) : null
  const sourceText = JSON.stringify(history)
  let hash = 2166136261
  for (let i = 0; i < sourceText.length; i++) hash = Math.imul(hash ^ sourceText.charCodeAt(i), 16777619)
  return { fingerprint: `${METHOD}:${frequency}:${anchor}:${hash >>> 0}`, eligible, reasons, monthlyCount: covered.length,
    periodTotals: totals, labels, median: middle, minimum, maximum, variable: middle !== null && (maximum! - minimum!) / Math.max(middle, 100) > 1,
    observedTotal: expenseTotal(rows), observedIncome: rows.filter(r => r.kind === 'income').reduce((sum, r) => sum + r.amount, 0), uncategorised: expenseTotal(rows.filter(r => !r.category && ['expense', 'refund'].includes(r.kind))),
    defaults: { income: history.id === 'underfunded' ? 150000 : pay.reduce((sum, r) => sum + r.amount, 0), bills: frequency === 'monthly' ? 250000 : bills.reduce((sum, r) => sum + r.amount, 0), upcoming: frequency === 'monthly' ? 40000 : 110000, savings: frequency === 'monthly' ? 100000 : 50000, everyday },
    payDates: pay.map(r => r.date), bills,
    source: [{ id: 'dining', name: 'Dining & takeaway', planned: dining, spent: currentSpending[1] }, { id: 'other', name: 'Other everyday spending', planned: Math.max(0, everyday - dining - groceries), spent: currentSpending[2] }] }
}

export type WhatIf = { source: string; amount: number; destination: 'goal' | 'unassigned'; future: boolean; goal: Goal | null }
export function whatIf(d: DraftAmounts, evidence: Assistance, change: WhatIf) {
  const source = evidence.source.find(s => s.id === change.source)
  if (!source || !Number.isSafeInteger(change.amount) || change.amount < 0 || change.amount > d.everyday || change.amount > Math.max(0, source.planned - (change.future ? 0 : source.spent))) throw new Error('Choose an amount within the unused room, or try the change in a future budget.')
  if (change.destination === 'goal' && !change.goal) throw new Error('Choose a goal first.')
  if (change.goal && (change.goal.target === null || change.goal.opening < 0 || change.goal.monthly < 0 || change.goal.opening > change.goal.target)) throw new Error('Check the target, existing savings and contribution.')
  const before = change.goal?.monthly ?? 0
  const after = before + (change.destination === 'goal' ? change.amount : 0)
  return { everyday: d.everyday - change.amount, goalAmount: after, sourceBefore: source.planned, sourceAfter: source.planned - change.amount,
    freeBefore: draftFree(d, before), freeAfter: draftFree({ ...d, everyday: d.everyday - change.amount }, after) }
}

export function outcome(goal: Goal | null, amount: number, frequency: Frequency, anchor: string, eligible = true, from = '2026-10-19'): string {
  if (!eligible || !goal || !goal.target || goal.paused || amount <= 0) return 'No finish estimate yet'
  const count = Math.ceil(Math.max(0, goal.target - goal.opening) / amount)
  if (!count) return 'Target already covered by your opening savings'
  const dates = contributionDates(frequency, anchor, '2027-10-19', from)
  const date = dates[count - 1]
  const horizon = '2027-10-19'
  if (goal.neededBy && goal.neededBy <= horizon) {
    const availableDates = contributionDates(frequency, anchor, goal.neededBy, from).length
    const gap = Math.max(0, goal.target - goal.opening - availableDates * amount)
    if (gap > 0) return `Still needs ${fmtCents(gap)} by ${displayDate(goal.neededBy)}`
  }
  if (!date || date > horizon) return 'More than a year at this amount'
  // Calculated schedule, not a probability of success. Includes the current planned contribution.
  return `${count} contributions · ${displayDate(date)}`
}
export const firstContribution = (frequency: Frequency, anchor: string) => contributionDates(frequency, anchor, '2027-10-19')[0]
export type AssistedDraft = { fixture: FixtureId; fingerprint: string; values: DraftAmounts; goal: Goal | null; futureEveryday?: number; futureGoalAmount?: number; confirmed: boolean }
