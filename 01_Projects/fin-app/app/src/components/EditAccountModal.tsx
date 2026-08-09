import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabaseClient'
import { useData } from '../contexts/DataContext'
import { runCategorizePending } from '../lib/categorizePending'
import { runDetectRecurrenceHints } from '../lib/detectRecurrenceHints'
import { Account } from '../data'

type Props = {
  account: Account
  isOpen: boolean
  onClose: () => void
}

interface Identifier {
  id: string
  kind: string
  value: string
  source: string
}

interface ConnectionInfo {
  accountConnectionId: string
  connectionId: string
  provider: string
  providerStatus: 'active' | 'revoked' | 'error' | 'disabled'
  lastError: string | null
  backfillDone: boolean
  balanceAsOf: string | null
  lastSyncedAt: string | null
  syncRunning: boolean
  cutoverDate: string
}

interface SyncRun {
  id: string
  kind: string
  status: string
  trigger: string
  started_at: string
  finished_at: string | null
  rows_inserted: number
  rows_updated: number
  error_code: string | null
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.round(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export default function EditAccountModal({ account, isOpen, onClose }: Props) {
  const { refreshData } = useData()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmText, setConfirmText] = useState('')

  const [identifiers, setIdentifiers] = useState<Identifier[]>([])
  const [newIdentifier, setNewIdentifier] = useState('')
  const [savingIdentifier, setSavingIdentifier] = useState(false)
  // Separate from `error`, which renders inside the Danger Zone — an
  // identifier problem shown under a delete warning reads as far more
  // alarming than it is.
  const [identifierError, setIdentifierError] = useState('')

  const [connection, setConnection] = useState<ConnectionInfo | null>(null)
  const [connectionLoading, setConnectionLoading] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false)
  const [keepTransactions, setKeepTransactions] = useState(true)
  const [disconnectBusy, setDisconnectBusy] = useState(false)
  const [syncHistory, setSyncHistory] = useState<SyncRun[]>([])
  const [showHistory, setShowHistory] = useState(false)
  // refreshData() flips DataContext's loading flag, which unmounts this whole
  // view (see Guards.tsx's RequireOnboarded) — calling it mid-flow would close
  // this modal out from under the user before they see the result. Deferred
  // to handleClose instead, once there's nothing left to show them.
  const dirtyRef = useRef(false)

  const loadConnection = async () => {
    setConnectionLoading(true)
    try {
      const { data: ac } = await supabase
        .from('account_connections')
        .select('id, connection_id, provider, backfill_done, balance_as_of, last_synced_at, cutover_date')
        .eq('account_id', account.id)
        .maybeSingle()
      if (!ac) { setConnection(null); return }

      const [{ data: pc }, { data: run }, { data: history }] = await Promise.all([
        supabase.from('provider_connections').select('status, last_error').eq('id', ac.connection_id).maybeSingle(),
        supabase.from('sync_runs').select('status').eq('connection_id', ac.connection_id).eq('status', 'running').maybeSingle(),
        supabase
          .from('sync_runs')
          .select('id, kind, status, trigger, started_at, finished_at, rows_inserted, rows_updated, error_code')
          .eq('connection_id', ac.connection_id)
          .order('started_at', { ascending: false })
          .limit(5),
      ])
      setSyncHistory(history ?? [])

      setConnection({
        accountConnectionId: ac.id,
        connectionId: ac.connection_id,
        provider: ac.provider,
        providerStatus: pc?.status ?? 'active',
        lastError: pc?.last_error ?? null,
        backfillDone: ac.backfill_done,
        balanceAsOf: ac.balance_as_of,
        lastSyncedAt: ac.last_synced_at,
        syncRunning: !!run,
        cutoverDate: ac.cutover_date,
      })
    } finally {
      setConnectionLoading(false)
    }
  }

