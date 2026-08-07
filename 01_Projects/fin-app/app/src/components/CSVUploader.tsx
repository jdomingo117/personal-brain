import { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Papa from 'papaparse'
import { supabase } from '../lib/supabaseClient'
import { useData } from '../contexts/DataContext'
import { Button } from './Controls'
import UploadHistory from './UploadHistory'
import DropZone from './ingest/DropZone'
import MappingEditor from './ingest/MappingEditor'
import StagingTable from './ingest/StagingTable'
import {
  stageRows, applyAssignments, toTransactionPayload, buildAnchor,
  type ColumnMapping, type StagedRow,
} from '../lib/csv/pipeline'
import { runDetectRecurrenceHints } from '../lib/detectRecurrenceHints'

/**
 * The single ingestion engine.
 *
 * Five steps: drop → map → stage → reconcile → commit. The staging step is
 * the centre of gravity: everything that will be written is visible and
 * editable there, because after commit there is no bulk re-categorisation UI
 * to fall back on.
 */

type Props = { accountId: string; accountName: string; accountType: string; isConnected?: boolean }
type Step = 'upload' | 'mapping' | 'staging' | 'balance' | 'processing' | 'success'

interface Summary {
  inserted: number
  skipped: number
  needsReview: number
  blocked: number
  transfersLinked?: number
  transfersSuggested?: number
}

const money = (c: number) =>
  `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`

export default function CSVUploader({ accountId, accountName, accountType, isConnected }: Props) {
  const { refreshData } = useData()
  const [step, setStep] = useState<Step>('upload')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([])
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [profileExisted, setProfileExisted] = useState(false)
  const [remember, setRemember] = useState(true)

  const [staged, setStaged] = useState<StagedRow[]>([])
  const [stageStats, setStageStats] = useState<Awaited<ReturnType<typeof stageRows>> | null>(null)
  const [categorizing, setCategorizing] = useState(false)
  const [catStats, setCatStats] = useState<{ fromCache: number; fromAi: number; geminiCalls: number } | null>(null)

  const [currentBalance, setCurrentBalance] = useState('')
  const [anchorPreview, setAnchorPreview] = useState<{ offsetCents: number; date: string } | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)

  const reset = () => {
    setStep('upload'); setError(''); setHeaders([]); setRawRows([])
    setMapping(null); setStaged([]); setStageStats(null); setCatStats(null)
    setCurrentBalance(''); setAnchorPreview(null); setSummary(null)
    setProfileExisted(false)
  }

  // ── Step 1: parse locally ──────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    setError('')
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const cols = results.meta.fields ?? []
        if (cols.length === 0) { setError('Could not detect any columns in that CSV.'); return }
        const rows = results.data.filter((r) => Object.keys(r).length > 0)
        if (rows.length === 0) { setError('That CSV has headers but no rows.'); return }

        setHeaders(cols)
        setRawRows(rows)
        setStep('mapping')
        setBusy(true)
        setStatus('Checking for a saved layout…')

        try {
          // Zero-AI path: a saved profile for this exact header layout.
          const fingerprint = cols.join('|')
          const { data: profile } = await supabase
            .from('static_profiles').select('mappings').eq('name', fingerprint).maybeSingle()

          if (profile?.mappings) {
            setMapping(profile.mappings as ColumnMapping)
            setProfileExisted(true)
            setRemember(false)
          } else {
            setStatus('Detecting columns with AI…')
            const { data, error: fnErr } = await supabase.functions.invoke('analyze-csv', {
              body: { header: cols, sampleRows: rows.slice(0, 5) },
            })
            if (fnErr) throw fnErr
            setMapping(data as ColumnMapping)
          }
        } catch {
          // A failed detection is recoverable: fall back to a blank mapping the
          // user can fill in, rather than dead-ending the import.
          setMapping({ dateCol: cols[0], descCol: cols[1] ?? cols[0] })
          setError('Could not detect the layout automatically — please map the columns below.')
        } finally {
          setBusy(false); setStatus('')
        }
      },
      error: (err) => setError(`Could not parse that CSV: ${err.message}`),
    })
  }, [])

  // ── Step 2 → 3: stage and categorise ───────────────────────────────────
  const goToStaging = async () => {
    if (!mapping) return
    setBusy(true)
    setError('')
    try {
      const result = await stageRows(rawRows, mapping, accountId)
      setStaged(result.rows)
      setStageStats(result)
      setStep('staging')

      if (remember && !profileExisted) {
        // Fire and forget: a failed profile save must not block the import.
        void supabase.functions.invoke('upsert-profile', {
          body: { name: headers.join('|'), mappings: mapping },
        }).catch(() => {})
      }

      if (result.pendingMerchants.length > 0) {
        setCategorizing(true)
        setStatus(`Categorising ${result.pendingMerchants.length} merchants…`)
        try {
          const { data, error: fnErr } = await supabase.functions.invoke('categorize-merchants', {
            body: { merchants: result.pendingMerchants },
          })
          if (fnErr) throw fnErr
          setStaged((rows) => applyAssignments(rows, data.assignments))
          setCatStats(data.stats)
        } catch {
          setError('Categorisation is unavailable — rows are staged as Uncategorized. You can set categories below and import anyway.')
        } finally {
          setCategorizing(false); setStatus('')
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not stage this file.')
    } finally {
      setBusy(false)
    }
  }

  // ── Step 4: reconcile ──────────────────────────────────────────────────
  // Skipped entirely for a connected account: Up owns the balance from its
  // cutover date forward, so there is nothing to reconcile — this import is
  // pre-cutover history only, and an anchor row here would fight the one
  // map-provider-accounts already wrote.
  const goToBalance = () => {
    if (isConnected) { void commit(); return }
    setStep('balance')
    setAnchorPreview(null)
  }

  const previewAnchor = (value: string) => {
    setCurrentBalance(value)
    const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''))
    if (Number.isNaN(parsed)) { setAnchorPreview(null); return }
    const isLiability = accountType === 'Credit Card' || accountType === 'Loan' || accountType === 'Debt'
    const target = Math.round((isLiability ? -Math.abs(parsed) : parsed) * 100)
    const anchor = buildAnchor(staged, accountId, target, 'preview')
    setAnchorPreview(anchor ? { offsetCents: anchor.offsetCents, date: anchor.row.date } : null)
  }

  // ── Step 5: commit ─────────────────────────────────────────────────────
  const commit = async () => {
    setStep('processing')
    setBusy(true)
    setError('')
    try {
      const batchId = crypto.randomUUID()
      const payload = toTransactionPayload(staged, accountId, batchId)

      // A connected account's balance is provider-authoritative — no anchor,
      // no balance restatement. This import is pre-cutover history only.
      const anchor = isConnected
        ? null
        : buildAnchor(
            staged, accountId,
            (() => {
              const parsed = parseFloat(currentBalance.replace(/[^0-9.-]/g, ''))
              const isLiability = accountType === 'Credit Card' || accountType === 'Loan' || accountType === 'Debt'
              return Math.round((isLiability ? -Math.abs(parsed) : parsed) * 100)
            })(),
            batchId,
          )
      const all = anchor ? [...payload, anchor.row] : payload

      const { data, error: fnErr } = await supabase.functions.invoke('upsert-transactions', { body: all })
      if (fnErr) throw fnErr

      // Only move the balance if something actually landed. Setting it after a
      // fully-skipped re-import would be asserting a figure we did not verify.
      if (!isConnected && data.inserted > 0) {
        const parsed = parseFloat(currentBalance.replace(/[^0-9.-]/g, ''))
        const isLiability = accountType === 'Credit Card' || accountType === 'Loan' || accountType === 'Debt'
        const target = Math.round((isLiability ? -Math.abs(parsed) : parsed) * 100)
        const { error: acctErr } = await supabase.functions.invoke('upsert-account', {
          body: {
            id: accountId, name: accountName, type: accountType,
            balance: target, currency: 'AUD',
          },
        })
        if (acctErr) throw acctErr
      }

      // Rescan for internal transfers over exactly the dates this batch
      // touched — link-transfers pads the window itself, so a counterpart
      // leg imported in an earlier, unrelated batch is still found.
      let transfersLinked: number | undefined
      let transfersSuggested: number | undefined
      if (data.inserted > 0 && all.length > 0) {
        const dates = all.map((r) => r.date).sort()
        try {
          const { data: linkData } = await supabase.functions.invoke('link-transfers', {
            body: { scope: 'window', from: dates[0], to: dates[dates.length - 1] },
          })
          transfersLinked = linkData?.auto
          transfersSuggested = linkData?.suggested
        } catch {
          // A failed rescan does not block the import — transfers are
          // eligible for the next rescan (manual or the next import).
        }
      }

      // Fire-and-forget, same posture as the connect/extend-history call
      // sites: rows are committed now (unlike categorize-merchants above,
      // which ran during staging, before an id existed), so this is the
      // right point to look for merchants too thin for the deterministic
      // detector yet.
      if (data.inserted > 0) {
        runDetectRecurrenceHints().catch((err) => console.warn('recurrence hint detection failed', err))
      }

      setSummary({
        inserted: data.inserted,
        skipped: data.skipped,
        needsReview: data.needsReview,
        blocked: staged.filter((r) => r.issues.length > 0).length,
        transfersLinked,
        transfersSuggested,
      })
      await refreshData()
      setStep('success')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
      setStep(isConnected ? 'staging' : 'balance')
    } finally {
      setBusy(false)
    }
  }

  const importable = staged.filter((r) => r.include).length

  return (
    <div className="grid gap-4">
      {error && (
        <div className="rounded-[10px] border border-[var(--color-neg)] bg-[var(--color-neg)]/5 px-3 py-2 text-[12.5px] text-[var(--color-neg)]">
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        {step === 'upload' && (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-4">
            <DropZone onFile={handleFile} />
            <UploadHistory accountId={accountId} />
          </motion.div>
        )}

        {step === 'mapping' && (
          <motion.div key="mapping" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-4">
            {busy && <p className="text-[13px] text-muted">{status}</p>}
            {mapping && (
              <>
                <MappingEditor
                  headers={headers} mapping={mapping} onChange={setMapping}
                  dateFormatConfident={stageStats?.dateFormatConfident ?? true}
                  rememberProfile={remember} onRememberChange={setRemember}
                  profileExisted={profileExisted}
                />
                <div className="flex gap-2">
                  <Button onClick={goToStaging} disabled={busy || !mapping.dateCol || !mapping.descCol}>
                    Stage {rawRows.length} rows
                  </Button>
                  <Button variant="ghost" onClick={reset}>Cancel</Button>
                </div>
              </>
            )}
          </motion.div>
        )}

        {step === 'staging' && stageStats && (
          <motion.div key="staging" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
              <span><strong className="text-ink">{importable}</strong> ready</span>
              {stageStats.stats.badDate > 0 && <span>{stageStats.stats.badDate} bad dates</span>}
              {stageStats.stats.noAmount > 0 && <span>{stageStats.stats.noAmount} without amounts</span>}
              {stageStats.stats.fromBankCategory > 0 && (
                <span>{stageStats.stats.fromBankCategory} categorised by your bank</span>
              )}
              {catStats && (
                <span>
                  {catStats.fromCache} from your rules
                  {catStats.fromAi > 0 && `, ${catStats.fromAi} via AI`}
                </span>
              )}
              {categorizing && <span className="text-accent">{status}</span>}
            </div>

            {stageStats.unmappedBankCategories.length > 0 && (
              <p className="text-[12px] text-muted">
                Your bank used categories Halcyon has no direct equivalent for
                ({stageStats.unmappedBankCategories.join(', ')}); those rows were sent to the AI instead.
              </p>
            )}

            {isConnected && (
              <div className="rounded-[10px] border border-[var(--hair)] bg-black/[0.02] px-3 py-2 text-[12.5px] text-muted">
                {accountName}'s balance comes from your bank connection — this import adds history only, with no balance step.
              </div>
            )}

            <StagingTable rows={staged} onChange={setStaged} categorizing={categorizing} />

            <div className="flex gap-2">
              <Button onClick={goToBalance} disabled={busy || categorizing || importable === 0}>
                {isConnected ? `Import ${importable} rows` : `Continue (${importable} rows)`}
              </Button>
              <Button variant="ghost" onClick={() => setStep('mapping')}>Back to mapping</Button>
              <Button variant="ghost" onClick={reset}>Cancel</Button>
            </div>
          </motion.div>
        )}

        {step === 'balance' && (
          <motion.div key="balance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-4">
            <div className="grid gap-2">
              <label className="grid gap-1.5">
                <span className="micro text-muted">
                  Current balance of {accountName}
                </span>
                <input
                  type="text" inputMode="decimal" value={currentBalance}
                  onChange={(e) => previewAnchor(e.target.value)}
                  placeholder="e.g. 2450.31"
                  className="min-h-[46px] rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 text-[14px] outline-none focus:border-accent"
                />
              </label>
              <p className="text-[12px] text-muted">
                Your statement shows changes, not the starting point. Telling us today's
                balance lets the ledger be reconciled against it.
              </p>
            </div>

            {/* The anchor was previously injected invisibly. Showing it is what
                lets a user notice when the numbers do not add up. */}
            {anchorPreview && (
              <div className="rounded-[10px] border border-[var(--hair)] bg-black/[0.02] px-3 py-2 text-[12.5px]">
                A reconciliation entry of <strong>{money(anchorPreview.offsetCents)}</strong> dated{' '}
                <strong>{anchorPreview.date}</strong> will be added to make the ledger match
                that balance. It is categorised as a Transfer and excluded from spending.
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={commit} disabled={busy || currentBalance.trim() === ''}>
                Import {importable} rows
              </Button>
              <Button variant="ghost" onClick={() => setStep('staging')}>Back</Button>
            </div>
          </motion.div>
        )}

        {step === 'processing' && (
          <motion.p key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-6 text-center text-[13px] text-muted">
            Importing…
          </motion.p>
        )}

        {step === 'success' && summary && (
          <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-3">
            <p className="text-[14px] font-medium">Import complete</p>
            {/* Reporting skipped/blocked counts is what makes a silent
                double-import impossible to miss. */}
            <ul className="grid gap-1 text-[13px] text-muted">
              <li><strong className="text-ink">{summary.inserted}</strong> imported</li>
              {summary.skipped > 0 && (
                <li><strong className="text-ink">{summary.skipped}</strong> already in your ledger — skipped as duplicates</li>
              )}
              {summary.needsReview > 0 && (
                <li><strong className="text-ink">{summary.needsReview}</strong> need a category</li>
              )}
              {summary.blocked > 0 && (
                <li><strong className="text-ink">{summary.blocked}</strong> skipped — unusable date or amount</li>
              )}
              {(summary.transfersLinked ?? 0) > 0 && (
                <li><strong className="text-ink">{summary.transfersLinked}</strong> internal transfer{summary.transfersLinked === 1 ? '' : 's'} linked automatically</li>
              )}
              {(summary.transfersSuggested ?? 0) > 0 && (
                <li><strong className="text-ink">{summary.transfersSuggested}</strong> possible transfer{summary.transfersSuggested === 1 ? '' : 's'} need your review — see the transfer linker below</li>
              )}
            </ul>
            <div><Button onClick={reset}>Import another file</Button></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
