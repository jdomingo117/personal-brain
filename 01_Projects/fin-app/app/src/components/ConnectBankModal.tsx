import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabaseClient'
import { useData } from '../contexts/DataContext'
import { runCategorizePending } from '../lib/categorizePending'
import { runDetectRecurrenceHints } from '../lib/detectRecurrenceHints'
import { Button } from './Controls'
import { fmtCents, type Account } from '../data'

type Props = {
  isOpen: boolean
  onClose: () => void
}

type UpAccountOption = {
  provider_account_id: string
  display_name: string
  account_type: 'TRANSACTIONAL' | 'SAVER'
  ownership_type: string
  balance_cents: number
  currency_code: string
  created_at: string
}

type HistoryPreset = 'all' | '365' | '90' | '30' | 'no-overlap' | 'custom'

interface PerAccountConfig {
  selected: boolean
  mode: 'existing' | 'new'
  existingAccountId: string
  newAccountName: string
  historyPreset: HistoryPreset
  cutoverDate: string
  // Day after the existing account's newest transaction — only meaningful in
  // 'existing' mode, null until an account is picked. This is what the
  // 'no-overlap' preset resolves to; going earlier than it is still allowed,
  // it just requires acknowledging the overlap warning (server-enforced in
  // map-provider-accounts regardless of which preset chose the date).
  noOverlapFloor: string | null
  floorDate: string | null
  acknowledgeOverlap: boolean
  mapped: boolean
  error: string | null
}

type Step = 'token' | 'map' | 'backfill' | 'success'

