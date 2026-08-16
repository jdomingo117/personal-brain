import type { Txn } from '../data'
import { dayLabel, monthLabel } from './period'
import { earnedIncomeCents, effectiveTransactionKind, expenseEffectCents } from './classification'

export type CashFlowGranularity = 'day' | 'week' | 'month'

export interface CashFlowBucket {
  start: string
  end: string
  label: string
  inflow: number
  outflow: number
}

const MS_PER_DAY = 86_400_000

const utc = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

const toIso = (timestamp: number) => {
  const date = new Date(timestamp)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

const daysBetween = (from: string, to: string) => Math.floor((utc(to) - utc(from)) / MS_PER_DAY)

/** The axis earns more aggregation only as the selected range becomes longer. */
export function cashFlowGranularity(from: string, to: string): CashFlowGranularity {
  const days = daysBetween(from, to) + 1
  if (days <= 45) return 'day'
  if (days <= 183) return 'week'
  return 'month'
}

function monthEnd(date: string) {
  const [year, month] = date.split('-').map(Number)
  return toIso(Date.UTC(year, month, 0))
}

function firstOfNextMonth(date: string) {
  const [year, month] = date.split('-').map(Number)
  return toIso(Date.UTC(year, month, 1))
}

function makeBuckets(from: string, to: string, granularity: CashFlowGranularity): CashFlowBucket[] {
  const buckets: CashFlowBucket[] = []
  if (from > to) return buckets

  if (granularity === 'day') {
    for (let time = utc(from); time <= utc(to); time += MS_PER_DAY) {
      const date = toIso(time)
      buckets.push({ start: date, end: date, label: dayLabel(date), inflow: 0, outflow: 0 })
    }
    return buckets
  }

  if (granularity === 'week') {
    for (let start = utc(from); start <= utc(to); start += 7 * MS_PER_DAY) {
      const bucketStart = toIso(start)
      const bucketEnd = toIso(Math.min(start + 6 * MS_PER_DAY, utc(to)))
      buckets.push({ start: bucketStart, end: bucketEnd, label: dayLabel(bucketStart), inflow: 0, outflow: 0 })
    }
    return buckets
  }

  let start = `${from.slice(0, 7)}-01`
  while (start <= to) {
    const end = monthEnd(start)
    buckets.push({ start, end, label: monthLabel(start), inflow: 0, outflow: 0 })
    start = firstOfNextMonth(start)
  }
  return buckets
}

/**
 * Builds the Income analyzer's exact-range cash-flow series. Empty intervals
 * remain explicit buckets, so a cumulative line describes elapsed time instead
 * of hopping directly between transaction days.
 */
export function buildCashFlowSeries({
  from,
  to,
  accountIds,
  transactions,
}: {
  from: string
  to: string
  accountIds: string[]
  transactions: Txn[]
}) {
  const granularity = cashFlowGranularity(from, to)
  const buckets = makeBuckets(from, to, granularity)
  const bucketByDate = new Map<string, CashFlowBucket>()

  for (const bucket of buckets) {
    if (granularity === 'day') bucketByDate.set(bucket.start, bucket)
    else if (granularity === 'week') {
      for (let time = utc(bucket.start); time <= utc(bucket.end); time += MS_PER_DAY) bucketByDate.set(toIso(time), bucket)
    } else {
      bucketByDate.set(bucket.start.slice(0, 7), bucket)
    }
  }

  for (const transaction of transactions) {
    const kind = effectiveTransactionKind(transaction)
    if (
      !accountIds.includes(transaction.account_id) ||
      transaction.isTransfer ||
      kind === 'transfer' ||
      kind === 'investment' ||
      kind === 'adjustment' ||
      transaction.pending ||
      transaction.date < from ||
      transaction.date > to
    ) continue

    const key = granularity === 'month' ? transaction.date.slice(0, 7) : transaction.date
    const bucket = bucketByDate.get(key)
    if (!bucket) continue
    bucket.inflow += earnedIncomeCents(transaction)
    bucket.outflow += expenseEffectCents(transaction)
  }

  const inflow = buckets.map((bucket) => bucket.inflow)
  const outflow = buckets.map((bucket) => bucket.outflow)
  const net = inflow.map((value, index) => value - outflow[index])

  return { granularity, buckets, inflow, outflow, net, labels: buckets.map((bucket) => bucket.label) }
}
