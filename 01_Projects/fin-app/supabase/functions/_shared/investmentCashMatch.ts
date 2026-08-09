/** Server mirror of app/src/lib/investments/cashMatch.ts. Keep constants and scoring identical. */
export const INVESTMENT_CASH_MATCHER_VERSION = 1
export const INVESTMENT_CASH_WINDOW_DAYS = 4
const AUTO_THRESHOLD = 0.8
const SUGGESTED_THRESHOLD = 0.55
const AMBIGUITY_MARGIN = 0.05
const MAX_BUCKET = 64

export type CashFlowActivityType = 'purchase' | 'redemption'
export interface InvestmentCashTransaction {
  id: string; accountId: string; date: string; amountCents: number; description?: string | null
  category?: string | null; dedupeHash: string; occurrence: number
}
export interface InvestmentCashActivity {
  id: string; accountId: string; tradeDate: string; activityType: CashFlowActivityType
  valueCents: number; brokerageCents: number; sourceHash: string; occurrence: number
  platform: string; instrumentName: string
}
export interface InvestmentCashPair {
  transaction: InvestmentCashTransaction; activity: InvestmentCashActivity
  state: 'auto' | 'suggested' | 'confirmed'; score: number; reasons: string[]; ambiguous: boolean
}
export interface InvestmentCashExclusions {
  rejectedPairKeys?: Set<string>; confirmedPairKeys?: Set<string>
  pinnedTransactionIds?: Set<string>; pinnedActivityIds?: Set<string>
}

export function investmentCashContentKey(transaction: InvestmentCashTransaction, activity: InvestmentCashActivity): string {
  return [transaction.accountId, transaction.dedupeHash, transaction.occurrence,
    activity.accountId, activity.sourceHash, activity.occurrence].join(':')
}

function utcDay(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}
function dayDiff(a: string, b: string): number { return Math.abs(utcDay(a) - utcDay(b)) }
function crossesWeekend(a: string, b: string): boolean {
  const start = Math.min(utcDay(a), utcDay(b)); const end = Math.max(utcDay(a), utcDay(b))
  for (let day = start; day <= end; day++) {
    const dow = ((day + 4) % 7 + 7) % 7
    if (dow === 0 || dow === 6) return true
  }
  return false
}
export function expectedBankAmount(activity: InvestmentCashActivity): number {
  const value = Math.abs(activity.valueCents); const brokerage = Math.abs(activity.brokerageCents)
  return activity.activityType === 'purchase' ? -(value + brokerage) : Math.max(0, value - brokerage)
}
function platformTokens(activity: InvestmentCashActivity): string[] {
  const tokens = [activity.platform, activity.instrumentName].join(' ').toLowerCase().match(/[a-z0-9]{4,}/g) ?? []
  return [...new Set(tokens.filter((token) => !['personal', 'investor', 'index', 'fund', 'managed', 'growth', 'high'].includes(token)))]
}
function scorePair(transaction: InvestmentCashTransaction, activity: InvestmentCashActivity) {
  const diff = dayDiff(transaction.date, activity.tradeDate)
  let score = diff === 0 ? 0.55 : diff === 1 ? 0.45 : diff === 2 ? 0.35 : 0.1
  const reasons = [diff === 0 ? 'same-day' : 'near-date', 'exact-amount']
  if (diff >= 3 && crossesWeekend(transaction.date, activity.tradeDate)) { score += 0.2; reasons.push('weekend-settlement') }
  const description = (transaction.description ?? '').toLowerCase()
  if (platformTokens(activity).some((token) => description.includes(token))) { score += 0.3; reasons.push('platform-match') }
  if (transaction.category === 'Transfer' || transaction.category === 'Investing') { score += 0.1; reasons.push(`category:${transaction.category.toLowerCase()}`) }
  if (/\b(invest(?:ment|ing|ments)?|managed fund|funds? transfer)\b/i.test(description)) { score += 0.1; reasons.push('investment-language') }
  return { score: Math.round(Math.min(1, score) * 10_000) / 10_000, reasons }
}
interface Candidate { transaction: InvestmentCashTransaction; activity: InvestmentCashActivity; score: number; reasons: string[]; key: string }

