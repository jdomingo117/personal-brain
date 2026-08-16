import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabaseClient'
import { useData } from '../contexts/DataContext'
import { Button } from './Controls'
import { fmtCents } from '../data'
import { normalizeMerchant } from '../lib/csv/normalizeMerchant'
import {
  suggestedReviewSelection,
  summariseOverflow,
  untrackedTransferLabel,
} from '../lib/transfers/reviewPresentation'
import InvestmentCashLinker from './InvestmentCashLinker'

interface LinkedTxn {
  id: string
  date: string
  amount: number
  original_description: string | null
  account_id: string
}

interface TransferLinkRow {
  id: string
  state: 'auto' | 'suggested' | 'confirmed' | 'rejected' | 'external'
  score: number
  reasons: string[]
  ambiguous: boolean
  from_txn: LinkedTxn | null
  to_txn: LinkedTxn | null
}

interface UnmatchedRow {
  id: string
  date: string
  amount: number
  original_description: string | null
  account_id: string
}

interface OverflowRow {
  amount_cents: number
  leg_count: number
}

interface SuggestedGroup {
  key: string
  fromAccountId: string
  toAccountId: string
  links: TransferLinkRow[]
}

interface UnmatchedGroup {
  key: string
  label: string
  rows: UnmatchedRow[]
}

/** Groups by normalized merchant identity, same convention as merchant_rules
 *  and every other ingestion cache — e.g. every "Round Up" leg that slips
 *  through (a merchant whose text happens to collide, not the sweep itself,
 *  which is excluded from the candidate pool entirely at ingest) collapses
 *  into one reviewable batch instead of N identical rows. */
function groupUnmatched(unmatched: UnmatchedRow[]): UnmatchedGroup[] {
  const groups = new Map<string, UnmatchedGroup>()
  for (const row of unmatched) {
    const { key, display } = normalizeMerchant(row.original_description)
    if (!groups.has(key)) groups.set(key, { key, label: display, rows: [] })
    groups.get(key)!.rows.push(row)
  }
  return [...groups.values()].sort((a, b) => b.rows.length - a.rows.length)
}

/** Groups by the unordered account pair — a sweep that occasionally reverses
 *  direction (A→B one fortnight, B→A the next) is still one relationship to
 *  the user, not two. Mirrors pairHistoryKey() in lib/transfers/match.ts.
 *  Links missing either leg (shouldn't happen — the matcher's hard gates
 *  require both) are dropped from grouping and rendered individually as a
 *  fallback so nothing silently disappears. */
function groupSuggested(suggested: TransferLinkRow[]): { groups: SuggestedGroup[]; groupless: TransferLinkRow[] } {
  const groups = new Map<string, SuggestedGroup>()
  const groupless: TransferLinkRow[] = []
  for (const link of suggested) {
    if (!link.from_txn || !link.to_txn) {
      groupless.push(link)
      continue
    }
    const a = link.from_txn.account_id
    const b = link.to_txn.account_id
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    if (!groups.has(key)) groups.set(key, { key, fromAccountId: a, toAccountId: b, links: [] })
    groups.get(key)!.links.push(link)
  }
  return { groups: [...groups.values()].sort((x, y) => y.links.length - x.links.length), groupless }
}

/**
 * Same-Day Osko Linker (SRD §6.E) — the review surface for internal-transfer
 * detection. Nothing here rewrites a transaction's category; a decision is
 * durable state layered on top (transfer_decisions, via decide-transfer),
 * which is what lets a rejected suggestion stay rejected across re-imports.
 */
