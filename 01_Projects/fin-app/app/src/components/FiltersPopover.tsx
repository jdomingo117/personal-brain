import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { MoneyInput, type MultiOption } from './Controls'

/** One multi-select checkbox row (mirrors the MultiSelect option chrome). */
function CheckItem({ label, hint, on, onToggle }: { label: string; hint?: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left transition hover:bg-[var(--hair-soft)]"
    >
      <span
        className={`grid h-[17px] w-[17px] flex-shrink-0 place-items-center rounded-[5px] border transition ${
          on ? 'border-accent bg-accent text-surface' : 'border-[var(--hair)]'
        }`}
      >
        {on && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{label}</span>
      {hint && <span className="flex-shrink-0 text-[11px] tabular-nums text-muted">{hint}</span>}
    </button>
  )
}

function SectionLabel({ children, onClear }: { children: React.ReactNode; onClear?: () => void }) {
  return (
    <div className="mb-1 flex items-center justify-between px-1">
      <span className="micro text-muted">{children}</span>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="rounded-[6px] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink2 transition hover:bg-[var(--hair-soft)]"
        >
          Clear
        </button>
      )}
    </div>
  )
}

/** "Filters" popover for the transactions list — cascading category /
 *  sub-category multi-selects + an amount min–max bound. Trigger carries a count
 *  badge; closes on outside-click or Escape (matching MultiSelect/DateRangePicker).
 *  Filter state is owned by the caller; sub-category options are pre-cascaded. */
export default function FiltersPopover({
  categoryOptions,
  categories,
  onCategories,
  subcatOptions,
  subcats,
  onSubcats,
  amountMin,
  amountMax,
  onAmountMin,
  onAmountMax,
  activeCount,
  onReset,
}: {
  categoryOptions: MultiOption[]
  categories: string[]
  onCategories: (next: string[]) => void
  subcatOptions: MultiOption[]
  subcats: string[]
  onSubcats: (next: string[]) => void
  amountMin: string
  amountMax: string
  onAmountMin: (v: string) => void
  onAmountMax: (v: string) => void
  activeCount: number
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (list: string[], v: string, setter: (n: string[]) => void) =>
    setter(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Filters"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-[10px] border bg-[var(--input-bg)] py-2.5 pl-3 pr-3 text-[13px] font-medium outline-none transition focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)] ${
          activeCount > 0 ? 'border-accent text-accent-ink' : 'border-[var(--hair)] text-ink'
        }`}
      >
        <svg className={activeCount > 0 ? 'text-accent' : 'text-muted'} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 5h18M6 12h12M10 19h4" />
        </svg>
        <span>Filters</span>
        {activeCount > 0 && (
          <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[11px] font-bold tabular-nums text-surface">
            {activeCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            role="dialog"
            aria-label="Transaction filters"
            className="absolute right-0 z-50 mt-1.5 w-[320px] rounded-[12px] border border-[var(--hair)] p-3"
            style={{
              background: 'var(--toast-bg)',
              backdropFilter: 'blur(22px) saturate(1.2)',
              WebkitBackdropFilter: 'blur(22px) saturate(1.2)',
              boxShadow: 'var(--shadow-glass)',
            }}
          >
            <SectionLabel onClear={categories.length ? () => onCategories([]) : undefined}>Category</SectionLabel>
            <div className="grid grid-cols-2 gap-x-1">
              {categoryOptions.map((o) => (
                <CheckItem
                  key={o.value}
                  label={o.label}
                  hint={o.hint}
                  on={categories.includes(o.value)}
                  onToggle={() => toggle(categories, o.value, onCategories)}
                />
              ))}
            </div>

            <div className="my-2.5 border-t border-[var(--hair-soft)]" />

            <SectionLabel onClear={subcats.length ? () => onSubcats([]) : undefined}>
              {categories.length ? 'Sub-category' : 'Sub-category · all'}
            </SectionLabel>
            <div className="grid max-h-[148px] grid-cols-2 gap-x-1 overflow-y-auto">
              {subcatOptions.map((o) => (
                <CheckItem
                  key={o.value}
                  label={o.label}
                  on={subcats.includes(o.value)}
                  onToggle={() => toggle(subcats, o.value, onSubcats)}
                />
              ))}
            </div>

            <div className="my-2.5 border-t border-[var(--hair-soft)]" />

            <SectionLabel>Amount</SectionLabel>
            <div className="flex items-center gap-2">
              <MoneyInput value={amountMin} onChange={onAmountMin} placeholder="Min" ariaLabel="Minimum amount" className="flex-1" />
              <span className="text-[13px] text-muted">–</span>
              <MoneyInput value={amountMax} onChange={onAmountMax} placeholder="Max" ariaLabel="Maximum amount" className="flex-1" />
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={onReset}
                disabled={activeCount === 0}
                className="rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold text-ink2 transition hover:bg-[var(--hair-soft)] disabled:pointer-events-none disabled:text-faint"
              >
                Reset all
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-[8px] border border-[var(--hair)] px-3 py-1.5 text-[12px] font-semibold text-ink transition hover:bg-black/[0.03]"
              >
                Done
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