export function matchInvestmentCash(
  transactions: InvestmentCashTransaction[], activities: InvestmentCashActivity[], exclusions: InvestmentCashExclusions = {},
): { pairs: InvestmentCashPair[]; overflowedAmounts: number[] } {
  const txBuckets = new Map<number, InvestmentCashTransaction[]>()
  for (const transaction of transactions) {
    if (exclusions.pinnedTransactionIds?.has(transaction.id)) continue
    if (!txBuckets.has(transaction.amountCents)) txBuckets.set(transaction.amountCents, [])
    txBuckets.get(transaction.amountCents)!.push(transaction)
  }
  const activityBuckets = new Map<number, InvestmentCashActivity[]>()
  for (const activity of activities) {
    if (exclusions.pinnedActivityIds?.has(activity.id)) continue
    const amount = expectedBankAmount(activity); if (amount === 0) continue
    if (!activityBuckets.has(amount)) activityBuckets.set(amount, [])
    activityBuckets.get(amount)!.push(activity)
  }
  const candidates: Candidate[] = []; const overflowedAmounts: number[] = []
  for (const [amount, activityBucket] of activityBuckets) {
    const txBucket = txBuckets.get(amount) ?? []
    if (activityBucket.length > MAX_BUCKET || txBucket.length > MAX_BUCKET) { overflowedAmounts.push(Math.abs(amount)); continue }
    for (const activity of activityBucket) for (const transaction of txBucket) {
      if (transaction.accountId === activity.accountId || dayDiff(transaction.date, activity.tradeDate) > INVESTMENT_CASH_WINDOW_DAYS) continue
      const key = investmentCashContentKey(transaction, activity)
      if (exclusions.rejectedPairKeys?.has(key)) continue
      const scored = scorePair(transaction, activity)
      if (scored.score < SUGGESTED_THRESHOLD && !exclusions.confirmedPairKeys?.has(key)) continue
      candidates.push({ transaction, activity, ...scored, key })
    }
  }
  const byTx = new Map<string, number[]>(); const byActivity = new Map<string, number[]>()
  for (const candidate of candidates) {
    if (!byTx.has(candidate.transaction.id)) byTx.set(candidate.transaction.id, [])
    if (!byActivity.has(candidate.activity.id)) byActivity.set(candidate.activity.id, [])
    byTx.get(candidate.transaction.id)!.push(candidate.score); byActivity.get(candidate.activity.id)!.push(candidate.score)
  }
  for (const scores of [...byTx.values(), ...byActivity.values()]) scores.sort((a, b) => b - a)
  candidates.sort((a, b) => b.score - a.score || a.transaction.id.localeCompare(b.transaction.id))
  const usedTx = new Set<string>(); const usedActivities = new Set<string>(); const pairs: InvestmentCashPair[] = []
  for (const candidate of candidates) {
    if (usedTx.has(candidate.transaction.id) || usedActivities.has(candidate.activity.id)) continue
    const txScores = byTx.get(candidate.transaction.id) ?? []; const activityScores = byActivity.get(candidate.activity.id) ?? []
    const ambiguous = (txScores.length > 1 && txScores[0] - txScores[1] <= AMBIGUITY_MARGIN) ||
      (activityScores.length > 1 && activityScores[0] - activityScores[1] <= AMBIGUITY_MARGIN)
    const confirmed = exclusions.confirmedPairKeys?.has(candidate.key) ?? false
    pairs.push({ transaction: candidate.transaction, activity: candidate.activity, score: candidate.score,
      reasons: candidate.reasons, ambiguous,
      state: confirmed ? 'confirmed' : candidate.score >= AUTO_THRESHOLD && !ambiguous ? 'auto' : 'suggested' })
    usedTx.add(candidate.transaction.id); usedActivities.add(candidate.activity.id)
  }
  return { pairs, overflowedAmounts: [...new Set(overflowedAmounts)].sort((a, b) => a - b) }
}
