import type { Account, Txn } from '../data'
import { INVESTING_CATEGORY } from '../data'

export type ProjectionMetric = 'cash' | 'netWorth'

export interface ProjectionPoint {
  date: string
  value: number
}

export interface ProjectionInputs {
  metric: ProjectionMetric
  currentValue: number
  investmentBalance: number
  monthlyFlow: number
  monthlyInvestmentContribution: number
  annualReturnPct: number
  monthlyAdjustment?: number
  /** First projected month that receives the adjustment. Month 1 means now. */
  adjustmentStartMonth?: number
  months: number
  startDate?: Date
}

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const parseDate = (iso: string) => new Date(`${iso}T00:00:00`)
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)

export const isCashAccount = (account: Pick<Account, 'type'>) =>
  account.type === 'Liquid' || account.type === 'Savings'

export function currentValueFor(metric: ProjectionMetric, accounts: Account[]): number {
  return accounts
    .filter((account) => metric === 'netWorth' || isCashAccount(account))
    .reduce((total, account) => total + account.balance, 0)
}

/**
 * A transparent run rate from up to six completed calendar months. Current-month
 * activity is deliberately omitted so a half-finished month is never annualised.
 */
export function deriveProjectionBaseline(
  metric: ProjectionMetric,
  accounts: Account[],
  transactions: Txn[],
  today = new Date(),
  lookbackMonths = 6,
) {
  const cashIds = new Set(accounts.filter(isCashAccount).map((account) => account.id))
  const currentMonth = startOfMonth(today)
  const availableDates = transactions
    .filter((transaction) => parseDate(transaction.date) < currentMonth)
    .map((transaction) => parseDate(transaction.date))
  const earliest = availableDates.length
    ? startOfMonth(new Date(Math.max(
        Math.min(...availableDates.map((date) => date.getTime())),
        new Date(currentMonth.getFullYear(), currentMonth.getMonth() - lookbackMonths, 1).getTime(),
      )))
    : currentMonth

  const months: string[] = []
  for (let date = new Date(earliest); date < currentMonth; date.setMonth(date.getMonth() + 1)) {
    months.push(monthKey(date))
  }

  const totals = new Map(months.map((month) => [month, 0]))
  const investmentTotals = new Map(months.map((month) => [month, 0]))

  for (const transaction of transactions) {
    if (transaction.pending) continue
    // Across net worth, every internal transfer is neutral. Across cash, keep
    // transfer legs: cash-to-cash pairs cancel when summed, while cash moved to
    // an investment correctly reduces the amount still available as cash.
    if (metric === 'netWorth' && transaction.isTransfer) continue
    const key = transaction.date.slice(0, 7)
    if (!totals.has(key)) continue
    if (metric === 'cash' && !cashIds.has(transaction.account_id)) continue

    // Buying an investment reduces available cash, but merely exchanges one
    // asset for another in a net-worth forecast.
    if (metric === 'netWorth' && transaction.cat === INVESTING_CATEGORY) {
      if (transaction.amount < 0) {
        investmentTotals.set(key, (investmentTotals.get(key) ?? 0) + Math.abs(transaction.amount))
      }
      continue
    }
    totals.set(key, (totals.get(key) ?? 0) + transaction.amount)
  }

  const divisor = Math.max(months.length, 1)
  return {
    monthlyFlow: Math.round([...totals.values()].reduce((sum, value) => sum + value, 0) / divisor),
    monthlyInvestmentContribution: Math.round(
      [...investmentTotals.values()].reduce((sum, value) => sum + value, 0) / divisor,
    ),
    monthsUsed: months.length,
    fromMonth: months[0] ?? null,
    toMonth: months[months.length - 1] ?? null,
  }
}

export function monthsBetween(start: Date, targetIso: string): number {
  const target = parseDate(targetIso)
  return Math.max(1, (target.getFullYear() - start.getFullYear()) * 12 + target.getMonth() - start.getMonth())
}

export function buildProjection(inputs: ProjectionInputs): ProjectionPoint[] {
  const start = inputs.startDate ?? new Date()
  const monthlyReturn = Math.pow(1 + Math.max(inputs.annualReturnPct, -99) / 100, 1 / 12) - 1
  const adjustment = inputs.monthlyAdjustment ?? 0
  const adjustmentStartMonth = Math.max(1, inputs.adjustmentStartMonth ?? 1)
  let total = inputs.currentValue
  let investments = inputs.investmentBalance
  const points: ProjectionPoint[] = [{ date: monthKey(start), value: Math.round(total) }]

  for (let i = 1; i <= inputs.months; i += 1) {
    let growth = 0
    if (inputs.metric === 'netWorth') {
      growth = investments * monthlyReturn
      investments = investments + inputs.monthlyInvestmentContribution + growth
    }
    const activeAdjustment = i >= adjustmentStartMonth ? adjustment : 0
    total = total + inputs.monthlyFlow + activeAdjustment + growth
    const date = new Date(start.getFullYear(), start.getMonth() + i, 1)
    points.push({ date: monthKey(date), value: Math.round(total) })
  }
  return points
}

export function firstTargetPoint(points: ProjectionPoint[], target: number): ProjectionPoint | null {
  if (points[0].value >= target) return points[0]
  return points.find((point) => point.value >= target) ?? null
}

/** Smallest additional monthly contribution needed to meet a dated goal. */
export function requiredMonthlyAdjustment(inputs: ProjectionInputs, target: number): number {
  const baseline = buildProjection(inputs).at(-1)?.value ?? inputs.currentValue
  if (baseline >= target) return 0

  let low = 0
  let high = Math.max(target - baseline, 100_00)
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2
    const result = buildProjection({ ...inputs, monthlyAdjustment: mid }).at(-1)?.value ?? 0
    if (result >= target) high = mid
    else low = mid
  }
  return Math.ceil(high / 100) * 100
}
