import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import {
  INVESTMENT_CASH_MATCHER_VERSION,
  INVESTMENT_CASH_WINDOW_DAYS,
  investmentCashContentKey,
  matchInvestmentCash,
  type InvestmentCashActivity,
  type InvestmentCashTransaction,
} from './investmentCashMatch.ts'

const PAGE_SIZE = 1000

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day))
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function byteaToHex(value: unknown): string { return String(value ?? '').replace(/^\\x/, '') }
function relation<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined
}

async function paginate(queryFactory: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) {
  const rows: Record<string, unknown>[] = []
  for (let offset = 0;; offset += PAGE_SIZE) {
    const { data, error } = await queryFactory(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as Record<string, unknown>[]))
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
}

export interface InvestmentCashLinkResult {
  created: number
  removed: number
  auto: number
  suggested: number
  confirmed: number
  overflowedAmounts: number[]
}

export async function runInvestmentCashLinks(
  db: SupabaseClient,
  admin: SupabaseClient,
  tenantId: string,
  from: string,
  to: string,
): Promise<InvestmentCashLinkResult> {
  const paddedFrom = addDays(from, -INVESTMENT_CASH_WINDOW_DAYS)
  const paddedTo = addDays(to, INVESTMENT_CASH_WINDOW_DAYS)

  const [transactionRows, activityRows, decisionRows, confirmedRows] = await Promise.all([
    paginate((rangeFrom, rangeTo) => db.from('transactions')
      .select('id, account_id, date, amount, original_description, category, dedupe_hash, occurrence, accounts!inner(type)')
      .eq('tenant_id', tenantId)
      .gte('date', paddedFrom).lte('date', paddedTo)
      .neq('amount', 0).eq('pending', false)
      .in('accounts.type', ['Liquid', 'Savings', 'Credit Card'])
      .or('transfer_candidate.eq.true,category.eq.Investing')
      .range(rangeFrom, rangeTo)),
    paginate((rangeFrom, rangeTo) => db.from('investment_activities')
      .select('id, account_id, trade_date, activity_type, value_cents, brokerage_cents, source_hash, occurrence, investment_holdings!inner(platform), investment_instruments!inner(name)')
      .eq('tenant_id', tenantId)
      .gte('trade_date', paddedFrom).lte('trade_date', paddedTo)
      .in('activity_type', ['purchase', 'redemption'])
      .range(rangeFrom, rangeTo)),
    paginate((rangeFrom, rangeTo) => db.from('investment_cash_decisions')
      .select('transaction_account_id, transaction_hash, transaction_occurrence, activity_account_id, activity_hash, activity_occurrence, verdict')
      .eq('tenant_id', tenantId).range(rangeFrom, rangeTo)),
    paginate((rangeFrom, rangeTo) => db.from('investment_cash_links')
      .select('transaction_id, activity_id').eq('tenant_id', tenantId).eq('state', 'confirmed')
      .range(rangeFrom, rangeTo)),
  ])

  const transactions: InvestmentCashTransaction[] = transactionRows.flatMap((row) => {
    const hash = byteaToHex(row.dedupe_hash)
    if (!hash) return []
    return [{
      id: row.id as string, accountId: row.account_id as string, date: row.date as string,
      amountCents: Number(row.amount), description: row.original_description as string | null,
      category: row.category as string | null, dedupeHash: hash, occurrence: Number(row.occurrence),
    }]
  })
  const activities: InvestmentCashActivity[] = activityRows.map((row) => ({
    id: row.id as string, accountId: row.account_id as string, tradeDate: row.trade_date as string,
    activityType: row.activity_type as 'purchase' | 'redemption', valueCents: Number(row.value_cents),
    brokerageCents: Number(row.brokerage_cents), sourceHash: row.source_hash as string,
    occurrence: Number(row.occurrence),
    platform: relation(row.investment_holdings as { platform: string } | { platform: string }[])?.platform ?? '',
    instrumentName: relation(row.investment_instruments as { name: string } | { name: string }[])?.name ?? '',
  }))

  const transactionByContent = new Map(transactions.map((transaction) => [
    `${transaction.accountId}:${transaction.dedupeHash}:${transaction.occurrence}`, transaction,
  ]))
  const activityByContent = new Map(activities.map((activity) => [
    `${activity.accountId}:${activity.sourceHash}:${activity.occurrence}`, activity,
  ]))
  const rejectedPairKeys = new Set<string>()
  const confirmedPairKeys = new Set<string>()
  for (const row of decisionRows) {
    const transaction = transactionByContent.get(
      `${row.transaction_account_id}:${byteaToHex(row.transaction_hash)}:${row.transaction_occurrence}`,
    )
    const activity = activityByContent.get(
      `${row.activity_account_id}:${row.activity_hash}:${row.activity_occurrence}`,
    )
    if (!transaction || !activity) continue
    const key = investmentCashContentKey(transaction, activity)
    if (row.verdict === 'rejected') rejectedPairKeys.add(key)
    if (row.verdict === 'confirmed') confirmedPairKeys.add(key)
  }

  const pinnedTransactionIds = new Set(confirmedRows.map((row) => row.transaction_id as string))
  const pinnedActivityIds = new Set(confirmedRows.map((row) => row.activity_id as string))
  const { pairs, overflowedAmounts } = matchInvestmentCash(transactions, activities, {
    rejectedPairKeys, confirmedPairKeys, pinnedTransactionIds, pinnedActivityIds,
  })
  const payload = pairs.map((pair) => ({
    transaction_id: pair.transaction.id,
    activity_id: pair.activity.id,
    state: pair.state,
    score: pair.score,
    reasons: pair.reasons,
    ambiguous: pair.ambiguous,
  }))

  const { data, error } = await admin.rpc('replace_investment_cash_links', {
    p_tenant_id: tenantId,
    p_from: paddedFrom,
    p_to: paddedTo,
    p_links: payload,
    p_matcher_version: INVESTMENT_CASH_MATCHER_VERSION,
  })
  if (error) throw error
  const result = data as { created?: number; removed?: number } | null
  return {
    created: Number(result?.created ?? 0),
    removed: Number(result?.removed ?? 0),
    auto: pairs.filter((pair) => pair.state === 'auto').length,
    suggested: pairs.filter((pair) => pair.state === 'suggested').length,
    confirmed: pairs.filter((pair) => pair.state === 'confirmed').length,
    overflowedAmounts,
  }
}
