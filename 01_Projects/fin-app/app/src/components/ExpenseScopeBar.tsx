import { AnimatePresence, motion } from 'framer-motion'
import { RemovableChip } from './Controls'
import { isActive, type CatSelection } from '../lib/expenseSelection'

/** Announces the analyzer's active category focus, and carries the model.
 *
 *  Cross-filtering means the hero row can read "$616" while the flow card still
 *  shows every category — the standard idiom, but genuinely confusing unless
 *  something says so out loud. That's this bar's whole job, so the copy names
 *  which tiles follow the focus and which deliberately don't. */
export default function ExpenseScopeBar({
  selection,
  label,
  onClear,
  timeFocus,
  onClearTimeFocus,
}: {
  selection: CatSelection
  label: string
  onClear: () => void
  timeFocus?: { from: string; to: string; label: string } | null
  onClearTimeFocus?: () => void
}) {
  const hasCategory = isActive(selection)
  const hasTime = !!timeFocus

  return (
    <AnimatePresence initial={false}>
      {(hasCategory || hasTime) && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          // span the full grid so the hero row below keeps its 4-up rhythm
          className="overflow-hidden md:col-span-2 xl:col-span-3"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--hair-soft)] bg-[var(--hair-soft)] px-3.5 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Focused on</span>
            
            {hasCategory && (
              <RemovableChip onRemove={onClear}>{label}</RemovableChip>
            )}

            {hasTime && timeFocus && onClearTimeFocus && (
              <RemovableChip onRemove={onClearTimeFocus}>{timeFocus.label}</RemovableChip>
            )}

            <span className="text-[11.5px] leading-relaxed text-ink2">
              Totals, {hasTime ? 'categories, ' : ''}trend and transactions below follow this focus. The comparison tiles still show
              every category, with the rest dimmed.
            </span>
            
            <button
              type="button"
              onClick={() => {
                if (hasCategory) onClear()
                if (hasTime && onClearTimeFocus) onClearTimeFocus()
              }}
              className="ml-auto rounded-[8px] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink2 transition hover:bg-[var(--hair)]"
            >
              Clear focus
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
