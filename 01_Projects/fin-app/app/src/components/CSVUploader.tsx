import { useCallback, useEffect, useState } from 'react'
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
  stageRows, applyAssignments, toTransactionPayload,
  type ColumnMapping, type StagedRow,
} from '../lib/csv/pipeline'
import { runDetectRecurrenceHints } from '../lib/detectRecurrenceHints'
import { profileDisplayName, profileFingerprint } from '../lib/csv/profileFingerprint'

/**
 * The single ingestion engine.
 *
 * Five steps: drop → map → stage → reconcile → commit. The staging step is
 * the centre of gravity: everything that will be written is visible and
 * editable there, because after commit there is no bulk re-categorisation UI
 * to fall back on.
 */

type Props = {
  accountId: string
  accountName: string
  accountType: string
  isConnected?: boolean
  cutoverDate?: string
  onImportStateChange?: (active: boolean) => void
  onReviewTransfers?: () => void
}
type Step = 'upload' | 'mapping' | 'staging' | 'balance' | 'processing' | 'success'

interface Summary {
  inserted: number
  skipped: number
  needsReview: number
  blocked: number
  transfersLinked?: number
  transfersSuggested?: number
  reconciliationAmount?: number | null
  reconciliationDate?: string | null
}

const money = (c: number) =>
  `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`

