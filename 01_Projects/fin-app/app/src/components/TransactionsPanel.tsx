import { useMemo, useState } from 'react'
import Tile from './Tile'
import Ledger from './Ledger'
import FiltersPopover from './FiltersPopover'
import { SearchInput, RemovableChip } from './Controls'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { CATEGORY_TAXONOMY, EXPENSE_CATEGORIES, type Txn } from '../data'

/** Full-width transactions panel with list-level filters — free-text search
 *  (merchant), cascading category / sub-category multi-selects, and an amount
 *  min–max bound. `rows` arrives already scoped by the view's period + account
 *  filters; these filters compose on top and affect only this list. */
export default function TransactionsPanel({ rows }: { rows: Txn[] }) {
  const [query, setQuery] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [subcats, setSubcats] = useState<string[]>([])
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const debouncedQuery = useDebouncedValue(query, 180)

  // Changing categories prunes any selected sub-cats no longer in the union.
  const changeCategories = (next: string[]) => {
    setCategories(next)
    if (next.length) {
      const allowed = new Set(next.flatMap((c) => CATEGORY_TAXONOMY[c] ?? []))
      setSubcats((prev) => prev.filter((s) => allowed.has(s)))
    }
  }

  // Category options (stable set) with per-category counts over the scoped rows.
  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>()
    rows.forEach((t) => counts.set(t.cat, (counts.get(t.cat) ?? 0) + 1))
    return EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c, hint: String(counts.get(c) ?? 0) }))
  }, [rows])

  // Sub-category options cascade from the selected categories (all when none).
  const subcatOptions = useMemo(() => {
    const activeCats = categories.length ? categories : EXPENSE_CATEGORIES
    const seen = new Set<string>()
    const out: { value: string; label: string }[] = []
    activeCats.forEach((c) => (CATEGORY_TAXONOMY[c] ?? []).forEach((s) => {
      if (!seen.has(s)) {
        seen.add(s)
        out.push({ value: s, label: s })
      }
    }))
    return out
  }, [categories])

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    const min = amountMin ? parseFloat(amountMin) : null
    const max = amountMax ? parseFloat(amountMax) : null
    // tolerate min > max by treating the pair as a range
    const lo = min != null && max != null ? Math.min(min, max) : min
    const hi = min != null && max != null ? Math.max(min, max) : max
    return rows.filter((t) => {
      if (q && !t.merchant.toLowerCase().includes(q)) return false
      if (categories.length && !categories.includes(t.cat)) return false
      if (subcats.length && !(t.subcat && subcats.includes(t.subcat))) return false
      const abs = Math.abs(t.amount)
      if (lo != null && abs < lo) return false
      if (hi != null && abs > hi) return false
      return true
    })
  }, [rows, debouncedQuery, categories, subcats, amountMin, amountMax])

  const amountActive = Boolean(amountMin || amountMax)
  const activeCount = categories.length + subcats.length + (amountActive ? 1 : 0)
  const anyChip = categories.length > 0 || subcats.length > 0 || amountActive
  const anyActive = anyChip || query.length > 0
  const amountLabel = amountMin && amountMax ? `$${amountMin}–$${amountMax}` : amountMin ? `≥ $${amountMin}` : amountMax ? `≤ $${amountMax}` : ''

  const clearAmount = () => {
    setAmountMin('')
    setAmountMax('')
  }
  const clearAll = () => {
    setQuery('')
    setCategories([])
    setSubcats([])
    clearAmount()
  }

  return (
    <Tile span={3} className="relative z-10">
      {/* header — title + result count · search + filters */}
      <header className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h3 className="font-display text-[14px] font-bold text-ink">Transactions</h3>
          <span className="text-[11px] uppercase tracking-[0.06em] tabular-nums text-muted">
            {filtered.length} of {rows.length}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search merchant"
            ariaLabel="Search transactions"
            className="w-[190px]"
          />
          <FiltersPopover
            categoryOptions={categoryOptions}
            categories={categories}
            onCategories={changeCategories}
            subcatOptions={subcatOptions}
            subcats={subcats}
            onSubcats={setSubcats}
            amountMin={amountMin}
            amountMax={amountMax}
            onAmountMin={setAmountMin}
            onAmountMax={setAmountMax}
            activeCount={activeCount}
            onReset={clearAll}
          />
        </div>
      </header>

      {/* active-filter chips */}
      {anyChip && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {categories.map((c) => (
            <RemovableChip key={`c-${c}`} onRemove={() => changeCategories(categories.filter((x) => x !== c))}>
              {c}
            </RemovableChip>
          ))}
          {subcats.map((s) => (
            <RemovableChip key={`s-${s}`} onRemove={() => setSubcats(subcats.filter((x) => x !== s))}>
              {s}
            </RemovableChip>
          ))}
          {amountActive && <RemovableChip onRemove={clearAmount}>{amountLabel}</RemovableChip>}
          {anyActive && (
            <button
              type="button"
              onClick={clearAll}
              className="ml-0.5 rounded-[8px] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink2 transition hover:bg-[var(--hair-soft)]"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* list · empty states */}
      {filtered.length > 0 ? (
        <div className="max-h-[440px] overflow-y-auto pr-1">
          <Ledger rows={filtered} />
        </div>
      ) : rows.length === 0 ? (
        <div className="grid place-items-center py-12 text-center text-[12.5px] text-muted">
          No transactions in the selected period.
        </div>
      ) : (
        <div className="grid place-items-center gap-2 py-12 text-center">
          <span className="text-[12.5px] text-muted">No transactions match your filters.</span>
          <button
            type="button"
            onClick={clearAll}
            className="text-[12px] font-semibold text-accent-ink transition hover:opacity-70"
          >
            Clear filters
          </button>
        </div>
      )}
    </Tile>
  )
}
