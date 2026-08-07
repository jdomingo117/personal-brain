import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Tile from './Tile'
import { useScrollIdle } from '../hooks/useScrollIdle'
import { dayLabel, TODAY } from '../lib/period'
import { upcomingCharges, type RecurringSection, type Series, type RecurringCandidate } from '../lib/recurring'
import { fmt, glowColor } from '../data'

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
      <span className="text-[11px] text-muted">{kind === 'fixed' ? 'Fixed' : 'Variable'}</span>
    </span>
  )
}

function Row({
  s,
  isFocused,
  isHovered,
  onFocus,
  onHover,
  isHighlightedByCalendar,
  hoveredAccount,
}: {
  s: Series
  isFocused: boolean
  isHovered: boolean
  onFocus: () => void
  onHover: (hovered: boolean) => void
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

  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={(e) => {
        onFocus()
      }}
      className={`group cursor-pointer rounded-lg py-3.5 transition-all duration-200 border-t border-[var(--hair-soft)] ${highlightClass} ${
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
            <span className="truncate text-[13px] font-semibold text-ink" title={s.merchant}>
              {s.label}
            </span>
          </div>
          <div className="mt-1 pl-3.5 text-[11px] text-muted">
            {s.subcat} · {dormant ? `last ${dayLabel(s.lastCharged)}` : `next ${dayLabel(s.nextExpected)}`}
            {renewsSoon && (
              <span className="ml-1.5 font-semibold text-warn">
                · renews {daysUntilRenewal === 0 ? 'today' : `in ${daysUntilRenewal}d`}
              </span>
            )}
          </div>
        </div>

        <div className="hidden sm:block">
          <span
            className="rounded-md border border-[var(--hair-soft)] px-1.5 py-0.5 text-[11px] text-muted"
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
          <div className="text-[13px] font-semibold tabular-nums text-ink">
            {fmt(s.expected)}
          </div>
          {s.cadence !== 'Monthly' && (
            <div className="text-[11px] tabular-nums text-muted">{fmt(s.monthly)}/mo</div>
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
            <div className="mt-3 pl-3.5 border-l border-[var(--color-accent)] py-1 select-none">
              <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-2">
                Commitment Details & History
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] font-semibold text-ink2 mb-1">Recent Charges</div>
                  <div className="space-y-1">
                    {s.charges.slice(-3).reverse().map((c, i) => (
                      <div key={i} className="flex justify-between text-[11px] tabular-nums pr-4">
                        <span className="text-muted">{dayLabel(c.date)}</span>
                        <span className="text-ink font-semibold">{fmt(c.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-[11px] space-y-1.5">
                  <div className="text-[11px] font-semibold text-ink2 mb-1">Detection Stats</div>
                  <div>
                    <span className="text-muted">Confidence:</span>{' '}
                    <span className={`font-bold uppercase text-[9px] px-1.5 py-0.5 rounded ${
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
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** A merchant the AI hint recognises as a likely subscription but the
 *  deterministic detector hasn't confirmed yet (only 1-2 charges). Styled
 *  deliberately unlike `Row` — dashed border, no dollar figure presented as
 *  an obligation, "likely" language throughout — so it reads as a heads-up,
 *  never as a confirmed commitment. Read-only: no accept/dismiss action in
 *  this pass. */
function CandidateRow({ c }: { c: RecurringCandidate }) {
  const lastCharge = c.charges[c.charges.length - 1]
  return (
    <div className="rounded-lg border border-dashed border-[var(--hair)] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full border border-dashed border-muted"
              aria-hidden="true"
            />
            <span className="truncate text-[13px] font-semibold text-ink2" title={c.merchant}>
              {c.label}
            </span>
          </div>
          <div className="mt-1 pl-3.5 text-[11px] text-muted">
            {c.subcat} · {c.charges.length} charge{c.charges.length === 1 ? '' : 's'} so far · last {dayLabel(c.lastCharged)}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-accent-ink">
            {c.suggestedCadence ? `likely ${c.suggestedCadence}` : 'possible commitment'}
          </div>
          <div className="text-[11px] tabular-nums text-muted">
            {Math.round(c.confidence * 100)}% confidence · last {fmt(lastCharge.amount)}
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
}) {
  const scrollRef = useScrollIdle<HTMLDivElement>()
  
  // Filters state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'dormant'>('all')
  const [kindFilter, setKindFilter] = useState<'all' | 'fixed' | 'variable'>('all')

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

          return matchQuery && matchStatus && matchKind
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
  }, [sections, searchQuery, statusFilter, kindFilter])

  // Total active commitment for matching filtered items
  const totalCommitment = useMemo(() => {
    return filteredSections.reduce((a, sec) => a + sec.monthly, 0)
  }, [filteredSections])

  const empty = filteredSections.length === 0 && candidates.length === 0

  return (
    <Tile title="Commitments directory" tag={boundsLabel} className="flex flex-col">
      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-2.5">
        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search commitments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] py-1.5 pl-8 pr-3 text-[12px] text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-[var(--accent-wash)]"
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-[var(--hair-soft)] bg-black/[0.01] dark:bg-white/[0.01] p-0.5">
            {(['all', 'active', 'dormant'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition cursor-pointer border-none ${
                  statusFilter === st
                    ? 'bg-accent text-white dark:text-bar shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
          <div className="flex rounded-md border border-[var(--hair-soft)] bg-black/[0.01] dark:bg-white/[0.01] p-0.5">
            {(['all', 'fixed', 'variable'] as const).map((kd) => (
              <button
                key={kd}
                onClick={() => setKindFilter(kd)}
                className={`rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition cursor-pointer border-none ${
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

      {empty ? (
        <p className="py-10 text-center text-[13px] text-muted flex-1">
          No matching commitments found.
        </p>
      ) : (
        <>
          <div ref={scrollRef} className="scroll-region min-h-0 flex-1 overflow-y-auto pr-1.5" style={{ maxHeight: 480 }}>
            {filteredSections.map((sec) => (
              <section key={sec.cat} className="mb-4">
                <header className="flex items-baseline justify-between gap-3 pb-1.5 pt-2">
                  <h4 className="text-[12px] font-bold text-ink">
                    {sec.cat}
                    <span className="ml-1.5 font-semibold text-faint">{sec.count}</span>
                  </h4>
                  <span className="text-[11px] font-semibold tabular-nums text-muted">
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
                      />
                    )
                  })}
                </div>
              </section>
            ))}

            {candidates.length > 0 && (
              <section className="mb-4">
                <header className="flex items-baseline justify-between gap-3 pb-1.5 pt-2">
                  <h4 className="text-[12px] font-bold text-ink2">
                    Possible new commitments
                    <span className="ml-1.5 font-semibold text-faint">{candidates.length}</span>
                  </h4>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">AI hint</span>
                </header>
                <p className="pb-2 text-[11px] text-muted">
                  Not counted in any total above — too few charges yet for the detector to confirm.
                </p>
                <div className="flex flex-col gap-1.5">
                  {candidates.map((c) => (
                    <CandidateRow key={c.id} c={c} />
                  ))}
                </div>
              </section>
            )}
          </div>

          <footer className="mt-2 flex items-baseline justify-between gap-3 border-t border-[var(--hair)] pt-3">
            <span className="text-[12px] font-bold text-ink">Total filtered active</span>
            <span className="text-[14px] font-bold tabular-nums text-ink">{fmt(totalCommitment)}/mo</span>
          </footer>
        </>
      )}
    </Tile>
  )
}