export default function CSVUploader({
  accountId,
  accountName,
  accountType,
  isConnected,
  cutoverDate,
  onImportStateChange,
  onReviewTransfers,
}: Props) {
  const { refreshData } = useData()
  const [step, setStep] = useState<Step>('upload')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([])
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [profileExisted, setProfileExisted] = useState(false)
  const [profileLabel, setProfileLabel] = useState('')
  const [sourceFileName, setSourceFileName] = useState('')
  const [profileSaveWarning, setProfileSaveWarning] = useState('')
  const [remember, setRemember] = useState(true)

  const [staged, setStaged] = useState<StagedRow[]>([])
  const [stageStats, setStageStats] = useState<Awaited<ReturnType<typeof stageRows>> | null>(null)
  const [categorizing, setCategorizing] = useState(false)
  const [catStats, setCatStats] = useState<{ fromCache: number; fromBank: number; fromAi: number; geminiCalls: number } | null>(null)

  const [currentBalance, setCurrentBalance] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)

  useEffect(() => {
    const active = step !== 'upload' && step !== 'success'
    onImportStateChange?.(active)
  }, [step, onImportStateChange])

  useEffect(() => () => onImportStateChange?.(false), [onImportStateChange])

  const reset = () => {
    setStep('upload'); setError(''); setHeaders([]); setRawRows([])
    setMapping(null); setStaged([]); setStageStats(null); setCatStats(null)
    setCurrentBalance(''); setSummary(null)
    setProfileExisted(false); setProfileLabel(''); setSourceFileName('')
    setProfileSaveWarning(''); setRemember(true)
  }

  // ── Step 1: parse locally ──────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    setError('')
    setProfileSaveWarning('')
    setSourceFileName(file.name)
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
          const fingerprint = await profileFingerprint(cols)
          const { data: profile, error: profileError } = await supabase
            .from('static_profiles')
            .select('name, mappings')
            .eq('header_fingerprint', fingerprint)
            .maybeSingle()
          if (profileError) throw profileError

          if (profile?.mappings) {
            setMapping(profile.mappings as ColumnMapping)
            setProfileExisted(true)
            setProfileLabel(profile.name)
            // Checked means edits to a recognised mapping are persisted too.
            setRemember(true)
          } else {
            setProfileExisted(false)
            setProfileLabel('')
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

      if (remember) {
        // Profile persistence is intentionally non-blocking: categorisation and
        // import continue, but a failure is visible instead of being swallowed.
        void supabase.functions.invoke('upsert-profile', {
          body: {
            headers,
            displayName: profileDisplayName(sourceFileName),
            mappings: mapping,
          },
        }).then(({ error: profileError }) => {
          if (profileError) {
            setProfileSaveWarning(
              'This import can continue, but Halcyon could not save the column layout for next time.',
            )
          } else {
            setProfileSaveWarning('')
          }
        }).catch(() => {
          setProfileSaveWarning(
            'This import can continue, but Halcyon could not save the column layout for next time.',
          )
        })
      }

      if (result.pendingMerchants.length > 0) {
        setCategorizing(true)
        setStatus(`Categorising ${result.pendingMerchants.length} merchants…`)
        try {
          const assignments: Parameters<typeof applyAssignments>[1] = []
          const totals = { fromCache: 0, fromBank: 0, fromAi: 0, geminiCalls: 0 }
          for (let offset = 0; offset < result.pendingMerchants.length; offset += 300) {
            const { data, error: fnErr } = await supabase.functions.invoke('categorize-merchants', {
              body: { merchants: result.pendingMerchants.slice(offset, offset + 300) },
            })
            if (fnErr) throw fnErr
            assignments.push(...data.assignments)
            totals.fromCache += data.stats.fromCache
            totals.fromBank += data.stats.fromBank ?? 0
            totals.fromAi += data.stats.fromAi
            totals.geminiCalls += data.stats.geminiCalls
          }
          setStaged((rows) => applyAssignments(rows, assignments))
          setCatStats(totals)
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
    if (isConnected) {
      if (connectedOverlapCount > 0) {
        setError(
          `${connectedOverlapCount} row${connectedOverlapCount === 1 ? '' : 's'} fall on or after ${cutoverDate}. ` +
          'Your bank connection already owns that period; upload an earlier statement instead.',
        )
        return
      }
      void commit()
      return
    }
    setStep('balance')
  }

  // ── Step 5: commit ─────────────────────────────────────────────────────
  const commit = async () => {
    setStep('processing')
    setBusy(true)
    setError('')
    try {
      const batchId = crypto.randomUUID()
      const payload = toTransactionPayload(staged, accountId, batchId)
      const parsedBalance = isConnected
        ? null
        : parseFloat(currentBalance.replace(/[^0-9.-]/g, ''))
      if (parsedBalance !== null && Number.isNaN(parsedBalance)) {
        throw new Error('Enter a valid current balance before importing.')
      }
      const isLiability = accountType === 'Credit Card' || accountType === 'Loan' || accountType === 'Debt'
      const targetBalance = parsedBalance === null
        ? null
        : Math.round((isLiability ? -Math.abs(parsedBalance) : parsedBalance) * 100)
      const blockedCount = staged.filter((r) => r.issues.length > 0).length

      const { data, error: fnErr } = await supabase.functions.invoke('upsert-transactions', {
        body: {
          transactions: payload,
          target_balance: targetBalance,
          file_name: sourceFileName,
          source_row_count: rawRows.length,
          blocked_count: blockedCount,
        },
      })
      if (fnErr) throw fnErr

      // Rescan for internal transfers over exactly the dates this batch
      // touched — link-transfers pads the window itself, so a counterpart
      // leg imported in an earlier, unrelated batch is still found.
      let transfersLinked: number | undefined
      let transfersSuggested: number | undefined
      if (data.inserted > 0 && payload.length > 0) {
        const dates = payload.map((r) => r.date).sort()
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
        blocked: blockedCount,
        transfersLinked,
        transfersSuggested,
        reconciliationAmount: data.reconciliationAmount,
        reconciliationDate: data.reconciliationDate,
      })
      await refreshData()
      setHistoryVersion((version) => version + 1)
      setStep('success')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
      setStep(isConnected ? 'staging' : 'balance')
    } finally {
      setBusy(false)
    }
  }

  const importable = staged.filter((r) => r.include).length
  const connectedOverlapCount = isConnected && cutoverDate
    ? staged.filter((r) => r.include && r.date !== null && r.date >= cutoverDate).length
    : 0

  return (
    <div className="grid gap-4">
      {error && (
        <div role="alert" className="rounded-[10px] border border-[var(--color-neg)] bg-[var(--color-neg)]/5 px-3 py-2 text-[13px] text-[var(--color-neg)]">
          {error}
        </div>
      )}
      {profileSaveWarning && (
        <div role="status" className="rounded-[10px] border border-[var(--color-warn)] bg-[var(--color-warn)]/5 px-3 py-2 text-[13px] text-ink2">
          {profileSaveWarning}
        </div>
      )}

      <AnimatePresence mode="wait">
        {step === 'upload' && (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-4">
            <DropZone onFile={handleFile} />
            <UploadHistory accountId={accountId} refreshKey={historyVersion} />
          </motion.div>
        )}

        {step === 'mapping' && (
          <motion.div key="mapping" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-4">
            {busy && <p role="status" aria-live="polite" className="text-[13px] text-ink2">{status}</p>}
            {mapping && (
              <>
                <MappingEditor
                  headers={headers} mapping={mapping} onChange={setMapping}
                  dateFormatConfident={stageStats?.dateFormatConfident ?? true}
                  rememberProfile={remember} onRememberChange={setRemember}
                  profileExisted={profileExisted}
                  profileName={profileLabel}
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
                  {catStats.fromCache} from saved rules/cache, {catStats.fromBank} from the bank
                  {catStats.fromAi > 0 && `, ${catStats.fromAi} via AI`}
                </span>
              )}
              {categorizing && <span role="status" aria-live="polite" className="text-accent-ink">{status}</span>}
            </div>

            {stageStats.unmappedBankCategories.length > 0 && (
              <p className="text-[13px] text-ink2">
                Your bank used categories Halcyon has no direct equivalent for
                ({stageStats.unmappedBankCategories.join(', ')}); those rows were sent to the AI instead.
              </p>
            )}

            {isConnected && (
              <div className={`rounded-[10px] border px-3 py-2 text-[12.5px] ${
                connectedOverlapCount > 0
                  ? 'border-[var(--color-neg)] bg-[var(--color-neg)]/5 text-[var(--color-neg)]'
                  : 'border-[var(--hair)] bg-black/[0.02] text-muted'
              }`}>
                {connectedOverlapCount > 0 ? (
                  <>
                    <strong>{connectedOverlapCount}</strong> row{connectedOverlapCount === 1 ? '' : 's'} fall on or after{' '}
                    <strong>{cutoverDate}</strong>, when the bank connection takes over. This file cannot be imported
                    into {accountName}; choose an earlier statement so transactions are not duplicated.
                  </>
                ) : (
                  <>
                    {accountName}'s balance comes from your bank connection. This CSV adds history
                    {cutoverDate ? <> before <strong>{cutoverDate}</strong></> : ''} only, with no balance step.
                  </>
                )}
              </div>
            )}

            <StagingTable rows={staged} onChange={setStaged} categorizing={categorizing} />

            <div className="flex gap-2">
              <Button onClick={goToBalance} disabled={busy || categorizing || importable === 0 || connectedOverlapCount > 0}>
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
                  onChange={(e) => setCurrentBalance(e.target.value)}
                  placeholder="e.g. 2450.31"
                  className="min-h-[46px] rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 text-[14px] outline-none focus:border-accent"
                />
              </label>
              <p className="text-[13px] text-ink2">
                Your statement shows changes, not the starting point. Telling us today's
                balance lets the ledger be reconciled against it.
              </p>
            </div>

            <div className="rounded-[10px] border border-[var(--hair)] bg-black/[0.02] px-3 py-2 text-[13px] text-ink2">
              Halcyon will reconcile the complete account ledger—not just this file—inside the
              same transaction as the import. The final adjustment will be shown after completion
              and remains excluded from spending.
            </div>

            <div className="flex gap-2">
              <Button onClick={commit} disabled={busy || currentBalance.trim() === ''}>
                Import {importable} rows
              </Button>
              <Button variant="ghost" onClick={() => setStep('staging')}>Back</Button>
            </div>
          </motion.div>
        )}

        {step === 'processing' && (
          <motion.p role="status" aria-live="polite" key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-6 text-center text-[13px] text-ink2">
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
              {summary.reconciliationAmount != null && summary.reconciliationDate && (
                <li>
                  Reconciliation entry <strong className="text-ink">{money(summary.reconciliationAmount)}</strong>
                  {' '}on <strong className="text-ink">{summary.reconciliationDate}</strong>
                </li>
              )}
              {(summary.transfersLinked ?? 0) > 0 && (
                <li><strong className="text-ink">{summary.transfersLinked}</strong> internal transfer{summary.transfersLinked === 1 ? '' : 's'} linked automatically</li>
              )}
              {(summary.transfersSuggested ?? 0) > 0 && (
                <li><strong className="text-ink">{summary.transfersSuggested}</strong> possible transfer{summary.transfersSuggested === 1 ? '' : 's'} need your review in Transfer review</li>
              )}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button onClick={reset}>Import another file</Button>
              {onReviewTransfers && <Button variant="ghost" onClick={onReviewTransfers}>Review transfers</Button>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
