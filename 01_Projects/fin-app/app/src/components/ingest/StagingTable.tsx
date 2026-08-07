import { useMemo, useState } from 'react'
import type { StagedRow } from '../../lib/csv/pipeline'
import { CATEGORY_TAXONOMY, FULL_TAXONOMY, ALL_CATEGORIES, UNCATEGORIZED } from '../../data'

/**
 * The staging buffer (SRD §6.E).
 *
 * Replaces a read-only five-row preview that showed no category, no merchant
 * and no way to fix anything. Everything that will be written is visible and
 * correctable here, because the moment after commit is the wrong time to
 * discover that a mapping was wrong — there is no bulk re-categorisation UI.
 */

const money = (cents: number | null) =>
  cents === null
    ? '—'
    : `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-AU', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    })}`

function Badge({ kind }: { kind: 'bad-date' | 'no-amount' | 'duplicate' | 'review' }) {
  const map = {
    'bad-date': { label: 'bad date', cls: 'border-[var(--color-neg)] text-[var(--color-neg)]' },
    'no-amount': { label: 'no amount', cls: 'border-[var(--color-neg)] text-[var(--color-neg)]' },
    duplicate: { label: 'duplicate', cls: 'border-[var(--hair)] text-muted' },
    review: { label: 'review', cls: 'border-[var(--color-warn)] text-[var(--color-warn)]' },
  }[kind]
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${map.cls}`}>
      {map.label}
    </span>
  )
}

export default function StagingTable({
  rows,
  onChange,
  categorizing,
}: {
  rows: StagedRow[]
  onChange: (rows: StagedRow[]) => void
  categorizing: boolean
}) {
  const [filter, setFilter] = useState<'all' | 'review' | 'issues'>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const visible = useMemo(() => {
    if (filter === 'review') return rows.filter((r) => r.needsReview || r.category === UNCATEGORIZED)
    if (filter === 'issues') return rows.filter((r) => r.issues.length > 0)
    return rows
  }, [rows, filter])

  const counts = useMemo(() => ({
    all: rows.length,
    review: rows.filter((r) => r.needsReview || r.category === UNCATEGORIZED).length,
    issues: rows.filter((r) => r.issues.length > 0).length,
  }), [rows])

  const setRow = (id: string, patch: Partial<StagedRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  /** Bulk edit is the point of the selection — fixing 40 rows one at a time is not a workflow. */
  const bulkCategory = (category: string) => {
    if (selected.size === 0) return
    onChange(rows.map((r) => (selected.has(r.id)
      ? { ...r, category, subcategory: null, categorySource: 'user' as const, needsReview: false }
      : r)))
    setSelected(new Set())
  }

  const toggle = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id))

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(['all', 'review', 'issues'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-[8px] border px-2.5 py-1.5 text-[12px] font-medium transition ${
                filter === f
                  ? 'border-accent bg-[var(--accent-wash)] text-accent-ink'
                  : 'border-[var(--hair)] text-muted hover:bg-black/[0.02]'
              }`}
            >
              {f === 'all' ? 'All' : f === 'review' ? 'Needs review' : 'Issues'} ({counts[f]})
            </button>
          ))}
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted">{selected.size} selected →</span>
            <select
              onChange={(e) => { bulkCategory(e.target.value); e.currentTarget.selectedIndex = 0 }}
              className="min-h-[34px] rounded-[8px] border border-[var(--hair)] bg-[var(--input-bg)] px-2 text-[12.5px]"
              aria-label="Set category for selected rows"
            >
              <option>Set category…</option>
              {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="max-h-[420px] overflow-auto rounded-[10px] border border-[var(--hair)]">
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-[var(--surface)]">
            <tr className="border-b border-[var(--hair)] text-left">
              <th className="w-9 px-2 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all visible rows"
                  checked={allVisibleSelected}
                  onChange={() => setSelected(allVisibleSelected
                    ? new Set()
                    : new Set(visible.map((r) => r.id)))}
                />
              </th>
              <th className="px-2 py-2 font-medium text-muted">Date</th>
              <th className="px-2 py-2 font-medium text-muted">Merchant</th>
              <th className="px-2 py-2 font-medium text-muted">Category</th>
              <th className="px-2 py-2 text-right font-medium text-muted">Amount</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const blocked = r.issues.length > 0
              return (
                <tr
                  key={r.id}
                  className={`border-b border-[var(--hair-soft)] last:border-0 ${
                    blocked ? 'opacity-55' : ''
                  } ${selected.has(r.id) ? 'bg-[var(--accent-wash)]' : ''}`}
                >
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.merchantDisplay}`}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">
                    {r.date ?? <span className="text-[var(--color-neg)]">unparseable</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="max-w-[260px] truncate" title={r.originalDescription}>
                        {r.merchantDisplay}
                      </span>
                      {r.issues.map((i) => <Badge key={i} kind={i} />)}
                      {r.occurrence > 0 && !blocked && <Badge kind="duplicate" />}
                      {r.needsReview && <Badge kind="review" />}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    {categorizing && r.categorySource === null ? (
                      <span className="text-muted">…</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <select
                          value={r.category}
                          onChange={(e) => setRow(r.id, {
                            category: e.target.value, subcategory: null,
                            categorySource: 'user', needsReview: false,
                          })}
                          className="min-h-[28px] rounded-[6px] border border-[var(--hair)] bg-[var(--input-bg)] px-1.5 text-[12px]"
                          aria-label={`Category for ${r.merchantDisplay}`}
                        >
                          {[...ALL_CATEGORIES, UNCATEGORIZED].map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        {(FULL_TAXONOMY[r.category]?.length ?? 0) > 0 && (
                          <select
                            value={r.subcategory ?? ''}
                            onChange={(e) => setRow(r.id, {
                              subcategory: e.target.value || null,
                              categorySource: 'user', needsReview: false,
                            })}
                            className="min-h-[28px] rounded-[6px] border border-[var(--hair)] bg-[var(--input-bg)] px-1.5 text-[12px]"
                            aria-label={`Subcategory for ${r.merchantDisplay}`}
                          >
                            <option value="">—</option>
                            {FULL_TAXONOMY[r.category].map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </td>
                  <td className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums ${
                    (r.amountCents ?? 0) > 0 ? 'text-pos' : ''
                  }`}>
                    {money(r.amountCents)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {counts.issues > 0 && (
        <p className="text-[12px] text-muted">
          {counts.issues} row{counts.issues === 1 ? '' : 's'} cannot be imported and will be
          skipped. Fix the source file and re-upload if you need them — they are excluded
          rather than guessed at.
        </p>
      )}
    </div>
  )
}

export { CATEGORY_TAXONOMY }
