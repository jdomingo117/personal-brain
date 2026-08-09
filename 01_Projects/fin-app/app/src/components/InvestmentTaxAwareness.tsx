import { useEffect, useState } from 'react'
import { fmtCents } from '../data'
import { supabase } from '../lib/supabaseClient'

type AmmaStatus = 'awaiting' | 'received' | 'reviewed' | 'not_required'

interface YearSummary {
  financial_year: number
  first_activity_date: string
  last_activity_date: string
  activity_count: number
  disposal_count: number
  purchases_cents: number
  redemptions_cents: number
  reinvested_distributions_cents: number
  cash_distributions_cents: number
  fees_cents: number
  brokerage_cents: number
}

interface TaxRecord {
  financial_year: number
  amma_status: AmmaStatus
}

const statusLabels: Record<AmmaStatus, string> = {
  awaiting: 'Awaiting statement',
  received: 'Statement received',
  reviewed: 'Reviewed',
  not_required: 'Not required',
}

const yearLabel = (endingYear: number) => `FY ${endingYear - 1}–${String(endingYear).slice(-2)}`

function csvCell(value: string | number) {
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export default function InvestmentTaxAwareness({ accountId }: { accountId: string }) {
  const [summaries, setSummaries] = useState<YearSummary[]>([])
  const [records, setRecords] = useState<Record<number, AmmaStatus>>({})
  const [loading, setLoading] = useState(true)
  const [savingYear, setSavingYear] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    Promise.all([
      supabase.from('investment_financial_year_summary').select('*').eq('account_id', accountId).order('financial_year', { ascending: false }),
      supabase.from('investment_tax_records').select('financial_year, amma_status').eq('account_id', accountId),
    ]).then(([summaryResult, recordResult]) => {
      if (cancelled) return
      if (summaryResult.error || recordResult.error) {
        setError('Financial-year records could not be loaded.')
      } else {
        setSummaries((summaryResult.data ?? []) as YearSummary[])
        setRecords(Object.fromEntries(((recordResult.data ?? []) as TaxRecord[]).map((record) => [record.financial_year, record.amma_status])))
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [accountId])

  const updateStatus = async (financialYear: number, ammaStatus: AmmaStatus) => {
    setSavingYear(financialYear); setError('')
    const { error: functionError } = await supabase.functions.invoke('update-investment-tax-record', {
      body: { account_id: accountId, financial_year: financialYear, amma_status: ammaStatus },
    })
    if (functionError) setError('The statement status could not be saved. Your previous status is unchanged.')
    else setRecords((current) => ({ ...current, [financialYear]: ammaStatus }))
    setSavingYear(null)
  }

  const downloadSummary = () => {
    const headers = ['financial_year', 'activity_count', 'disposal_count', 'purchases_aud', 'redemptions_aud', 'reinvested_distributions_aud', 'cash_distributions_aud', 'fees_aud', 'brokerage_aud', 'amma_status']
    const rows = summaries.map((summary) => [
      yearLabel(summary.financial_year), summary.activity_count, summary.disposal_count,
      (summary.purchases_cents / 100).toFixed(2), (summary.redemptions_cents / 100).toFixed(2),
      (summary.reinvested_distributions_cents / 100).toFixed(2), (summary.cash_distributions_cents / 100).toFixed(2),
      (summary.fees_cents / 100).toFixed(2), (summary.brokerage_cents / 100).toFixed(2),
      statusLabels[records[summary.financial_year] ?? 'awaiting'],
    ])
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `investment-record-summary-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return <section className="mt-5 rounded-[10px] border border-[var(--hair-soft)] p-3" aria-labelledby="investment-tax-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 id="investment-tax-heading" className="text-[13px] font-semibold">Tax-time records</h3>
        <p className="mt-1 max-w-3xl text-[11.5px] leading-relaxed text-muted">These totals organise your records; they are not a tax return or CGT calculation. Managed-fund tax components and cost-base adjustments can differ from cash or reinvested distributions, so use the final AMMA statement and professional advice where appropriate.</p>
      </div>
      <button type="button" onClick={downloadSummary} disabled={loading || summaries.length === 0} className="micro rounded-lg border border-[var(--hair)] px-3 py-1.5 text-ink transition hover:bg-black/[0.04] disabled:opacity-50">Download summary</button>
    </div>
    {error && <p role="alert" className="mt-3 text-[12px] text-neg">{error}</p>}
    {loading ? <p className="py-4 text-[12px] text-muted">Loading financial-year records…</p> : summaries.length === 0 ? <p className="py-4 text-[12px] text-muted">No activity is available to summarise.</p> : <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-[12px]">
        <thead className="text-muted"><tr><th className="pb-2">Financial year</th><th>Purchases</th><th>Distributions</th><th>Disposals</th><th>Fees + brokerage</th><th>AMMA statement</th></tr></thead>
        <tbody>{summaries.map((summary) => {
          const status = records[summary.financial_year] ?? 'awaiting'
          return <tr key={summary.financial_year} className="border-t border-[var(--hair-soft)]">
            <td className="py-3 font-semibold">{yearLabel(summary.financial_year)}</td>
            <td className="font-mono">{fmtCents(summary.purchases_cents)}</td>
            <td className="font-mono">{fmtCents(summary.reinvested_distributions_cents + summary.cash_distributions_cents)}</td>
            <td><span className={summary.disposal_count > 0 ? 'text-warn' : 'text-muted'}>{summary.disposal_count > 0 ? `${summary.disposal_count} to review` : 'None recorded'}</span></td>
            <td className="font-mono">{fmtCents(summary.fees_cents + summary.brokerage_cents)}</td>
            <td><label className="sr-only" htmlFor={`amma-${summary.financial_year}`}>AMMA statement status for {yearLabel(summary.financial_year)}</label><select id={`amma-${summary.financial_year}`} value={status} disabled={savingYear === summary.financial_year} onChange={(event) => void updateStatus(summary.financial_year, event.target.value as AmmaStatus)} className="rounded-lg border border-[var(--hair)] bg-transparent px-2 py-1.5 text-[12px] disabled:opacity-50">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
          </tr>
        })}</tbody>
      </table>
    </div>}
  </section>
}