const todayIso = () => new Date().toISOString().slice(0, 10)
const addDaysIso = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const NEW_ACCOUNT_PRESETS: { value: HistoryPreset; label: string }[] = [
  { value: 'all', label: 'All history' },
  { value: '365', label: 'Last 12 months' },
  { value: '90', label: 'Last 90 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom date' },
]
const EXISTING_ACCOUNT_PRESETS: { value: HistoryPreset; label: string }[] = [
  { value: 'no-overlap', label: 'No overlap (recommended)' },
  { value: 'all', label: 'All history' },
  { value: '365', label: 'Last 12 months' },
  { value: '90', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom date' },
]

/** Resolves a preset to an actual cutover_date. 'custom' is a no-op — the
 *  caller keeps whatever the user typed into the date field. */
function resolvePreset(preset: HistoryPreset, upAccount: UpAccountOption, noOverlapFloor: string | null): string | null {
  if (preset === 'all') return upAccount.created_at.slice(0, 10)
  if (preset === 'no-overlap') return noOverlapFloor ?? todayIso()
  if (preset === 'custom') return null
  return addDaysIso(todayIso(), -Number(preset))
}

export default function ConnectBankModal({ isOpen, onClose }: Props) {
  const { accounts, refreshData } = useData()
  const [step, setStep] = useState<Step>('token')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [token, setToken] = useState('')
  const [connectionId, setConnectionId] = useState('')
  const [upAccounts, setUpAccounts] = useState<UpAccountOption[]>([])
  const [configs, setConfigs] = useState<Record<string, PerAccountConfig>>({})

  const [progress, setProgress] = useState<{ pages_fetched: number; rows_inserted: number } | null>(null)
  const [mappedCount, setMappedCount] = useState(0)
  const [categorizing, setCategorizing] = useState(false)
  const [categorizedCount, setCategorizedCount] = useState(0)

  // An account already mapped to a provider elsewhere can't be picked again
  // as an "existing account" target — each Halcyon account owns at most one
  // connection (account_connections.account_id is unique).
  const unconnected = accounts.filter((a) => !a.connectionId)

  const patchConfig = (upId: string, patch: Partial<PerAccountConfig>) =>
    setConfigs((prev) => ({ ...prev, [upId]: { ...prev[upId], ...patch } }))

  const reset = () => {
    setStep('token'); setBusy(false); setError('')
    setToken(''); setConnectionId(''); setUpAccounts([]); setConfigs({})
    setProgress(null); setMappedCount(0)
    setCategorizing(false); setCategorizedCount(0)
  }

  // refreshData() flips DataContext's loading flag, which unmounts the whole
  // routed view (see Guards.tsx's RequireOnboarded) — calling it mid-flow
  // would close this modal out from under the user before the backfill
  // progress or success step ever renders. Deferred to the close itself.
  const handleClose = () => { void refreshData(); reset(); onClose() }

  // ── Step 1: token ────────────────────────────────────────────────────
  const submitToken = async () => {
    if (!token.trim()) return
    setBusy(true); setError('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('connect-provider', {
        body: { provider: 'up', token: token.trim() },
      })
      if (fnErr) throw fnErr
      if (data?.error) { setError(data.error); return }

      const upAccts: UpAccountOption[] = data.accounts
      setConnectionId(data.connection_id)
      setUpAccounts(upAccts)
      // Default every account selected, mode 'new' (Up's own name), so the
      // common case — connect everything, Up owns the names — is zero extra
      // clicks. Switching any card to an existing account is one click away.
      // History defaults to 'all' for a new account — there's no CSV to
      // protect, so anything less than everything is a needless restriction.
      setConfigs(Object.fromEntries(upAccts.map((a) => [a.provider_account_id, {
        selected: true, mode: 'new', existingAccountId: '', newAccountName: a.display_name,
        historyPreset: 'all', cutoverDate: a.created_at.slice(0, 10),
        noOverlapFloor: null, floorDate: null, acknowledgeOverlap: false, mapped: false, error: null,
      } satisfies PerAccountConfig])))
      setStep('map')
    } catch (e: any) {
      setError(e.message || 'Could not connect — please try again.')
    } finally {
      setBusy(false)
    }
  }

  // Default cutover for an existing account: no-overlap (day after its
  // newest transaction) — going further back is available via the preset
  // selector, but requires acknowledging the overlap warning to actually submit.
  const pickExisting = async (upId: string, accountId: string) => {
    patchConfig(upId, {
      existingAccountId: accountId, historyPreset: 'no-overlap',
      floorDate: null, acknowledgeOverlap: false,
    })
    if (!accountId) return
    const { data } = await supabase
      .from('transactions').select('date').eq('account_id', accountId)
      .order('date', { ascending: false }).limit(1).maybeSingle()
    const floor = data ? addDaysIso(data.date, 1) : todayIso()
    patchConfig(upId, { noOverlapFloor: floor, cutoverDate: floor })
  }

  const pickHistoryPreset = (upId: string, preset: HistoryPreset) => {
    const upAccount = upAccounts.find((a) => a.provider_account_id === upId)
    const config = configs[upId]
    if (!upAccount || !config) return
    const resolved = resolvePreset(preset, upAccount, config.noOverlapFloor)
    patchConfig(upId, {
      historyPreset: preset,
      ...(resolved ? { cutoverDate: resolved } : {}),
      floorDate: null, acknowledgeOverlap: false,
    })
  }

  // ── Step 2: map (one call per selected, not-yet-mapped account) ─────
  const submitMappings = async () => {
    setBusy(true); setError('')
    try {
      const pending = upAccounts.filter((a) => {
        const c = configs[a.provider_account_id]
        return c.selected && !c.mapped
      })
      if (pending.length === 0) { setError('Select at least one account to connect.'); return }

      for (const a of pending) {
        const c = configs[a.provider_account_id]
        if (c.mode === 'existing' && !c.existingAccountId) {
          patchConfig(a.provider_account_id, { error: 'Choose an account to link.' })
          continue
        }
        if (c.mode === 'new' && !c.newAccountName.trim()) {
          patchConfig(a.provider_account_id, { error: 'Name this account.' })
          continue
        }

        const body: Record<string, unknown> = {
          connection_id: connectionId,
          provider_account_id: a.provider_account_id,
          cutover_date: c.cutoverDate,
          mode: c.mode,
          ...(c.acknowledgeOverlap ? { acknowledge_overlap: true } : {}),
          ...(c.mode === 'existing'
            ? { account_id: c.existingAccountId }
            : { new_account_name: c.newAccountName.trim(), new_account_type: a.account_type === 'SAVER' ? 'Savings' : 'Liquid' }),
        }
        const { data, error: fnErr } = await supabase.functions.invoke('map-provider-accounts', { body })
        if (fnErr) {
          patchConfig(a.provider_account_id, { error: fnErr.message || 'Could not link that account.' })
          continue
        }
        if (data?.error === 'overlap_unacknowledged') {
          patchConfig(a.provider_account_id, { floorDate: data.floor_date, error: data.message })
          continue
        }
        if (data?.error) {
          patchConfig(a.provider_account_id, { error: data.message || data.error })
          continue
        }
        patchConfig(a.provider_account_id, { mapped: true, error: null, floorDate: null })
      }
    } finally {
      setBusy(false)
    }
  }

  const goToBackfill = () => {
    const mappedTotal = upAccounts.filter((a) => configs[a.provider_account_id]?.mapped).length
    setMappedCount(mappedTotal)
    setStep('backfill')
    void runSync(connectionId)
  }

  // ── Step 3: backfill (chunked — loop until done; covers every account
  // mapped on this connection, not just the one that finished last) ──────
  const runSync = async (connId: string) => {
    setBusy(true)
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error: fnErr } = await supabase.functions.invoke('sync-provider', {
          body: { connection_id: connId, trigger: 'manual' },
        })
        if (fnErr) throw fnErr
        if (data?.error) {
          setError(data.message || 'Sync failed.')
          break
        }
        if (data?.alreadyRunning) break
        setProgress(data.progress ?? null)
        if (data?.done) break
      }

      // Out-of-band categorisation of everything the backfill brought in that
      // Up's own categories didn't cover. Best-effort — a Gemini outage must
      // not make a successful backfill look failed; the next sync retries.
      try {
        setCategorizing(true)
        const cat = await runCategorizePending()
        setCategorizedCount(cat.rowsCategorized)
      } catch {
        /* leave the count at 0; the next sync picks the backlog up */
      } finally {
        setCategorizing(false)
      }

      // Fire-and-forget: recurrence hints are a nice-to-have early signal,
      // not part of the connect flow's success criteria, so this never
      // blocks the modal or reports failure to the user. Same Law 5 posture
      // as categorisation — strictly after the request completes.
      runDetectRecurrenceHints().catch((err) => console.warn('recurrence hint detection failed', err))

      setStep('success')
    } catch (e: any) {
      setError(e.message || 'Sync failed — you can retry from Edit Account.')
      setStep('success')
    } finally {
      setBusy(false)
    }
  }

  const runInBackground = () => handleClose()

  const selectedList = upAccounts.filter((a) => configs[a.provider_account_id]?.selected)
  const anyBlockedOnOverlap = selectedList.some((a) => configs[a.provider_account_id]?.floorDate)
  const allSelectedMapped = selectedList.length > 0 && selectedList.every((a) => configs[a.provider_account_id]?.mapped)

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={step === 'backfill' ? undefined : handleClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-black/5"
          >
            <div className="max-h-[85vh] overflow-y-auto p-6">
              {step === 'token' && (
                <>
                  <h2 className="text-[18px] font-bold tracking-tight text-ink">Connect Up Bank</h2>
                  <p className="mt-1 text-[13px] text-muted">Your ledger stays current automatically.</p>

                  <div className="mt-5 grid gap-3 text-[12.5px] text-muted leading-relaxed">
                    <p>
                      Generate a Personal Access Token in the Up app (Settings → Personal Access Tokens).
                      <strong className="text-ink2"> Up allows one active token</strong> — generating a
                      new one there will disconnect anything else using your old one.
                    </p>
                    <p>
                      This token is <strong className="text-ink2">read-only</strong> — it cannot move
                      money. We encrypt it immediately and never show it again.
                    </p>
                  </div>

                  <label className="mt-5 flex flex-col gap-1.5">
                    <span className="text-[12px] font-semibold tracking-wide text-ink2 uppercase">Personal Access Token</span>
                    <input
                      type="password"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="up:yeah:..."
                      autoFocus
                      className="rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 py-2.5 text-[14px] text-ink outline-none transition focus:border-accent font-mono"
                    />
                  </label>

                  {error && (
                    <div className="mt-3 rounded-lg bg-red-500/10 p-3 text-[13px] text-red-500 font-medium">{error}</div>
                  )}

                  <div className="mt-5 flex items-center justify-end gap-3 border-t border-[var(--hair-soft)] pt-5">
                    <button type="button" onClick={handleClose} className="px-4 py-2 text-[13px] font-semibold text-muted hover:text-ink transition cursor-pointer">
                      Cancel
                    </button>
                    <Button onClick={submitToken} disabled={busy || !token.trim()}>
                      {busy ? 'Validating…' : 'Connect'}
                    </Button>
                  </div>
                </>
              )}

              {step === 'map' && (
                <>
                  <h2 className="text-[18px] font-bold tracking-tight text-ink">Link your accounts</h2>
                  <p className="mt-1 text-[13px] text-muted">
                    Choose which Up accounts to bring in — each maps to its own Halcyon account.
                  </p>

                  <div className="mt-5 grid gap-3">
                    {upAccounts.map((a) => {
                      const c = configs[a.provider_account_id]
                      if (!c) return null
                      return (
                        <div
                          key={a.provider_account_id}
                          className={`rounded-lg border p-3.5 transition ${c.mapped ? 'border-[var(--color-pos)]/40 bg-[var(--color-pos)]/5' : 'border-[var(--hair)]'}`}
                        >
                          <label className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={c.selected}
                              disabled={c.mapped}
                              onChange={(e) => patchConfig(a.provider_account_id, { selected: e.target.checked })}
                            />
                            <span className="flex-1">
                              <span className="font-semibold text-ink">{a.display_name}</span>
                              <span className="ml-1.5 text-[11px] uppercase tracking-wide text-muted">{a.account_type}</span>
                            </span>
                            <span className="font-mono text-[12.5px] text-ink2">{fmtCents(a.balance_cents)}</span>
                          </label>

                          {c.mapped ? (
                            <p className="mt-2 text-[12px] font-medium text-[var(--color-pos)]">Linked ✓</p>
                          ) : c.selected && (
                            <div className="mt-3 grid gap-2.5 pl-6">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => patchConfig(a.provider_account_id, {
                                    mode: 'new', historyPreset: 'all', cutoverDate: a.created_at.slice(0, 10),
                                    floorDate: null, acknowledgeOverlap: false,
                                  })}
                                  className={`flex-1 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition ${c.mode === 'new' ? 'border-accent bg-[var(--accent-wash)] text-accent-ink' : 'border-[var(--hair)] text-ink2'}`}
                                >
                                  New account
                                </button>
                                <button
                                  type="button"
                                  onClick={() => patchConfig(a.provider_account_id, {
                                    mode: 'existing', existingAccountId: '', historyPreset: 'no-overlap',
                                    noOverlapFloor: null, floorDate: null, acknowledgeOverlap: false,
                                  })}
                                  disabled={unconnected.length === 0}
                                  className={`flex-1 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-40 ${c.mode === 'existing' ? 'border-accent bg-[var(--accent-wash)] text-accent-ink' : 'border-[var(--hair)] text-ink2'}`}
                                >
                                  Existing account
                                </button>
                              </div>

                              {c.mode === 'new' ? (
                                <input
                                  type="text"
                                  value={c.newAccountName}
                                  onChange={(e) => patchConfig(a.provider_account_id, { newAccountName: e.target.value })}
                                  placeholder={a.display_name}
                                  className="rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3 py-2 text-[13px] text-ink outline-none transition focus:border-accent"
                                />
                              ) : (
                                <select
                                  value={c.existingAccountId}
                                  onChange={(e) => void pickExisting(a.provider_account_id, e.target.value)}
                                  className="rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3 py-2 text-[13px] text-ink outline-none transition focus:border-accent appearance-none cursor-pointer"
                                >
                                  <option value="">Choose…</option>
                                  {unconnected.map((acc: Account) => (
                                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.type})</option>
                                  ))}
                                </select>
                              )}

                              {(c.mode === 'new' || c.existingAccountId) && (
                                <label className="grid gap-1">
                                  <span className="text-[11px] font-semibold tracking-wide text-ink2 uppercase">History to import</span>
                                  <select
                                    value={c.historyPreset}
                                    onChange={(e) => pickHistoryPreset(a.provider_account_id, e.target.value as HistoryPreset)}
                                    className="rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3 py-2 text-[13px] text-ink outline-none transition focus:border-accent appearance-none cursor-pointer"
                                  >
                                    {(c.mode === 'new' ? NEW_ACCOUNT_PRESETS : EXISTING_ACCOUNT_PRESETS).map((p) => (
                                      <option key={p.value} value={p.value}>{p.label}</option>
                                    ))}
                                  </select>
                                  {c.historyPreset === 'custom' ? (
                                    <input
                                      type="date"
                                      value={c.cutoverDate}
                                      max={todayIso()}
                                      onChange={(e) => patchConfig(a.provider_account_id, { cutoverDate: e.target.value, floorDate: null, acknowledgeOverlap: false })}
                                      className="mt-1 rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3 py-2 text-[13px] text-ink outline-none transition focus:border-accent"
                                    />
                                  ) : (
                                    <span className="text-[11.5px] text-muted leading-relaxed">
                                      From <strong className="text-ink2">{c.cutoverDate}</strong> onward
                                      {c.mode === 'existing' ? '. Existing history stays exactly as it is.' : '.'}
                                    </span>
                                  )}
                                </label>
                              )}

                              {c.floorDate && (
                                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[12px] text-amber-700 dark:text-amber-400">
                                  {c.error}
                                  <label className="mt-1.5 flex items-center gap-2 font-semibold">
                                    <input
                                      type="checkbox"
                                      checked={c.acknowledgeOverlap}
                                      onChange={(e) => patchConfig(a.provider_account_id, { acknowledgeOverlap: e.target.checked })}
                                    />
                                    Import anyway — this may create duplicates
                                  </label>
                                </div>
                              )}
                              {c.error && !c.floorDate && (
                                <p className="text-[12px] font-medium text-red-500">{c.error}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {error && <div className="mt-3 rounded-lg bg-red-500/10 p-3 text-[13px] text-red-500 font-medium">{error}</div>}

                  <div className="mt-5 flex items-center justify-end gap-3 border-t border-[var(--hair-soft)] pt-5">
                    <button type="button" onClick={handleClose} className="px-4 py-2 text-[13px] font-semibold text-muted hover:text-ink transition cursor-pointer">
                      Cancel
                    </button>
                    {allSelectedMapped ? (
                      <Button onClick={goToBackfill}>Continue</Button>
                    ) : (
                      <Button
                        onClick={() => void submitMappings()}
                        disabled={busy || selectedList.length === 0 || (anyBlockedOnOverlap && selectedList.some((a) => configs[a.provider_account_id]?.floorDate && !configs[a.provider_account_id]?.acknowledgeOverlap))}
                      >
                        {busy ? 'Linking…' : `Link ${selectedList.filter((a) => !configs[a.provider_account_id]?.mapped).length} account${selectedList.length === 1 ? '' : 's'}`}
                      </Button>
                    )}
                  </div>
                </>
              )}

              {step === 'backfill' && (
                <>
                  <h2 className="text-[18px] font-bold tracking-tight text-ink">
                    Importing {mappedCount} account{mappedCount === 1 ? '' : 's'}
                  </h2>
                  <p className="mt-1 text-[13px] text-muted">
                    Pulling transaction history from Up. This is safe to close — it resumes exactly where it left off.
                  </p>
                  <div className="mt-6 flex flex-col items-center gap-3 py-4">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--hair)] border-t-accent" />
                    <p className="text-[13px] font-medium text-ink2">
                      {categorizing
                        ? 'Categorising transactions…'
                        : progress ? `${progress.rows_inserted} transactions imported so far…` : 'Starting…'}
                    </p>
                  </div>
                  <div className="mt-5 flex items-center justify-end gap-3 border-t border-[var(--hair-soft)] pt-5">
                    <button type="button" onClick={() => void runInBackground()} className="px-4 py-2 text-[13px] font-semibold text-muted hover:text-ink transition cursor-pointer">
                      Run in background
                    </button>
                  </div>
                </>
              )}

              {step === 'success' && (
                <>
                  <h2 className="text-[18px] font-bold tracking-tight text-ink">
                    {error ? 'Connected, sync incomplete' : 'Connected'}
                  </h2>
                  <p className="mt-1 text-[13px] text-muted">
                    {error
                      ? `${mappedCount} account${mappedCount === 1 ? '' : 's'} linked. ${error} You can retry from Edit Account → Sync now.`
                      : `${mappedCount} account${mappedCount === 1 ? '' : 's'} now syncing automatically from Up.`}
                  </p>
                  {progress && (
                    <p className="mt-3 text-[13px] font-medium text-ink2">
                      {progress.rows_inserted} transactions imported
                      {categorizedCount > 0 && `, ${categorizedCount} categorised`}.
                    </p>
                  )}
                  <div className="mt-5 flex items-center justify-end gap-3 border-t border-[var(--hair-soft)] pt-5">
                    <Button onClick={handleClose}>Done</Button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
