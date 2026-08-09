import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fmtCents, glowColor } from '../data'
import Tile from './Tile'
import { useData } from '../contexts/DataContext'
import Area from './charts/Area'
import InvestmentTaxAwareness from './InvestmentTaxAwareness'

interface Summary {
  holding_id: string
  instrument_name: string
  identifier: string
  calculated_units: string
  confirmed_units: string | null
  reconciliation_status: string
  net_external_contributions_cents: number
  reinvested_distributions_cents: number
  activity_count: number
  value_cents: number | null
  nav_price: string | null
  price_date: string | null
  valuation_status: 'current' | 'stale' | 'partial' | null
  market_movement_cents: number | null
  cash_distributions_cents: number
}

interface Activity {
  id: string
  trade_date: string
  activity_type: string
  quantity_delta: string
  unit_price: string | null
  value_cents: number
  brokerage_cents: number
  source_label: string
}

interface CashLink {
  state: 'auto' | 'suggested' | 'confirmed'
  activity_id: string
  transaction: { account_id: string; date: string; amount: number } | null
}

interface Monthly {
  valuation_date: string
  value_cents: number
  cumulative_contributions_cents: number
}

export default function InvestmentAccountActivity({ accountId }: { accountId: string }) {
  const { accounts, refreshData } = useData()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [monthly, setMonthly] = useState<Monthly[]>([])
  const [cashLinks, setCashLinks] = useState<CashLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    Promise.all([
      supabase.from('investment_account_overview').select('*').eq('account_id', accountId).maybeSingle(),
      supabase.from('investment_activities').select('id, trade_date, activity_type, quantity_delta, unit_price, value_cents, brokerage_cents, source_label').eq('account_id', accountId).order('trade_date', { ascending: false }),
      supabase.from('investment_account_monthly').select('valuation_date, value_cents, cumulative_contributions_cents').eq('account_id', accountId).order('valuation_date', { ascending: false }).limit(12),
      supabase.from('investment_cash_links').select('state, activity_id, activity:investment_activities!inner(account_id), transaction:transactions!investment_cash_links_transaction_id_fkey(account_id, date, amount)').eq('activity.account_id', accountId),
    ]).then(([summaryResult, activityResult, monthlyResult, cashLinkResult]) => {
      if (cancelled) return
      if (summaryResult.error || activityResult.error || monthlyResult.error || cashLinkResult.error) {
        setError('Investment activity could not be loaded.')
      } else {
        setSummary(summaryResult.data as Summary | null)
        setActivities((activityResult.data ?? []) as Activity[])
        setMonthly(((monthlyResult.data ?? []) as Monthly[]).reverse())
        setCashLinks((cashLinkResult.data ?? []) as unknown as CashLink[])
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [accountId, refreshKey])

  const refreshPrice = async () => {
    setRefreshing(true); setError('')
    try {
      const { error: fnError } = await supabase.functions.invoke('sync-investment-prices', {
        body: { account_id: accountId, trigger: 'manual' },
      })
      if (fnError) throw fnError
      await refreshData()
      setRefreshKey((value) => value + 1)
    } catch {
      setError('The latest verified Vanguard price could not be refreshed. Your last good valuation is unchanged.')
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) return <Tile title="Investment holding"><p className="py-5 text-[13px] text-muted">Loading investment activity…</p></Tile>
  if (error) return <Tile title="Investment holding"><p role="alert" className="py-5 text-[13px] text-neg">{error}</p></Tile>
  if (!summary) return <Tile title="Investment holding"><div className="py-6 text-center"><p className="text-[13px] text-muted">No investment activity has been imported yet.</p><p className="mt-1 text-[12px] text-muted">Open Ingestion and upload a supported investment transaction export.</p></div></Tile>

  const totalReturn = (summary.value_cents ?? 0) + Number(summary.cash_distributions_cents ?? 0) - Number(summary.net_external_contributions_cents)
  const returnPct = Number(summary.net_external_contributions_cents) === 0 ? 0 : totalReturn / Number(summary.net_external_contributions_cents) * 100
  const cashLinkByActivity = new Map(cashLinks.map((link) => [link.activity_id, link]))
  const accountName = (id?: string) => accounts.find((account) => account.id === id)?.name ?? 'Bank account'

  return <Tile title={summary.instrument_name} tag={`${summary.identifier} · ${summary.reconciliation_status}`}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[var(--hair)] bg-black/[0.02] px-3 py-2">
      <p className="text-[12.5px] text-muted">Daily managed-fund NAV is refreshed from Vanguard and retains its real publication date. {summary.price_date && (Date.now() - new Date(`${summary.price_date}T00:00:00Z`).getTime() > 4 * 86400_000) ? <strong className="text-warn">Price may be stale.</strong> : null}</p>
      <button type="button" onClick={refreshPrice} disabled={refreshing} className="micro rounded-lg border border-[var(--hair)] px-3 py-1.5 text-ink transition hover:bg-black/[0.04] disabled:opacity-50">{refreshing ? 'Refreshing…' : 'Refresh price'}</button>
    </div>
    <div className="grid grid-cols-2 gap-3 border-b border-[var(--hair-soft)] pb-5 sm:grid-cols-3 xl:grid-cols-6">
      <Metric label="Current value" value={summary.value_cents === null ? 'Awaiting price' : fmtCents(summary.value_cents)} />
      <Metric label="Units held" value={summary.calculated_units} />
      <Metric label="Net contributions" value={fmtCents(summary.net_external_contributions_cents)} />
      <Metric label="Reinvested distributions" value={fmtCents(summary.reinvested_distributions_cents)} />
      <Metric label="Investment return" value={`${totalReturn >= 0 ? '+' : '-'}${fmtCents(Math.abs(totalReturn))} · ${returnPct.toFixed(1)}%`} />
      <Metric label={summary.price_date ? `NAV · ${summary.price_date}` : 'NAV'} value={summary.nav_price ? `$${summary.nav_price}` : 'Not priced'} />
    </div>
    {monthly.length > 0 && <div className="mt-5 rounded-[10px] border border-[var(--hair-soft)] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><p className="text-[13px] font-semibold">Value vs contributions</p><p className="text-[11.5px] text-muted">Market movement is separated from money you added.</p></div><div className="flex gap-3 text-[11px] text-muted"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-accent" />Value</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-muted" />Contributions</span></div></div>
      <Area series={[{ data: monthly.map((point) => Number(point.value_cents)), color: glowColor.green }, { data: monthly.map((point) => Number(point.cumulative_contributions_cents)), color: glowColor.blue, fill: false }]} labels={monthly.map((point) => point.valuation_date.slice(0, 7))} height={220} ariaLabel="Investment value compared with cumulative contributions" />
    </div>}
    <InvestmentTaxAwareness accountId={accountId} />
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-[12.5px]">
        <thead className="text-muted"><tr><th className="pb-2">Trade date</th><th>Activity</th><th>Units</th><th>Unit price</th><th>Value</th><th>Brokerage</th><th>Cash movement</th></tr></thead>
        <tbody>{activities.map((activity) => { const cashLink = cashLinkByActivity.get(activity.id); return <tr key={activity.id} className="border-t border-[var(--hair-soft)]">
          <td className="py-3">{activity.trade_date}</td><td className="capitalize">{activity.activity_type.replaceAll('_', ' ')}</td>
          <td className="font-mono">{activity.quantity_delta}</td><td className="font-mono">{activity.unit_price ? `$${activity.unit_price}` : '—'}</td>
          <td className="font-mono">{fmtCents(activity.value_cents)}</td><td className="font-mono">{fmtCents(activity.brokerage_cents)}</td>
          <td>{cashLink ? <span className="text-[11.5px] text-muted">{activity.activity_type === 'redemption' ? 'To' : 'From'} {accountName(cashLink.transaction?.account_id)} · <span className="capitalize">{cashLink.state}</span></span> : '—'}</td>
        </tr> })}</tbody>
      </table>
    </div>
  </Tile>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="micro text-muted">{label}</p><p className="mt-1 text-[15px] font-semibold tabular-nums">{value}</p></div>
}
