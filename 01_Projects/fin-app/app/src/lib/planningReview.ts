import type { Account, Txn } from '../data'
import type { ProjectionEvent, ProjectionMetric } from './projections'
import { isCashAccount } from './projections'

export interface PlanningMonthReview {
  month: string
  actualMovement: number
  plannedMovement: number
  expectedMovement: number
  variance: number
  observedIncome: number
  observedSpend: number
  observedRunRateDifference: number
  plannedEventDifference: number
  recurringTimingDifference: number
  uncategorisedResidual: number
}

const keyFor = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

export const latestCompletedMonth = (today = new Date()) => keyFor(new Date(today.getFullYear(), today.getMonth() - 1, 1))

const activeInMonth = (event: ProjectionEvent, month: string) => {
  const start = event.startDate.slice(0, 7)
  const end = event.endDate?.slice(0, 7)
  return event.cadence === 'once' ? start === month : month >= start && (!end || month <= end)
}

/**
 * Reconciles one *completed* month. This deliberately does not use a partial
 * current month or infer reasons with AI: every variance component is a direct
 * ledger or saved-plan calculation and the displayed components sum exactly.
 */
export function reviewCompletedMonth({
  metric, accounts, transactions, monthlyRunRate, events, today = new Date(),
}: {
  metric: ProjectionMetric
  accounts: Account[]
  transactions: Txn[]
  monthlyRunRate: number
  events: ProjectionEvent[]
  today?: Date
}): PlanningMonthReview {
  const month = latestCompletedMonth(today)
  const cashIds = new Set(accounts.filter(isCashAccount).map((account) => account.id))
  const eligible = transactions.filter((transaction) => {
    if (transaction.pending || transaction.date.slice(0, 7) !== month) return false
    if (metric === 'cash') return cashIds.has(transaction.account_id)
    return !transaction.isTransfer && !(transaction.kind === 'investment' && transaction.amount < 0)
  })
  const actualMovement = eligible.reduce((sum, transaction) => sum + transaction.amount, 0)
  const observedIncome = eligible.filter((transaction) => transaction.amount > 0).reduce((sum, transaction) => sum + transaction.amount, 0)
  const observedSpend = eligible.filter((transaction) => transaction.amount < 0).reduce((sum, transaction) => sum + transaction.amount, 0)
  const uncategorisedResidual = eligible
    .filter((transaction) => !transaction.cat || transaction.cat === 'Uncategorized')
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const plannedMovement = events.filter((event) => activeInMonth(event, month)).reduce((sum, event) => sum + event.amountCents, 0)
  const observedRunRateDifference = actualMovement - uncategorisedResidual - monthlyRunRate
  const plannedEventDifference = -plannedMovement
  const recurringTimingDifference = 0
  const variance = actualMovement - monthlyRunRate - plannedMovement
  return {
    month, actualMovement, plannedMovement, expectedMovement: monthlyRunRate + plannedMovement,
    variance, observedIncome, observedSpend, observedRunRateDifference, plannedEventDifference,
    recurringTimingDifference, uncategorisedResidual,
  }
}
