import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '../lib/supabaseClient'
import { useData } from '../contexts/DataContext'
import { fmtCents } from '../data'
import { canonicalDecimal, decimalEquals, subtractDecimals } from '../lib/investments/decimal'
import { isVanguardPersonalInvestorCsv, parseVanguardInvestmentRows } from '../lib/investments/vanguard'
import type { InvestmentImport } from '../lib/investments/types'
import { Button } from './Controls'
import DropZone from './ingest/DropZone'

type Step = 'upload' | 'review' | 'reconcile' | 'processing' | 'success'

type Props = {
  accountId: string
  accountName: string
  onImportStateChange?: (active: boolean) => void
  onReviewTransfers?: () => void
}

export default function InvestmentCSVUploader({ accountId, accountName, onImportStateChange, onReviewTransfers }: Props) {
  const { refreshData } = useData()
  const [step, setStep] = useState<Step>('upload')
  const [staged, setStaged] = useState<InvestmentImport | null>(null)
  const [confirmedUnits, setConfirmedUnits] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{
    inserted: number
    skipped: number
    units: string
    valuation: { status: 'preserved' | 'revalued' | 'awaiting_price'; value_cents: number; price_date: string | null }
    cashLinks: { auto: number; suggested: number }
  } | null>(null)

  useEffect(() => {
    const active = step !== 'upload' && step !== 'success'
    onImportStateChange?.(active)
  }, [step, onImportStateChange])

  useEffect(() => () => onImportStateChange?.(false), [onImportStateChange])

  const reset = () => {
    setStep('upload'); setStaged(null); setConfirmedUnits(''); setError(''); setResult(null)
  }

  const handleFile = (file: File) => {
    setError('')
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        try {
          if (!isVanguardPersonalInvestorCsv(parsed.meta.fields ?? [])) {
            throw new Error('This investment format is not supported yet. Export investment transactions from Vanguard Personal Investor and try again.')
          }
          const next = parseVanguardInvestmentRows(parsed.data)
          setStaged(next)
          setConfirmedUnits(next.summary.calculatedUnits)
          setStep('review')
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : 'Could not read this investment export.')
        }
      },
      error: (parseError) => setError(`Could not parse the CSV: ${parseError.message}`),
    })
  }

  const commit = async () => {
    if (!staged) return
    const canonicalConfirmed = canonicalDecimal(confirmedUnits)
    if (canonicalConfirmed === null) {
      setError('Enter a valid unit balance with no more than 10 decimal places.')
      return
    }
    const importable = staged.activities.filter((activity) => activity.include && activity.tradeDate && activity.activityType && activity.quantity && activity.valueCents !== null && activity.brokerageCents !== null)
    setStep('processing'); setError('')
    const batchId = crypto.randomUUID()
    const rows = importable.map((activity) => ({
      trade_date: activity.tradeDate!,
      activity_type: activity.activityType!,
      quantity: activity.quantity!,
      unit_price: activity.unitPrice,
      value_cents: activity.valueCents!,
      brokerage_cents: activity.brokerageCents!,
      source_label: activity.sourceLabel,
    }))
    if (!decimalEquals(canonicalConfirmed, staged.summary.calculatedUnits)) {
      rows.push({
        trade_date: staged.summary.lastDate ?? new Date().toISOString().slice(0, 10),
        activity_type: 'unit_adjustment',
        quantity: subtractDecimals(canonicalConfirmed, staged.summary.calculatedUnits),
        unit_price: null,
        value_cents: 0,
        brokerage_cents: 0,
        source_label: 'Unit reconciliation adjustment',
      })
    }
    try {
      const { data, error: fnError } = await supabase.functions.invoke('import-investment-activities', {
        body: {
          account_id: accountId,
          platform: staged.platform,
          account_suffix: staged.accountSuffix,
          instrument_identifier_type: staged.instrument.identifierType,
          instrument_identifier: staged.instrument.identifier,
          source_adapter: staged.adapter,
          source_version: staged.adapterVersion,
          upload_batch_id: batchId,
          confirmed_units: canonicalConfirmed,
          rows,
        },
      })
      if (fnError) throw fnError
      setResult({
        inserted: data.inserted,
        skipped: data.skipped,
        units: data.summary.calculated_units,
        valuation: data.valuation,
        cashLinks: { auto: data.cash_links?.auto ?? 0, suggested: data.cash_links?.suggested ?? 0 },
      })
      await refreshData()
      setStep('success')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Investment import failed.')
      setStep('reconcile')
    }
  }

  const blocked = staged?.activities.filter((activity) => !activity.include).length ?? 0
  const importable = staged?.activities.filter((activity) => activity.include).length ?? 0

  return (
    <div className="grid gap-4">
      {error && <div role="alert" className="rounded-[10px] border border-[var(--color-neg)] bg-[var(--color-neg)]/5 px-3 py-2 text-[13px] text-[var(--color-neg)]">{error}</div>}
      <AnimatePresence mode="wait">
        {step === 'upload' && <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-3">
          <DropZone onFile={handleFile} />
          <p className="text-[13px] text-ink2">Supported now: Vanguard Personal Investor managed-fund transaction exports. Your full account number stays in the browser and is not stored.</p>
        </motion.div>}

        {step === 'review' && staged && <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-4">
          <div className="rounded-[12px] border border-[var(--hair)] bg-black/[0.02] p-4">
            <p className="text-[14px] font-semibold">Vanguard Personal Investor detected</p>
            <p className="mt-1 text-[13px] text-muted">{staged.instrument.name} · {staged.instrument.identifier} · account ending {staged.accountSuffix}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Activities" value={String(staged.summary.activityCount)} />
            <Metric label="Purchases" value={fmtCents(staged.summary.externalContributionsCents)} />
            <Metric label="DRP" value={fmtCents(staged.summary.reinvestedDistributionsCents)} />
            <Metric label="Derived units" value={staged.summary.calculatedUnits} />
          </div>
          <div className="overflow-x-auto rounded-[10px] border border-[var(--hair)]">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <caption className="sr-only">Managed-investment activities staged for import</caption>
              <thead className="bg-black/[0.025] text-muted"><tr><th className="p-3">Date</th><th>Activity</th><th>Units</th><th>Unit price</th><th>Value</th><th>Status</th></tr></thead>
              <tbody>{staged.activities.map((activity) => <tr key={activity.id} className="border-t border-[var(--hair-soft)]">
                <td className="p-3">{activity.tradeDate ?? 'Invalid'}</td><td>{activity.activityType?.replace(/_/g, ' ') ?? activity.sourceLabel}</td>
                <td className="font-mono">{activity.quantity ?? '—'}</td><td className="font-mono">{activity.unitPrice ? `$${activity.unitPrice}` : '—'}</td>
                <td className="font-mono">{activity.valueCents === null ? '—' : fmtCents(activity.valueCents)}</td>
                <td className={activity.include ? 'text-pos' : 'text-neg'}>{activity.include ? 'Ready' : activity.issues.join(', ')}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {blocked > 0 && <p role="alert" className="text-[13px] font-medium text-neg">{blocked} blocked row{blocked === 1 ? '' : 's'} must be corrected in the source export before import.</p>}
          <div className="flex gap-2"><Button onClick={() => setStep('reconcile')} disabled={importable === 0 || blocked > 0}>Continue with {importable} activities</Button><Button variant="ghost" onClick={reset}>Cancel</Button></div>
        </motion.div>}

        {step === 'reconcile' && staged && <motion.div key="reconcile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-4">
          <div><p className="text-[14px] font-semibold">Confirm the unit balance</p><p className="mt-1 text-[13px] text-ink2">Halcyon calculated {staged.summary.calculatedUnits} units from the complete export. Compare this once with the units Vanguard currently shows.</p></div>
          <label className="grid max-w-[340px] gap-1.5"><span className="micro text-muted">Current units in {accountName}</span><input value={confirmedUnits} onChange={(event) => setConfirmedUnits(event.target.value)} inputMode="decimal" className="min-h-[46px] rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 font-mono text-[14px] outline-none focus:border-accent" /></label>
          {canonicalDecimal(confirmedUnits) && !decimalEquals(canonicalDecimal(confirmedUnits)!, staged.summary.calculatedUnits) && <div className="rounded-[10px] border border-[var(--color-warn)] bg-[var(--color-warn)]/5 px-3 py-2 text-[12.5px]">The confirmed balance differs from the activity by <strong>{subtractDecimals(canonicalDecimal(confirmedUnits)!, staged.summary.calculatedUnits)} units</strong>. Halcyon will record a visible unit reconciliation adjustment rather than rewriting a transaction.</div>}
          <div className="flex gap-2"><Button onClick={commit}>Confirm and import</Button><Button variant="ghost" onClick={() => setStep('review')}>Back</Button></div>
        </motion.div>}

        {step === 'processing' && <motion.p role="status" aria-live="polite" key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-8 text-center text-[13px] text-ink2">Importing and reconciling the holding…</motion.p>}
        {step === 'success' && result && <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-3">
          <p className="text-[15px] font-semibold">{result.inserted === 0 ? 'No new investment activity' : 'Investment activity imported'}</p>
          <ul className="grid gap-1 text-[13px] text-muted"><li><strong className="text-ink">{result.inserted}</strong> activities imported</li>{result.skipped > 0 && <li><strong className="text-ink">{result.skipped}</strong> duplicates skipped</li>}<li><strong className="text-ink">{result.units}</strong> units held</li></ul>
          {result.valuation.status === 'preserved' && <p className="text-[12.5px] text-muted">No monetary data changed. Your existing valuation of <strong className="text-ink">{fmtCents(result.valuation.value_cents)}</strong>{result.valuation.price_date ? ` as at ${result.valuation.price_date.slice(0, 10)}` : ''} was preserved.</p>}
          {result.valuation.status === 'revalued' && <p className="text-[12.5px] text-muted">The account was revalued from the verified NAV already on file{result.valuation.price_date ? `, dated ${result.valuation.price_date.slice(0, 10)}` : ''}. No live provider request was required.</p>}
          {result.valuation.status === 'awaiting_price' && <p className="text-[12.5px] text-muted">The activity is recorded, but a verified price is not yet available for all of it. Your last valid value is retained until the next NAV refresh.</p>}
          {(result.cashLinks.auto > 0 || result.cashLinks.suggested > 0) && <p className="text-[12.5px] text-muted">
            <strong className="text-ink">{result.cashLinks.auto}</strong> bank movement{result.cashLinks.auto === 1 ? '' : 's'} linked automatically
            {result.cashLinks.suggested > 0 ? <> · <strong className="text-ink">{result.cashLinks.suggested}</strong> need review in Transfer review</> : null}.
          </p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={reset}>Import another export</Button>
            {onReviewTransfers && <Button variant="ghost" onClick={onReviewTransfers}>Review transfers</Button>}
          </div>
        </motion.div>}
      </AnimatePresence>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[10px] border border-[var(--hair)] p-3"><p className="micro text-muted">{label}</p><p className="mt-1 text-[15px] font-semibold tabular-nums">{value}</p></div>
}