  const syncNow = async () => {
    if (!connection) return
    setSyncBusy(true); setSyncMessage('')
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error: fnErr } = await supabase.functions.invoke('sync-provider', {
          body: { connection_id: connection.connectionId, trigger: 'manual' },
        })
        if (fnErr) throw fnErr
        if (data?.error) { setSyncMessage(data.message || 'Sync failed.'); break }
        if (data?.alreadyRunning) { setSyncMessage('A sync is already running.'); break }
        if (data?.done) { setSyncMessage('Up to date.'); break }
      }
      dirtyRef.current = true

      // Out-of-band categorisation of anything the sync brought in that Up's
      // own categories didn't cover. Best-effort: a Gemini outage must not
      // make an otherwise-successful sync look failed.
      try {
        setSyncMessage('Categorising new transactions…')
        const cat = await runCategorizePending()
        setSyncMessage(cat.rowsCategorized > 0 ? `Up to date — ${cat.rowsCategorized} transactions categorised.` : 'Up to date.')
      } catch {
        setSyncMessage('Up to date — categorisation unavailable, will retry on next sync.')
      }

      // Fire-and-forget, same posture as ConnectBankModal — never blocks or
      // surfaces failure, purely an early signal on top of the confirmed sync.
      runDetectRecurrenceHints().catch((err) => console.warn('recurrence hint detection failed', err))

      await loadConnection()
    } catch (err: any) {
      setSyncMessage(err.message || 'Sync failed.')
    } finally {
      setSyncBusy(false)
    }
  }

  const [extendOpen, setExtendOpen] = useState(false)
  const [extendDate, setExtendDate] = useState('')
  const [extendFloorDate, setExtendFloorDate] = useState<string | null>(null)
  const [extendAcknowledge, setExtendAcknowledge] = useState(false)
  const [extendBusy, setExtendBusy] = useState(false)
  const [extendError, setExtendError] = useState('')

  const submitExtend = async () => {
    if (!connection || !extendDate) return
    setExtendBusy(true); setExtendError('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('extend-provider-history', {
        body: {
          account_connection_id: connection.accountConnectionId,
          new_cutover_date: extendDate,
          ...(extendAcknowledge ? { acknowledge_overlap: true } : {}),
        },
      })
      if (fnErr) throw fnErr
      if (data?.error === 'overlap_unacknowledged') {
        setExtendFloorDate(data.floor_date)
        setExtendError(data.message)
        return
      }
      if (data?.error) { setExtendError(data.message || data.error); return }

      setExtendOpen(false); setExtendDate(''); setExtendFloorDate(null); setExtendAcknowledge(false)
      // extend-provider-history only moved the cutover — the actual pull
      // reuses the same chunked backfill loop "Sync now" uses.
      await syncNow()
    } catch (err: any) {
      setExtendError(err.message || 'Could not extend history.')
    } finally {
      setExtendBusy(false)
    }
  }

  const disconnect = async () => {
    if (!connection) return
    setDisconnectBusy(true)
    try {
      const { error: fnErr } = await supabase.functions.invoke('disconnect-provider', {
        body: { connection_id: connection.connectionId, keep_transactions: keepTransactions },
      })
      if (fnErr) throw fnErr
      setConfirmingDisconnect(false)
      setConnection(null)
      dirtyRef.current = true
    } catch (err: any) {
      setSyncMessage(err.message || 'Could not disconnect.')
    } finally {
      setDisconnectBusy(false)
    }
  }

  const loadIdentifiers = async () => {
    const { data } = await supabase
      .from('account_identifiers')
      .select('id, kind, value, source')
      .eq('account_id', account.id)
      .order('created_at', { ascending: true })
    setIdentifiers(data ?? [])
  }

  useEffect(() => {
    if (isOpen) { void loadIdentifiers(); void loadConnection() }
  }, [isOpen, account.id])

  const addIdentifier = async () => {
    if (!newIdentifier) return
    setSavingIdentifier(true)
    setIdentifierError('')
    try {
      // The Edge Function validates and normalises the identifier, then
      // stamps tenancy from the verified session rather than this component.
      const { error: insertErr } = await supabase.functions.invoke('manage-account-identifier', {
        body: { action: 'add', account_id: account.id, value: newIdentifier },
      })
      if (insertErr) {
        setIdentifierError(
          insertErr.code === '23505'
            ? 'That identifier is already on this account.'
            : 'Could not save that identifier.',
        )
        return
      }
      setNewIdentifier('')
      await loadIdentifiers()
    } finally {
      setSavingIdentifier(false)
    }
  }

  const removeIdentifier = async (id: string) => {
    setIdentifierError('')
    const { error: delErr } = await supabase.functions.invoke('manage-account-identifier', {
      body: { action: 'remove', id },
    })
    if (delErr) {
      setIdentifierError('Could not remove that identifier.')
      return
    }
    await loadIdentifiers()
  }

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') return
    
    setError('')
    setLoading(true)
    try {
      const { error: fnError } = await supabase.functions.invoke('delete-account', {
        body: { id: account.id }
      })
      
      if (fnError) throw fnError

      await refreshData()
      handleClose()
    } catch (err: any) {
      setError(err.message || 'Failed to delete account')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setConfirmText('')
    setError('')
    setIdentifierError('')
    setNewIdentifier('')
    setConfirmingDisconnect(false)
    setSyncMessage('')
    setShowHistory(false)
    setExtendOpen(false); setExtendDate(''); setExtendFloorDate(null); setExtendAcknowledge(false); setExtendError('')
    if (dirtyRef.current) { dirtyRef.current = false; void refreshData() }
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-black/5"
          >
            <div className="p-6">
              <h2 className="text-[18px] font-bold tracking-tight text-ink">Edit Account</h2>
              <p className="mt-1 text-[13px] text-muted">Manage settings for {account.name}.</p>

              {!connectionLoading && connection && (
                <div className="mt-6">
                  <h3 className="text-[14px] font-bold text-ink mb-2">Bank connection</h3>
                  <div className="rounded-lg border border-[var(--hair)] px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] ${
                          connection.providerStatus === 'revoked'
                            ? 'bg-red-500/10 text-red-500'
                            : connection.providerStatus === 'error'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : connection.syncRunning || !connection.backfillDone
                                ? 'bg-blue-500/10 text-blue-500'
                                : 'bg-[var(--color-pos)]/10 text-[var(--color-pos)]'
                        }`}
                      >
                        {connection.providerStatus === 'revoked'
                          ? 'Reconnect needed'
                          : connection.providerStatus === 'error'
                            ? 'Sync error'
                            : connection.syncRunning
                              ? 'Syncing…'
                              : !connection.backfillDone
                                ? 'Backfilling…'
                                : 'Connected'}
                      </span>
                      <span className="text-[11.5px] text-muted">
                        Synced {timeAgo(connection.balanceAsOf ?? connection.lastSyncedAt)}
                      </span>
                    </div>

                    {connection.providerStatus === 'error' && connection.lastError && (
                      <p className="mt-2 text-[12px] text-amber-600 dark:text-amber-400">{connection.lastError}</p>
                    )}
                    {connection.providerStatus === 'revoked' && (
                      <p className="mt-2 text-[12px] text-red-500">
                        Up disconnected this — your access token was replaced. Reconnect from "Connect bank" to resume syncing.
                      </p>
                    )}

                    {syncMessage && <p className="mt-2 text-[12px] text-muted">{syncMessage}</p>}

                    {!confirmingDisconnect ? (
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void syncNow()}
                          disabled={syncBusy || connection.syncRunning || connection.providerStatus === 'revoked'}
                          className="micro rounded-lg border border-[var(--hair)] px-3 py-1.5 text-[12.5px] font-semibold text-ink transition hover:bg-black/[0.03] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {syncBusy ? 'Syncing…' : 'Sync now'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setExtendOpen((o) => !o); setExtendDate(''); setExtendFloorDate(null); setExtendAcknowledge(false); setExtendError('') }}
                          disabled={connection.providerStatus === 'revoked'}
                          className="micro rounded-lg border border-[var(--hair)] px-3 py-1.5 text-[12.5px] font-semibold text-ink transition hover:bg-black/[0.03] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Extend history
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDisconnect(true)}
                          className="micro rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-muted transition hover:text-red-500"
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-lg border border-[var(--hair)] bg-black/[0.02] p-3">
                        <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink2">
                          <input type="checkbox" checked={keepTransactions} onChange={(e) => setKeepTransactions(e.target.checked)} />
                          Keep the transactions Up imported
                        </label>
                        <div className="mt-2.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void disconnect()}
                            disabled={disconnectBusy}
                            className="micro rounded-lg bg-red-500 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
                          >
                            {disconnectBusy ? 'Disconnecting…' : 'Confirm disconnect'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingDisconnect(false)}
                            className="micro px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:text-ink transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {extendOpen && (
                      <div className="mt-3 rounded-lg border border-[var(--hair)] bg-black/[0.02] p-3">
                        <label className="grid gap-1">
                          <span className="text-[11px] font-semibold tracking-wide text-ink2 uppercase">Pull history back to</span>
                          <input
                            type="date"
                            value={extendDate}
                            max={new Date(new Date(`${connection.cutoverDate}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10)}
                            onChange={(e) => { setExtendDate(e.target.value); setExtendFloorDate(null); setExtendAcknowledge(false); setExtendError('') }}
                            className="rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3 py-2 text-[13px] text-ink outline-none transition focus:border-accent"
                          />
                          <span className="text-[11.5px] text-muted leading-relaxed">
                            Currently pulling from {connection.cutoverDate}. Choosing an earlier date backfills the gap — safe to close mid-way, it resumes on its own.
                          </span>
                        </label>

                        {extendFloorDate && (
                          <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[12px] text-amber-700 dark:text-amber-400">
                            {extendError}
                            <label className="mt-1.5 flex items-center gap-2 font-semibold">
                              <input type="checkbox" checked={extendAcknowledge} onChange={(e) => setExtendAcknowledge(e.target.checked)} />
                              Extend anyway — this may create duplicates
                            </label>
                          </div>
                        )}
                        {extendError && !extendFloorDate && (
                          <p className="mt-2 text-[12px] font-medium text-red-500">{extendError}</p>
                        )}

                        <div className="mt-2.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void submitExtend()}
                            disabled={extendBusy || !extendDate || (!!extendFloorDate && !extendAcknowledge)}
                            className="micro rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-surface transition hover:-translate-y-px hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                          >
                            {extendBusy ? 'Extending…' : 'Extend'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setExtendOpen(false); setExtendDate(''); setExtendFloorDate(null); setExtendAcknowledge(false); setExtendError('') }}
                            className="micro px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:text-ink transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {syncHistory.length > 0 && (
                      <div className="mt-3 border-t border-[var(--hair-soft)] pt-2.5">
                        <button
                          type="button"
                          onClick={() => setShowHistory((s) => !s)}
                          className="micro text-[11.5px] font-semibold text-muted hover:text-ink transition"
                        >
                          {showHistory ? 'Hide' : 'Show'} sync history
                        </button>
                        {showHistory && (
                          <ul className="mt-2 grid gap-1.5">
                            {syncHistory.map((run) => (
                              <li key={run.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                                <span className="text-muted">{timeAgo(run.started_at)}</span>
                                <span className="text-ink2">{run.kind}</span>
                                <span
                                  className={
                                    run.status === 'succeeded' ? 'text-[var(--color-pos)]'
                                      : run.status === 'failed' ? 'text-red-500'
                                        : 'text-muted'
                                  }
                                >
                                  {run.status === 'failed' && run.error_code ? run.error_code : run.status}
                                </span>
                                <span className="tabular-nums text-ink2">+{run.rows_inserted}/{run.rows_updated}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-6">
                <h3 className="text-[14px] font-bold text-ink mb-1">Identifiers</h3>
                <p className="text-[13px] text-muted mb-3">
                  Last-4 digits or account numbers that let the transfer linker
                  recognise this account from another bank's description of it.
                </p>

                {identifiers.length > 0 && (
                  <ul className="mb-3 grid gap-1.5">
                    {identifiers.map((id) => (
                      <li
                        key={id.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[var(--hair)] px-3 py-2 text-[13px]"
                      >
                        <span className="font-mono text-ink">
                          ····{id.value.length > 4 ? id.value.slice(-4) : id.value}
                        </span>
                        <span className="text-[11px] uppercase tracking-wide text-muted">{id.source}</span>
                        <button
                          type="button"
                          onClick={() => removeIdentifier(id.id)}
                          className="text-[12px] font-medium text-muted underline decoration-dotted transition hover:text-red-500"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newIdentifier}
                    onChange={e => setNewIdentifier(e.target.value)}
                    placeholder="e.g. 3692"
                    className="flex-1 rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 py-2 text-[14px] text-ink outline-none transition focus:border-accent font-mono"
                  />
                  <button
                    type="button"
                    onClick={addIdentifier}
                    disabled={savingIdentifier || !newIdentifier.replace(/\D/g, '')}
                    className="micro rounded-lg border border-[var(--hair)] px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-black/[0.03] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>

                {identifierError && (
                  <p className="mt-2 text-[12.5px] text-[var(--color-neg)]">{identifierError}</p>
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-[var(--hair)]">
                <h3 className="text-[14px] font-bold text-red-500 mb-2">Danger Zone</h3>
                <p className="text-[13px] text-muted mb-4">
                  Deleting this account will instantly and permanently erase all its associated transactions.
                  This action cannot be undone.
                </p>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold tracking-wide text-ink2 uppercase">
                    Type 'DELETE' to confirm
                  </span>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 py-2.5 text-[14px] text-ink outline-none transition focus:border-red-500 font-mono uppercase"
                  />
                </label>

                {error && (
                  <div className="mt-3 rounded-lg bg-red-500/10 p-3 text-[13px] text-red-500 font-medium">
                    {error}
                  </div>
                )}

                <div className="mt-5 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 text-[13px] font-semibold text-muted hover:text-ink transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleDelete}
                    disabled={loading || confirmText !== 'DELETE'}
                    className="micro bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-px hover:shadow-lg rounded-lg px-4 py-2 transition duration-200 cursor-pointer font-semibold text-[13px]"
                  >
                    {loading ? 'Deleting...' : 'Delete Account'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
