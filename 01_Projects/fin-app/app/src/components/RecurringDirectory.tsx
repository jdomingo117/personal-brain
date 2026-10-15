import { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Tile from './Tile'
import { useScrollIdle } from '../hooks/useScrollIdle'
import { dayLabel, TODAY } from '../lib/period'
import { upcomingCharges, type RecurringSection, type Series, type RecurringCandidate } from '../lib/recurring'
import { fmt, glowColor } from '../data'
import RecurringSeriesDialog from './RecurringSeriesDialog'
import { supabase } from '../lib/supabaseClient'

type WatchFilter = 'all' | 'reminders' | 'renewing' | 'price-change' | 'dormant' | 'candidates'

type WatchItem = {
  id: Exclude<WatchFilter, 'all'>
  title: string
  detail: string
  tone: 'warn' | 'neg' | 'muted' | 'accent'
  action: string
}

const daysFromToday = (date: string) =>
  Math.round(
    (new Date(`${date}T00:00:00`).getTime() - new Date(`${TODAY}T00:00:00`).getTime()) / 86400000,
  )

const commitmentLabel = (count: number) => `${count} commitment${count === 1 ? '' : 's'}`

const isRenewingSoon = (series: Series) => {
  if (series.status !== 'active') return false
  const days = daysFromToday(series.nextExpected)
  return days >= 0 && days <= 14
}

const isReminderDue = (series: Series) => {
  if (series.status !== 'active' || series.reminderDaysBefore === null) return false
  const days = daysFromToday(series.nextExpected)
  return days >= 0 && days <= series.reminderDaysBefore
}

/* The commitments directory — every detected standing charge, sectioned by
   category with sub-totals that reconcile to the hero card by construction (both
   read `monthly` off the same model; see buildRecurring).

   Equipped with:
   1. Search and Status/Kind quick-filters.
   2. Expandable row detail drawer with recent charge history.
   3. Hover & selection linking for cross-highlighting (directory ↔ accounts ↔ calendar).
*/

function KindGlyph({ kind, cv }: { kind: Series['kind']; cv: number }) {
  const title =
    kind === 'fixed'
      ? `Fixed — the amount barely moves (σ/μ ${Math.round(cv * 100)}%)`
      : `Variable — same cadence, amount varies (σ/μ ${Math.round(cv * 100)}%)`
  return (
    <span className="inline-flex items-center gap-1.5" title={title}>
      <svg width="14" height="8" viewBox="0 0 14 8" aria-hidden="true">
        {kind === 'fixed' ? (
          <rect x="0" y="3" width="14" height="2" rx="1" fill="var(--color-ink2)" />
        ) : (
          <g fill="var(--color-ink2)">
            <rect x="0" y="3" width="4" height="2" rx="1" />
            <rect x="5.5" y="3" width="3" height="2" rx="1" opacity="0.65" />
            <rect x="10" y="3" width="4" height="2" rx="1" opacity="0.4" />
          </g>
        )}
      </svg>
            <span className="detail-copy">{kind === 'fixed' ? 'Fixed' : 'Variable'}</span>
    </span>
  )
}

function Row({
  s,
  isFocused,
  isHovered,
  onFocus,
  onHover,
  onManage,
  isHighlightedByCalendar,
  hoveredAccount,
}: {
  s: Series
  isFocused: boolean
  isHovered: boolean
  onFocus: () => void
  onHover: (hovered: boolean) => void
  onManage: () => void
  isHighlightedByCalendar: boolean
  hoveredAccount: string | null
}) {
  const dormant = s.status === 'dormant'
  const isDimmedByAccountHover = hoveredAccount !== null && s.fundingAccount !== hoveredAccount
  
  // Highlight state: active focus, active hover, or calendar selection
  const highlightClass = isFocused
    ? 'bg-accent/10 dark:bg-accent/15 border-l-2 border-accent pl-3'
    : isHovered || isHighlightedByCalendar || (hoveredAccount && !isDimmedByAccountHover)
    ? 'bg-black/[0.02] dark:bg-white/[0.02] px-3 border-l border-transparent'
    : 'px-3 border-l border-transparent'

  // Active only — a dormant series' "next" date is already fiction, no point
  // also claiming it's about to renew.
  const daysUntilRenewal = !dormant
    ? Math.round((new Date(`${s.nextExpected}T00:00:00`).getTime() - new Date(`${TODAY}T00:00:00`).getTime()) / 86400000)
    : null
  const renewsSoon = daysUntilRenewal !== null && daysUntilRenewal >= 0 && daysUntilRenewal <= 14
  const reminderDue = isReminderDue(s)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={isFocused}
      aria-controls={`commitment-detail-${s.id}`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onFocus}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onFocus()
        }
      }}
      className={`group w-full cursor-pointer rounded-lg py-4 text-left transition-all duration-200 border-t border-[var(--hair-soft)] ${highlightClass} ${
        (dormant && !isFocused) || isDimmedByAccountHover ? 'opacity-30 scale-[0.99]' : 'opacity-100 scale-100'
      }`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1.5fr)_auto_auto_auto]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: dormant ? 'var(--color-muted)' : 'var(--color-accent)' }}
              aria-hidden="true"
            />
            <span className="truncate text-[15px] font-semibold text-ink" title={s.merchant}>
              {s.label}
            </span>
          </div>
          <div className="mt-1.5 pl-3.5 text-[14px] leading-5 text-muted">
            {s.subcat} · {dormant ? `last ${dayLabel(s.lastCharged)}` : `next ${dayLabel(s.nextExpected)}`}
            {renewsSoon && (
              <span className="ml-1.5 font-semibold text-warn">
                · renews {daysUntilRenewal === 0 ? 'today' : `in ${daysUntilRenewal}d`}
              </span>
            )}
            {reminderDue && (
              <span className="ml-1.5 font-semibold text-accent-ink">· reminder due</span>
            )}
          </div>
        </div>

        <div className="hidden sm:block">
          <span
            className="rounded-md border border-[var(--hair-soft)] px-1.5 py-0.5 text-[12px] text-muted"
            title={
              s.confidence === 'high'
                ? `${s.charges.length} charges, ~${Math.round(s.medianGap)}d apart`
                : `${s.charges.length} charges only — cadence inferred from a thin series`
            }
          >
            {s.cadence}
            {s.confidence !== 'high' && <span className="text-faint"> ?</span>}
          </span>
        </div>

        <div className="hidden sm:block">
          <KindGlyph kind={s.kind} cv={s.amountCv} />
        </div>

        <div className="text-right">
          <div className="flex items-center justify-end gap-2 text-[15px] font-semibold tabular-nums text-ink">
            {fmt(s.expected)}
            <span aria-hidden="true" className={`text-[15px] text-muted transition-transform ${isFocused ? 'rotate-180' : ''}`}>⌄</span>
          </div>
          {s.cadence !== 'Monthly' && (
            <div className="text-[12px] tabular-nums text-muted">{fmt(s.monthly)}/mo</div>
          )}
        </div>
      </div>

      {/* Expandable History Drawer */}
      <AnimatePresence initial={false}>
        {isFocused && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div id={`commitment-detail-${s.id}`} className="mt-3 pl-3.5 border-l border-[var(--color-accent)] py-1 select-none">
              <div className="field-label mb-3">
                Commitment Details & History
              </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-[14px] font-semibold text-ink2">Recent charges</div>
                  <div className="space-y-1.5">
                    {s.charges.slice(-3).reverse().map((c, i) => (
                      <div key={i} className="flex justify-between text-[12px] tabular-nums pr-4">
                        <span className="text-muted">{dayLabel(c.date)}</span>
                        <span className="text-ink font-semibold">{fmt(c.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2 text-[12px]">
                  <div className="mb-2 text-[14px] font-semibold text-ink2">Detection details</div>
                  <div>
                    <span className="text-muted">Confidence:</span>{' '}
                    <span className={`font-bold uppercase text-[10px] px-1.5 py-0.5 rounded ${
                      s.confidence === 'high' ? 'bg-pos/10 text-pos' : s.confidence === 'medium' ? 'bg-warn/10 text-warn' : 'bg-faint/20 text-muted'
                    }`}>{s.confidence}</span>
                  </div>
                  <div>
                    <span className="text-muted">Interval:</span>{' '}
                    <span className="font-semibold text-ink">{Math.round(s.medianGap)} days</span>
                  </div>
                  <div>
                    <span className="text-muted">Variance (CV):</span>  {' '}
                    <span className="font-semibold text-ink">{Math.round(s.amountCv * 100)}%</span>
                  </div>
                  <div>
                    <span className="text-muted">Source Account:</span>{' '}
                    <span className="font-semibold text-ink2">{s.fundingAccount}</span>
                  </div>
                  {s.priceChange && (
                    <div>
                      <span className="text-muted">Price change:</span>{' '}
                      <span className="font-semibold text-warn">
                        {fmt(s.priceChange.from)} → {fmt(s.priceChange.to)} since {dayLabel(s.priceChange.date)}
                      </span>
                    </div>
                  )}
                  {s.reminderDaysBefore !== null && (
                    <div>
                      <span className="text-muted">Reminder:</span>{' '}
                      <span className="font-semibold text-ink">{s.reminderDaysBefore === 0 ? 'on the day' : `${s.reminderDaysBefore} day${s.reminderDaysBefore === 1 ? '' : 's'} before`}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); onManage() }}
                    className="mt-2 rounded-md border border-[var(--hair)] px-2.5 py-1.5 text-[12px] font-semibold text-accent-ink transition hover:bg-[var(--accent-wash)]"
                  >
                    {s.trackingState === 'stopped' || s.trackingState === 'dismissed' ? 'Manage / resume' : 'Manage commitment'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** An early recurring signal: either an AI hint with thin history or two
 * annual-sized ledger charges. Styled deliberately unlike `Row` — dashed
 * border, no dollar figure presented as an obligation, and cautious language
 * throughout — so it reads as a heads-up, never a confirmed commitment.
 * Read-only: no accept/dismiss action in this pass. */
function CandidateRow({ c }: { c: RecurringCandidate }) {
  const lastCharge = c.charges[c.charges.length - 1]
  const isAnnualEvidence = c.source === 'annual_evidence'
  return (
    <div className="rounded-lg border border-dashed border-[var(--hair)] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full border border-dashed border-muted"
              aria-hidden="true"
            />
            <span className="truncate text-[14px] font-semibold text-ink2" title={c.merchant}>
              {c.label}
            </span>
          </div>
          <div className="mt-1 pl-3.5 text-[12px] text-muted">
            {isAnnualEvidence
              ? `${c.subcat} · 2 annual-sized charges · one more renewal confirms`
              : `${c.subcat} · ${c.charges.length} charge${c.charges.length === 1 ? '' : 's'} so far · last ${dayLabel(c.lastCharged)}`}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-accent-ink">
            {isAnnualEvidence ? 'possible annual commitment' : c.suggestedCadence ? `likely ${c.suggestedCadence}` : 'possible commitment'}
          </div>
          <div className="text-[12px] tabular-nums text-muted">
            {isAnnualEvidence ? `last ${fmt(lastCharge.amount)}` : `${Math.round(c.confidence * 100)}% confidence · last ${fmt(lastCharge.amount)}`}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RecurringDirectory({
  sections,
  candidates,
  monthlyCommitment,
  boundsLabel,
  focusedSeriesId,
  onFocusSeries,
  hoveredSeriesId,
  onHoverSeries,
  hoveredDate,
  hoveredAccount,
  untracked,
  onChanged,
}: {
  sections: RecurringSection[]
  candidates: RecurringCandidate[]
  monthlyCommitment: number
  boundsLabel: string
  focusedSeriesId: string | null
  onFocusSeries: (id: string | null) => void
  hoveredSeriesId: string | null
  onHoverSeries: (id: string | null) => void
  hoveredDate: string | null
  hoveredAccount: string | null
  untracked: Series[]
  onChanged: () => Promise<void>
}) {
  const scrollRef = useScrollIdle<HTMLDivElement>()
  
  // Filters state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'dormant'>('all')
  const [kindFilter, setKindFilter] = useState<'all' | 'fixed' | 'variable'>('all')
  const [watchFilter, setWatchFilter] = useState<WatchFilter>('all')
  const [managingSeries, setManagingSeries] = useState<Series | null>(null)
  const [lastUndoEventId, setLastUndoEventId] = useState<string | null>(null)
  const [undoError, setUndoError] = useState('')
  const [undoing, setUndoing] = useState(false)
  const reviewFocusRef = useRef<HTMLDivElement>(null)

  const undoLastChange = async () => {
    if (!lastUndoEventId) return
    setUndoing(true); setUndoError('')
    const { error } = await supabase.functions.invoke('manage-recurring-series', {
      body: { action: 'undo', event_id: lastUndoEventId },
    })
    setUndoing(false)
    if (error) { setUndoError(error.message || 'Could not undo this recurring change.'); return }
    setLastUndoEventId(null)
    await onChanged()
  }

  const allSeries = useMemo(() => sections.flatMap((section) => section.rows), [sections])
  const renewingSoon = useMemo(
    () => allSeries.filter(isRenewingSoon),
    [allSeries],
  )
  const remindersDue = useMemo(() => allSeries.filter(isReminderDue), [allSeries])
  const priceChanged = useMemo(
    () => allSeries.filter((series) => series.status === 'active' && !!series.priceChange),
    [allSeries],
  )

  // A short exception queue earns the directory's otherwise empty lower area.
  // It intentionally excludes ordinary upcoming payments: the calendar already
  // owns the complete timing view. Each item can narrow the directory to the
  // relevant records rather than opening a competing detail surface.
  const watchItems = useMemo<WatchItem[]>(() => {
    const items: WatchItem[] = []
    if (remindersDue.length) {
      items.push({
        id: 'reminders',
        title: `${commitmentLabel(remindersDue.length)} needs a reminder`,
        detail: 'Your chosen reminder window is now open.',
        tone: 'accent',
        action: `View ${remindersDue.length} reminder${remindersDue.length === 1 ? '' : 's'}`,
      })
    }
    if (renewingSoon.length) {
      items.push({
        id: 'renewing',
        title: `${commitmentLabel(renewingSoon.length)} renewing within 14 days`,
        detail: 'Check the upcoming expected charges before they land.',
        tone: 'warn',
        action: `View ${renewingSoon.length} upcoming`,
      })
    }
    if (priceChanged.length) {
      items.push({
        id: 'price-change',
        title: `${commitmentLabel(priceChanged.length)} with a price change`,
        detail: 'Compare the current charge with the earlier pattern.',
        tone: 'neg',
        action: 'Compare charges',
      })
    }
    if (allSeries.some((series) => series.status === 'dormant')) {
      const dormantCount = allSeries.filter((series) => series.status === 'dormant').length
      items.push({
        id: 'dormant',
        title: `${dormantCount} dormant ${dormantCount === 1 ? 'commitment' : 'commitments'}`,
        detail: 'Review patterns that have stopped charging.',
        tone: 'muted',
        action: 'View dormant',
      })
    }
    if (candidates.length) {
      items.push({
        id: 'candidates',
        title: `${candidates.length} possible new ${candidates.length === 1 ? 'commitment' : 'commitments'}`,
        detail: 'More charge history is needed before they are counted.',
        tone: 'accent',
        action: 'Inspect candidates',
      })
    }
    return items.slice(0, 3)
  }, [allSeries, candidates.length, priceChanged.length, remindersDue.length, renewingSoon.length])

  const applyWatch = (id: WatchItem['id']) => {
    setSearchQuery('')
    setKindFilter('all')
    onFocusSeries(null)
    setStatusFilter('all')
    setWatchFilter(id)
    // The watchlist sits below the directory. Without moving the viewport, a
    // successful filter can look like a no-op because its result and review
    // context are above the user's current scroll position.
    window.requestAnimationFrame(() => {
      reviewFocusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      reviewFocusRef.current?.focus({ preventScroll: true })
    })
  }

  // Filter sections and rows
  const filteredSections = useMemo(() => {
    return sections
      .map((sec) => {
        const rows = sec.rows.filter((s) => {
          const query = searchQuery.toLowerCase().trim()
          const matchQuery =
            !query ||
            s.label.toLowerCase().includes(query) ||
            s.merchant.toLowerCase().includes(query) ||
            s.cat.toLowerCase().includes(query) ||
            s.subcat.toLowerCase().includes(query)

          const matchStatus = statusFilter === 'all' || s.status === statusFilter
          const matchKind = kindFilter === 'all' || s.kind === kindFilter
          const matchWatch =
            watchFilter === 'all' ||
            (watchFilter === 'reminders' && isReminderDue(s)) ||
            (watchFilter === 'renewing' && isRenewingSoon(s)) ||
            (watchFilter === 'price-change' && s.status === 'active' && !!s.priceChange) ||
            (watchFilter === 'dormant' && s.status === 'dormant')

          return matchQuery && matchStatus && matchKind && matchWatch
        })

        const activeRows = rows.filter((s) => s.status === 'active')
        return {
          ...sec,
          rows,
          monthly: activeRows.reduce((a, s) => a + s.monthly, 0),
          count: activeRows.length,
        }
      })
      .filter((sec) => sec.rows.length > 0)
  }, [sections, searchQuery, statusFilter, kindFilter, watchFilter])

  // Total active commitment for matching filtered items
  const totalCommitment = useMemo(() => {
    return filteredSections.reduce((a, sec) => a + sec.monthly, 0)
  }, [filteredSections])

  const visibleCandidates = watchFilter === 'all' || watchFilter === 'candidates' ? candidates : []
  const empty = filteredSections.length === 0 && visibleCandidates.length === 0
  const activeWatch = watchFilter === 'all' ? null : watchItems.find((item) => item.id === watchFilter) ?? null

  return (
    <>
    <Tile title="Commitments directory" tag={boundsLabel} className="flex flex-col">
      {/* Toolbar */}
      <div ref={reviewFocusRef} tabIndex={-1} className="mb-4 flex flex-col gap-2.5 outline-none">
        {lastUndoEventId && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pos/30 bg-pos/5 px-3 py-2 text-[13px] text-ink2" role="status">
            <span>Recurring commitment updated.</span>
            <button type="button" disabled={undoing} onClick={undoLastChange} className="font-bold text-accent-ink hover:underline disabled:opacity-50">{undoing ? 'Undoing…' : 'Undo'}</button>
          </div>
        )}
        {undoError && <p className="rounded-lg border border-neg/30 bg-neg/5 p-3 text-[13px] text-neg" role="alert">{undoError}</p>}
        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search commitments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] py-2 pl-8 pr-3 text-[14px] text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-[var(--accent-wash)]"
          />
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>

        {/* Filter Badges */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">Status</span>
            <div className="flex rounded-md border border-[var(--hair-soft)] bg-black/[0.01] dark:bg-white/[0.01] p-0.5">
            {(['all', 'active', 'dormant'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`rounded px-2 py-1 text-[11px] font-bold uppercase tracking-wider transition cursor-pointer border-none ${
                  statusFilter === st
                    ? 'bg-accent text-white dark:text-bar shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {st}
              </button>
            ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">Type</span>
            <div className="flex rounded-md border border-[var(--hair-soft)] bg-black/[0.01] dark:bg-white/[0.01] p-0.5">
            {(['all', 'fixed', 'variable'] as const).map((kd) => (
              <button
                key={kd}
                onClick={() => setKindFilter(kd)}
                className={`rounded px-2 py-1 text-[11px] font-bold uppercase tracking-wider transition cursor-pointer border-none ${
                  kindFilter === kd
                    ? 'bg-accent text-white dark:text-bar shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {kd}
              </button>
            ))}
            </div>
          </div>
        </div>
        {activeWatch && (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--accent-wash)] bg-accent/5 px-3 py-2.5" role="status">
            <div className="min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-accent-ink">Reviewing</span>
              <p className="mt-0.5 truncate text-[13px] font-semibold text-ink">{activeWatch.title}</p>
              <p className="mt-0.5 text-[12px] text-muted">{activeWatch.detail}</p>
            </div>
            <button
              type="button"
              onClick={() => setWatchFilter('all')}
              className="shrink-0 border-none bg-transparent text-[12px] font-bold text-accent-ink hover:underline cursor-pointer"
            >
              Back to all
            </button>
          </div>
        )}
      </div>

      {empty ? (
        <p className="py-10 text-center body-copy flex-1">
          No matching commitments found.
        </p>
      ) : (
        <>
          <div ref={scrollRef} className="scroll-region min-h-0 flex-1 overflow-y-auto pr-1.5" style={{ maxHeight: 480 }}>
            {filteredSections.map((sec) => (
              <section key={sec.cat} className="mb-4">
                <header className="flex items-baseline justify-between gap-3 pb-1.5 pt-2">
                  <h4 className="text-[14px] font-bold text-ink">
                    {sec.cat}
                    <span className="ml-1.5 font-semibold text-faint">{sec.count}</span>
                  </h4>
                  <span className="text-[13px] font-semibold tabular-nums text-muted">
                    {fmt(sec.monthly)}/mo
                  </span>
                </header>
                <div className="flex flex-col gap-1.5">
                  {sec.rows.map((s) => {
                    const isHighlightedByCalendar = !!hoveredDate && upcomingCharges(s, hoveredDate, hoveredDate).length > 0
                    return (
                      <Row
                        key={s.id}
                        s={s}
                        isFocused={focusedSeriesId === s.id}
                        isHovered={hoveredSeriesId === s.id}
                        isHighlightedByCalendar={isHighlightedByCalendar}
                        hoveredAccount={hoveredAccount}
                        onFocus={() => {
                          if (focusedSeriesId === s.id) {
                            onFocusSeries(null)
                          } else {
                            onFocusSeries(s.id)
                          }
                        }}
                        onHover={(hovering) => onHoverSeries(hovering ? s.id : null)}
                        onManage={() => setManagingSeries(s)}
                      />
                    )
                  })}
                </div>
              </section>
            ))}

            {visibleCandidates.length > 0 && (
              <section className="mb-4">
                <header className="flex items-baseline justify-between gap-3 pb-1.5 pt-2">
                  <h4 className="text-[14px] font-bold text-ink2">
                    Early recurring signals
                    <span className="ml-1.5 font-semibold text-faint">{visibleCandidates.length}</span>
                  </h4>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Need more evidence</span>
                </header>
                <p className="pb-3 body-copy">
                  Not counted in any total above — AI hints and two annual-sized charges stay here until the detector can confirm them.
                </p>
                <div className="flex flex-col gap-1.5">
                  {visibleCandidates.map((c) => (
                    <CandidateRow key={c.id} c={c} />
                  ))}
                </div>
              </section>
            )}

            {untracked.length > 0 && watchFilter === 'all' && (
              <section className="mb-4 border-t border-[var(--hair)] pt-3">
                <header className="flex items-baseline justify-between gap-3 pb-1.5">
                  <h4 className="text-[14px] font-bold text-ink2">Not tracking</h4>
                  <span className="text-[12px] font-semibold text-muted">{untracked.length}</span>
                </header>
                <p className="pb-3 detail-copy">Excluded from totals and the billing calendar until resumed.</p>
                <div className="flex flex-col gap-1.5">
                  {untracked.map((s) => (
                    <Row
                      key={s.id}
                      s={s}
                      isFocused={focusedSeriesId === s.id}
                      isHovered={hoveredSeriesId === s.id}
                      isHighlightedByCalendar={false}
                      hoveredAccount={hoveredAccount}
                      onFocus={() => onFocusSeries(focusedSeriesId === s.id ? null : s.id)}
                      onHover={(hovering) => onHoverSeries(hovering ? s.id : null)}
                      onManage={() => setManagingSeries(s)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>

          <footer className="mt-2 flex items-baseline justify-between gap-3 border-t border-[var(--hair)] pt-3">
            <span className="text-[14px] font-bold text-ink">Total filtered active</span>
            <span className="text-[16px] font-bold tabular-nums text-ink">{fmt(totalCommitment)}/mo</span>
          </footer>

          <section className="mt-5 border-t border-[var(--hair)] pt-4" aria-labelledby="commitment-watchlist-title">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <div>
                <h4 id="commitment-watchlist-title" className="text-[16px] font-bold text-ink">Commitment watchlist</h4>
                <p className="mt-1.5 body-copy">A short review queue from your detected patterns.</p>
              </div>
              {watchItems.length > 0 && <span className="text-[13px] font-semibold tabular-nums text-muted">{watchItems.length}</span>}
            </div>

            {watchItems.length > 0 ? (
              <div className="divide-y divide-[var(--hair-soft)]">
                {watchItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applyWatch(item.id)}
                    className="group flex w-full items-center gap-3 py-3 text-left transition hover:bg-black/[0.02] dark:hover:bg-white/[0.025] cursor-pointer border-x-0 border-y-0 bg-transparent"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        item.tone === 'warn'
                          ? 'bg-warn'
                          : item.tone === 'neg'
                          ? 'bg-neg'
                          : item.tone === 'accent'
                          ? 'bg-accent'
                          : 'bg-muted'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-ink">{item.title}</span>
                      <span className="mt-1 block body-copy">{item.detail}</span>
                    </span>
                    <span className="shrink-0 text-[13px] font-bold text-accent-ink group-hover:underline">{item.action} →</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="py-3 body-copy">No recurring changes need attention.</p>
            )}
          </section>
        </>
      )}
    </Tile>
    {managingSeries && (
      <RecurringSeriesDialog
        series={managingSeries}
        onClose={() => setManagingSeries(null)}
        onChanged={onChanged}
        onSaved={(eventId) => { setLastUndoEventId(eventId); setUndoError('') }}
      />
    )}
    </>
  )
}