export default function OskoLinker() {
  const { accounts, refreshData } = useData()
  const [links, setLinks] = useState<TransferLinkRow[]>([])
  const [unmatched, setUnmatched] = useState<UnmatchedRow[]>([])
  const [unmatchedTotal, setUnmatchedTotal] = useState(0)
  const [overflow, setOverflow] = useState<OverflowRow[]>([])
  const [loading, setLoading] = useState(true)
  const [rescanning, setRescanning] = useState(false)
  const [deciding, setDeciding] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [showAuto, setShowAuto] = useState(false)
  const [showOverflow, setShowOverflow] = useState(false)
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  // A link is selected-by-default (opt-out, not opt-in) unless ambiguous —
  // ambiguous links are never auto-selected regardless of this set, so a
  // blind "select all" can't rubber-stamp a coin-flip pair. Stale ids left
  // behind after a decide are harmless — they just stop matching anything.
  const [deselected, setDeselected] = useState<Set<string>>(new Set())
  const [batchBusy, setBatchBusy] = useState<string | null>(null)
  // Separate from the suggested-pairs state above — different id space
  // (txn ids, not link ids) and a different queue entirely, kept apart so
  // toggling one never has spooky action on the other.
  const [unmatchedExpandedGroups, setUnmatchedExpandedGroups] = useState<Set<string>>(new Set())
  const [unmatchedDeselected, setUnmatchedDeselected] = useState<Set<string>>(new Set())
  const [unmatchedBatchBusy, setUnmatchedBatchBusy] = useState<string | null>(null)
  const [investmentRefreshKey, setInvestmentRefreshKey] = useState(0)

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? 'Unknown account'

  const load = useCallback(async () => {
    setLoading(true)
    const [linksRes, unmatchedRes, overflowRes] = await Promise.all([
      supabase
        .from('transfer_links')
        .select(
          `id, state, score, reasons, ambiguous,
           from_txn:transactions!transfer_links_from_txn_id_fkey(id, date, amount, original_description, account_id),
           to_txn:transactions!transfer_links_to_txn_id_fkey(id, date, amount, original_description, account_id)`,
        )
        .in('state', ['auto', 'suggested'])
        .order('score', { ascending: false }),
      // Legs that look like a transfer (transfer_candidate) but never found a
      // counterpart — the other account may not be connected yet, or this
      // simply isn't a transfer. These count as ordinary spending until the
      // user says otherwise, so this list is what makes that decision
      // reachable rather than the leg just sitting there silently.
      // Capped at 500 (well below PostgREST's 1000-row max_rows) rather than
      // the old 100 — now that Round Up (the dominant, structurally-unmatchable
      // bucket) is excluded from transfer_candidate at ingest, the real volume
      // is an order of magnitude smaller; `exact` count still reports the true
      // total so a genuine backlog beyond one page is surfaced, not silently
      // truncated.
      supabase
        .from('transactions_analytic')
        .select('id, date, amount, original_description, account_id', { count: 'exact' })
        .eq('transfer_state', 'unmatched')
        .order('date', { ascending: false })
        .limit(500),
      // Amount buckets the matcher skipped entirely rather than scoring a
      // truncated, order-dependent subset — see match.ts's MAX_BUCKET. Never
      // shown before this: a skipped bucket used to be a silent gap.
      supabase
        .from('transfer_match_overflow')
        .select('amount_cents, leg_count')
        .order('amount_cents', { ascending: false }),
    ])
    if (linksRes.error || unmatchedRes.error || overflowRes.error) {
      setError('Could not load transfer suggestions.')
    } else {
      setLinks((linksRes.data ?? []) as unknown as TransferLinkRow[])
      setUnmatched(unmatchedRes.data ?? [])
      setUnmatchedTotal(unmatchedRes.count ?? (unmatchedRes.data ?? []).length)
      setOverflow(overflowRes.data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const rescan = async () => {
    setRescanning(true)
    setError('')
    try {
      const { error: fnErr } = await supabase.functions.invoke('link-transfers', { body: { scope: 'all' } })
      if (fnErr) throw fnErr
      await load()
      setInvestmentRefreshKey((value) => value + 1)
      await refreshData()
    } catch {
      setError('Rescan failed — please try again.')
    } finally {
      setRescanning(false)
    }
  }

  const decide = async (linkId: string, verdict: 'confirmed' | 'rejected' | 'external') => {
    setDeciding(linkId)
    setError('')
    try {
      const { error: fnErr } = await supabase.functions.invoke('decide-transfer', {
        body: { link_id: linkId, verdict },
      })
      if (fnErr) throw fnErr
      setLinks((prev) => prev.filter((l) => l.id !== linkId))
      await refreshData()
    } catch {
      setError('Could not save that decision — please try again.')
    } finally {
      setDeciding(null)
    }
  }

  const decideLeg = async (txnId: string, verdict: 'rejected' | 'external') => {
    setDeciding(txnId)
    setError('')
    try {
      const { error: fnErr } = await supabase.functions.invoke('decide-transfer', {
        body: { txn_id: txnId, verdict },
      })
      if (fnErr) throw fnErr
      setUnmatched((prev) => prev.filter((u) => u.id !== txnId))
      await refreshData()
    } catch {
      setError('Could not save that decision — please try again.')
    } finally {
      setDeciding(null)
    }
  }

  const decideBatch = async (groupKey: string, linkIds: string[], verdict: 'confirmed' | 'rejected' | 'external') => {
    if (linkIds.length === 0) return
    setBatchBusy(groupKey)
    setError('')
    try {
      const { error: fnErr } = await supabase.functions.invoke('decide-transfer', {
        body: { link_ids: linkIds, verdict },
      })
      if (fnErr) throw fnErr
      const idSet = new Set(linkIds)
      setLinks((prev) => prev.filter((l) => !idSet.has(l.id)))
      await refreshData()
    } catch {
      setError('Could not save that batch — please try again.')
    } finally {
      setBatchBusy(null)
    }
  }

  const decideLegBatch = async (groupKey: string, txnIds: string[], verdict: 'rejected' | 'external') => {
    if (txnIds.length === 0) return
    setUnmatchedBatchBusy(groupKey)
    setError('')
    try {
      const { error: fnErr } = await supabase.functions.invoke('decide-transfer', {
        body: { txn_ids: txnIds, verdict },
      })
      if (fnErr) throw fnErr
      const idSet = new Set(txnIds)
      setUnmatched((prev) => prev.filter((u) => !idSet.has(u.id)))
      setUnmatchedTotal((prev) => Math.max(0, prev - txnIds.length))
      await refreshData()
    } catch {
      setError('Could not save that batch — please try again.')
    } finally {
      setUnmatchedBatchBusy(null)
    }
  }

  const toggleGroupExpanded = (key: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const toggleSelected = (id: string) =>
    setDeselected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleUnmatchedGroupExpanded = (key: string) =>
    setUnmatchedExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const toggleUnmatchedSelected = (id: string) =>
    setUnmatchedDeselected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (loading) return <p role="status" aria-live="polite" className="text-[13px] text-ink2">Loading transfer suggestions…</p>

  const suggested = links.filter((l) => l.state === 'suggested')
  const auto = links.filter((l) => l.state === 'auto')
  const { groups: suggestedGroups, groupless } = groupSuggested(suggested)
  const overflowSummary = summariseOverflow(overflow)

  if (links.length === 0 && unmatchedTotal === 0 && overflow.length === 0) {
    return (
      <div className="grid gap-3">
        <InvestmentCashLinker refreshKey={investmentRefreshKey} />
        <p className="text-[13px] text-muted">
          No internal transfers pending review. Import statements from more than one account
          to start finding them, or scan what's already in your ledger.
        </p>
        <div><Button variant="ghost" onClick={rescan} disabled={rescanning}>
          {rescanning ? 'Scanning…' : 'Scan your ledger for internal transfers'}
        </Button></div>
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <InvestmentCashLinker refreshKey={investmentRefreshKey} />
      {error && (
        <div role="alert" className="rounded-[10px] border border-[var(--color-neg)] bg-[var(--color-neg)]/5 px-3 py-2 text-[13px] text-[var(--color-neg)]">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted">
          {suggested.length > 0
            ? <>
                <strong className="text-ink">{suggested.length}</strong> transfer{suggested.length === 1 ? '' : 's'} need your review
                {suggestedGroups.length > 1 && <> across <strong className="text-ink">{suggestedGroups.length}</strong> account pairs</>}
              </>
            : 'Everything is reviewed.'}
        </p>
        <Button variant="ghost" onClick={rescan} disabled={rescanning}>
          {rescanning ? 'Scanning…' : 'Rescan ledger'}
        </Button>
      </div>

      {overflow.length > 0 && (
        <div className="rounded-[10px] border border-[var(--color-warn)] bg-[var(--color-warn)]/5 px-3 py-2.5 text-[12.5px] text-ink2">
          <strong className="text-ink">{overflowSummary.bucketCount}</strong> repetitive amount
          {overflowSummary.bucketCount === 1 ? ' group was' : ' groups were'} skipped rather than paired unsafely
          {' '}(<strong className="text-ink">{overflowSummary.legCount}</strong> transactions).{' '}
          <button
            onClick={() => setShowOverflow((shown) => !shown)}
            aria-expanded={showOverflow}
            className="inline-flex min-h-11 items-center px-1 font-semibold text-ink underline decoration-dotted"
          >
            {showOverflow ? 'Hide amounts' : `Review ${overflowSummary.bucketCount} amount ${overflowSummary.bucketCount === 1 ? 'group' : 'groups'}`}
          </button>
          <AnimatePresence>
            {showOverflow && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 grid gap-1 overflow-hidden border-t border-[var(--hair)] pt-2"
              >
                {overflow.map((bucket) => (
                  <div key={bucket.amount_cents}>
                    <strong className="text-ink">{fmtCents(bucket.amount_cents)}</strong>
                    {' · '}{bucket.leg_count} possible legs; the matcher left them unpaired and they may appear in Possible transfers below.
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {unmatchedTotal > 0 && (
        <div className="rounded-[10px] border border-[var(--color-warn)] bg-[var(--color-warn)]/5 px-3 py-2.5 text-[12.5px] text-ink2">
          <strong className="text-ink">{unmatchedTotal}</strong> transaction{unmatchedTotal === 1 ? '' : 's'} look{unmatchedTotal === 1 ? 's' : ''} like a transfer but no matching pair was found.
          They're counted as regular income or spending until you say otherwise.
          {unmatchedTotal > unmatched.length && (
            <> Showing the most recent {unmatched.length}.</>
          )}{' '}
          <button
            onClick={() => setShowUnmatched((s) => !s)}
            aria-expanded={showUnmatched}
            className="inline-flex min-h-11 items-center px-1 font-semibold text-ink underline decoration-dotted"
          >
            {showUnmatched ? 'Hide' : 'Review them'}
          </button>
        </div>
      )}

      {suggestedGroups.length > 0 && (
        <div className="grid gap-3">
          {suggestedGroups.map((group) => (
            <SuggestedGroupPanel
              key={group.key}
              group={group}
              accountName={accountName}
              expanded={expandedGroups.has(group.key)}
              onToggleExpand={() => toggleGroupExpanded(group.key)}
              deselected={deselected}
              onToggleSelect={toggleSelected}
              busy={batchBusy === group.key}
              onBulkDecide={(linkIds, v) => decideBatch(group.key, linkIds, v)}
            />
          ))}
        </div>
      )}

      {groupless.length > 0 && (
        <div className="grid gap-3">
          {groupless.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              accountName={accountName}
              busy={deciding === link.id}
              onDecide={(v) => decide(link.id, v)}
            />
          ))}
        </div>
      )}

      {auto.length > 0 && (
        <div className="grid gap-2">
          <button
            onClick={() => setShowAuto((s) => !s)}
            aria-expanded={showAuto}
            className="flex min-h-11 items-center gap-2 text-left text-[13px] font-medium text-muted transition hover:text-ink"
          >
            <span className={`transition-transform ${showAuto ? 'rotate-90' : ''}`}>›</span>
            Linked automatically ({auto.length})
          </button>
          <AnimatePresence>
            {showAuto && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="grid gap-2 overflow-hidden"
              >
                {auto.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--hair)] px-3 py-2 text-[12.5px]"
                  >
                    <span className="min-w-0 truncate text-muted">
                      {accountName(link.from_txn?.account_id ?? '')} → {accountName(link.to_txn?.account_id ?? '')}
                      {' · '}{link.from_txn ? fmtCents(Math.abs(link.from_txn.amount)) : ''}
                      {' · '}{link.from_txn?.date}
                    </span>
                    <button
                      onClick={() => decide(link.id, 'rejected')}
                      disabled={deciding === link.id}
                      className="min-h-11 flex-shrink-0 px-2 text-[13px] font-medium text-muted underline decoration-dotted transition hover:text-ink disabled:opacity-50"
                    >
                      Undo
                    </button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {unmatched.length > 0 && (
        <AnimatePresence>
          {showUnmatched && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid gap-3 overflow-hidden"
            >
              {groupUnmatched(unmatched).map((group) => (
                <UnmatchedGroupPanel
                  key={group.key}
                  group={group}
                  accountName={accountName}
                  expanded={unmatchedExpandedGroups.has(group.key)}
                  onToggleExpand={() => toggleUnmatchedGroupExpanded(group.key)}
                  deselected={unmatchedDeselected}
                  onToggleSelect={toggleUnmatchedSelected}
                  busy={unmatchedBatchBusy === group.key}
                  onBulkDecide={(txnIds, v) => decideLegBatch(group.key, txnIds, v)}
                  onSingleDecide={(txnId, v) => decideLeg(txnId, v)}
                  singleBusy={deciding}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  )
}

function SuggestedGroupPanel({
  group,
  accountName,
  expanded,
  onToggleExpand,
  deselected,
  onToggleSelect,
  busy,
  onBulkDecide,
}: {
  group: SuggestedGroup
  accountName: (id: string) => string
  expanded: boolean
  onToggleExpand: () => void
  deselected: Set<string>
  onToggleSelect: (id: string) => void
  busy: boolean
  onBulkDecide: (linkIds: string[], verdict: 'confirmed' | 'rejected') => void
}) {
  const nonAmbiguous = group.links.filter((l) => !l.ambiguous)
  const ambiguous = group.links.filter((l) => l.ambiguous)
  const selection = suggestedReviewSelection(group.links, deselected)
  const selectedIds = selection.selectedIds
  const total = group.links.reduce((sum, l) => sum + Math.abs(l.from_txn?.amount ?? 0), 0)

  return (
    <div className="rounded-[12px] border border-[var(--hair)] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <button onClick={onToggleExpand} aria-expanded={expanded} className="flex min-h-11 min-w-0 items-center gap-2 text-left">
          <span className={`flex-shrink-0 text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
          <span className="min-w-0 truncate">
            <span className="font-semibold text-ink">
              {accountName(group.fromAccountId)} ↔ {accountName(group.toAccountId)}
            </span>
            <span className="ml-2 text-[12.5px] text-muted">
              {group.links.length} transfer{group.links.length === 1 ? '' : 's'} · {fmtCents(total)}
            </span>
          </span>
        </button>
        <div className="flex flex-shrink-0 flex-wrap gap-2">
          {selectedIds.length > 0 ? <>
            <Button onClick={() => onBulkDecide(selectedIds, 'confirmed')} disabled={busy}>
              Confirm {selectedIds.length} internal transfer{selectedIds.length === 1 ? '' : 's'}
            </Button>
            <Button variant="ghost" onClick={() => onBulkDecide(selectedIds, 'rejected')} disabled={busy}>
              Count {selectedIds.length} as regular activity
            </Button>
          </> : (
            <Button variant="ghost" onClick={onToggleExpand} disabled={busy}>
              {selection.reviewLabel}
            </Button>
          )}
        </div>
      </div>

      {ambiguous.length > 0 && (
        <div className="px-4 pb-2 text-[12px] text-muted">
          {ambiguous.length} ambiguous match{ambiguous.length === 1 ? '' : 'es'} excluded from bulk actions — review individually.
        </div>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="grid gap-2 border-t border-[var(--hair)] px-4 py-3">
              {nonAmbiguous.map((link) => (
                <GroupItemRow
                  key={link.id}
                  link={link}
                  selected={!deselected.has(link.id)}
                  onToggle={() => onToggleSelect(link.id)}
                />
              ))}
              {ambiguous.map((link) => (
                <LinkCard
                  key={link.id}
                  link={link}
                  accountName={accountName}
                  busy={busy}
                  onDecide={(v) => onBulkDecide([link.id], v)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Compact opt-out row for a group's non-ambiguous members — no per-row
 *  decide buttons by design: uncheck what you don't want in this batch, act
 *  on the rest via the group header, and revisit anything left unchecked
 *  later (individually, or once it accumulates enough history of its own to
 *  cross the auto threshold on its own). */
function GroupItemRow({
  link,
  selected,
  onToggle,
}: {
  link: TransferLinkRow
  selected: boolean
  onToggle: () => void
}) {
  const from = link.from_txn
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] border border-[var(--hair)] px-3 py-2 text-[13px] transition hover:bg-black/[0.02]">
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="h-[15px] w-[15px] flex-shrink-0 accent-[var(--color-accent)]"
      />
      <span className="min-w-0 flex-1 truncate text-muted">
        {from?.date}
        {' · '}
        <span className={from && from.amount < 0 ? 'text-[var(--color-neg)]' : 'text-[var(--color-pos)]'}>
          {from ? fmtCents(from.amount) : ''}
        </span>
        {' · '}
        {from?.original_description || '—'}
      </span>
      <span className="flex flex-shrink-0 gap-1">
        {link.reasons.slice(0, 2).map((r) => (
          <span key={r} className="rounded-[6px] bg-black/[0.04] px-1.5 py-0.5 text-[11.5px] font-medium text-muted">
            {r}
          </span>
        ))}
      </span>
    </label>
  )
}

/** Same shape as SuggestedGroupPanel, adapted for lone legs: no ambiguous
 *  split (unmatched legs carry no score/reasons to be ambiguous about), and
 *  only the two verdicts decide_transfer_leg accepts. */
function UnmatchedGroupPanel({
  group,
  accountName,
  expanded,
  onToggleExpand,
  deselected,
  onToggleSelect,
  busy,
  onBulkDecide,
  onSingleDecide,
  singleBusy,
}: {
  group: UnmatchedGroup
  accountName: (id: string) => string
  expanded: boolean
  onToggleExpand: () => void
  deselected: Set<string>
  onToggleSelect: (id: string) => void
  busy: boolean
  onBulkDecide: (txnIds: string[], verdict: 'rejected' | 'external') => void
  onSingleDecide: (txnId: string, verdict: 'rejected' | 'external') => void
  singleBusy: string | null
}) {
  const selectedIds = group.rows.filter((r) => !deselected.has(r.id)).map((r) => r.id)
  const total = group.rows.reduce((sum, r) => sum + Math.abs(r.amount), 0)

  // A single-row group needs no checkbox/select ceremony — the two buttons
  // act on that one transaction directly, same as the old flat list did.
  if (group.rows.length === 1) {
    const u = group.rows[0]
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[var(--hair)] px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 text-[12.5px]">
            <span className="font-semibold text-ink">{accountName(u.account_id)}</span>
            <span className="text-muted">{u.date}</span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="min-w-0 truncate text-[12.5px] text-muted">{u.original_description || '—'}</span>
            <span className={`flex-shrink-0 text-[13px] font-semibold tabular-nums ${u.amount < 0 ? 'text-[var(--color-neg)]' : 'text-[var(--color-pos)]'}`}>
              {fmtCents(u.amount)}
            </span>
          </div>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <button
            onClick={() => onSingleDecide(u.id, 'external')}
            disabled={singleBusy === u.id}
            className="micro min-h-11 rounded-lg border border-[var(--hair)] px-3 py-2 text-[12px] font-semibold text-ink transition hover:bg-black/[0.03] disabled:opacity-50"
          >
            {untrackedTransferLabel(u.amount)}
          </button>
          <button
            onClick={() => onSingleDecide(u.id, 'rejected')}
            disabled={singleBusy === u.id}
            className="micro min-h-11 rounded-lg border border-[var(--hair)] px-3 py-2 text-[12px] font-semibold text-muted transition hover:bg-black/[0.03] disabled:opacity-50"
          >
            Count as regular activity
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[12px] border border-[var(--hair)] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <button onClick={onToggleExpand} aria-expanded={expanded} className="flex min-h-11 min-w-0 items-center gap-2 text-left">
          <span className={`flex-shrink-0 text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
          <span className="min-w-0 truncate">
            <span className="font-semibold text-ink">{group.label}</span>
            <span className="ml-2 text-[12.5px] text-muted">
              {group.rows.length} transaction{group.rows.length === 1 ? '' : 's'} · {fmtCents(total)}
            </span>
          </span>
        </button>
        {selectedIds.length > 0 && (
          <div className="flex flex-shrink-0 flex-wrap gap-2">
            <Button variant="ghost" onClick={() => onBulkDecide(selectedIds, 'external')} disabled={busy}>
              Transfer to/from an untracked account ({selectedIds.length})
            </Button>
            <Button variant="ghost" onClick={() => onBulkDecide(selectedIds, 'rejected')} disabled={busy}>
              Count as regular activity ({selectedIds.length})
            </Button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="grid gap-2 border-t border-[var(--hair)] px-4 py-3">
              {group.rows.map((u) => (
                <label
                  key={u.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] border border-[var(--hair)] px-3 py-2 text-[13px] transition hover:bg-black/[0.02]"
                >
                  <input
                    type="checkbox"
                    checked={!deselected.has(u.id)}
                    onChange={() => onToggleSelect(u.id)}
                    className="h-[15px] w-[15px] flex-shrink-0 accent-[var(--color-accent)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {accountName(u.account_id)}
                    {' · '}
                    {u.date}
                    {' · '}
                    <span className={u.amount < 0 ? 'text-[var(--color-neg)]' : 'text-[var(--color-pos)]'}>
                      {fmtCents(u.amount)}
                    </span>
                    {' · '}
                    {u.original_description || '—'}
                  </span>
                </label>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function LinkCard({
  link,
  accountName,
  busy,
  onDecide,
}: {
  link: TransferLinkRow
  accountName: (id: string) => string
  busy: boolean
  onDecide: (verdict: 'confirmed' | 'rejected') => void
}) {
  const { from_txn: from, to_txn: to } = link
  return (
    <div className="rounded-[12px] border border-[var(--hair)] p-4">
      {link.ambiguous && (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-[8px] bg-[var(--color-warn)]/10 px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--color-warn)]">
          Multiple similar transfers found — check carefully
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TxnLeg txn={from} accountName={from ? accountName(from.account_id) : '—'} />
        <TxnLeg txn={to} accountName={to ? accountName(to.account_id) : '—'} />
      </div>
      {link.reasons.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {link.reasons.map((r) => (
            <span
              key={r}
              className="rounded-[6px] bg-black/[0.04] px-2 py-0.5 text-[11.5px] font-medium text-muted"
            >
              {r}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3.5 flex flex-wrap gap-2">
        <Button onClick={() => onDecide('confirmed')} disabled={busy}>Confirm internal transfer</Button>
        <Button variant="ghost" onClick={() => onDecide('rejected')} disabled={busy}>Count as regular activity</Button>
      </div>
    </div>
  )
}

function TxnLeg({ txn, accountName }: { txn: LinkedTxn | null; accountName: string }) {
  if (!txn) return <div className="rounded-[8px] border border-[var(--hair-soft)] p-2.5 text-[12.5px] text-muted">Missing leg</div>
  return (
    <div className="rounded-[8px] border border-[var(--hair-soft)] p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold text-ink">{accountName}</span>
        <span className="text-[12px] tabular-nums text-muted">{txn.date}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[12.5px] text-muted">{txn.original_description || '—'}</span>
        <span className={`flex-shrink-0 text-[13px] font-semibold tabular-nums ${txn.amount < 0 ? 'text-[var(--color-neg)]' : 'text-[var(--color-pos)]'}`}>
          {fmtCents(txn.amount)}
        </span>
      </div>
    </div>
  )
}
