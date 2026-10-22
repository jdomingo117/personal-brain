import { useState } from 'react'
import { createPortal } from 'react-dom'
import { MAX_CATEGORIZATION_REVIEW_ROWS, type CategorizationReviewScope } from '../lib/categorizationReview'
import { useDialogFocus } from '../hooks/useDialogFocus'

type BroadReviewScope = Exclude<CategorizationReviewScope, 'selected'>
type ReviewSessionSummary = { scope: BroadReviewScope; batchSizes: number[]; previewed: number[]; currentIndex: number }
type Props = {
  unresolvedCount: number
  eligibleCount: number
  hasActiveFilters: boolean
  hasSelection: boolean
  onReview: (scope: BroadReviewScope, batchIndex: number) => void
  session?: ReviewSessionSummary | null
  onEndSession?: () => void
}

const control = 'min-h-11 rounded-lg px-4 py-3 text-[14px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent'

/** The Ledger owns candidate snapshots; this component only presents review setup. */
export default function CategorizationReviewActions(props: Props) {
  const [setupOpen, setSetupOpen] = useState(false)
  const session = props.session
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
    {session && <p role="status" className="text-[13px] text-muted">{session.previewed.length} of {session.batchSizes.length} batches previewed</p>}
    <button type="button" data-category-review-trigger onClick={() => setSetupOpen(true)} className={`${control} inline-flex items-center gap-3 bg-ink text-surface hover:opacity-85`}>
      {session ? 'Continue review' : 'Review categories'}<span aria-hidden="true">↗</span>
    </button>
    {setupOpen && <ReviewSetup {...props} onClose={() => setSetupOpen(false)} onReview={(scope, batchIndex) => { setSetupOpen(false); props.onReview(scope, batchIndex) }} />}
  </div>
}

function ReviewSetup({ unresolvedCount, eligibleCount, hasActiveFilters, hasSelection, session, onEndSession, onReview, onClose }: Props & { onClose: () => void }) {
  const ref = useDialogFocus({ fallbackSelector: '[data-category-review-trigger]' })
  const [scope, setScope] = useState<BroadReviewScope>(session?.scope ?? (unresolvedCount ? 'unresolved' : 'eligible'))
  const [batchIndex, setBatchIndex] = useState(() => {
    if (!session) return 0
    const next = session.batchSizes.findIndex((_, index) => !session.previewed.includes(index))
    return next < 0 ? session.currentIndex : next
  })
  const sizesFor = (candidateScope: BroadReviewScope) => {
    if (session?.scope === candidateScope) return session.batchSizes
    const count = candidateScope === 'unresolved' ? unresolvedCount : eligibleCount
    return Array.from({ length: Math.ceil(count / MAX_CATEGORIZATION_REVIEW_ROWS) }, (_, index) => Math.min(MAX_CATEGORIZATION_REVIEW_ROWS, count - index * MAX_CATEGORIZATION_REVIEW_ROWS))
  }
  const sizes = sizesFor(scope)
  const index = Math.min(batchIndex, Math.max(0, sizes.length - 1))
  const scopes = [
    { id: 'unresolved' as const, title: 'Review unclassified', description: 'Find categories for transactions that haven’t been classified yet.' },
    { id: 'eligible' as const, title: 'Check existing categories', description: 'Look for possible improvements across eligible transactions, including unclassified ones.' },
  ]

  return createPortal(<div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="category-review-setup-title" onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }} className="max-h-[calc(100dvh-2rem)] w-full max-w-[640px] overflow-y-auto rounded-2xl border border-[var(--hair)] bg-surface p-5 shadow-2xl sm:p-8">
      <header className="flex items-start justify-between gap-4"><div><p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Category review</p><h2 id="category-review-setup-title" className="mt-2 font-display text-[26px] font-bold leading-tight">Find suggestions worth a look</h2></div><button type="button" aria-label="Close review setup" onClick={onClose} className={`${control} !px-3 text-ink2`}>×</button></header>
      <p className="mt-3 text-[15px] leading-7 text-ink2">Choose what to check. You’ll see suggestions before making any changes.</p>
      <fieldset className="mt-6 space-y-3"><legend className="sr-only">What would you like to review?</legend>
        {scopes.map((item) => {
          const count = sizesFor(item.id).reduce((sum, size) => sum + size, 0)
          return <label key={item.id} className={`flex items-start gap-3 rounded-xl border p-4 ${count ? 'cursor-pointer' : 'opacity-60'} ${scope === item.id ? 'border-accent bg-[var(--accent-wash)]' : 'border-[var(--hair)]'}`}>
            <input type="radio" name="category-review-scope" value={item.id} checked={scope === item.id} disabled={count === 0} onChange={() => { setScope(item.id); setBatchIndex(0) }} className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]" />
            <span className="min-w-0 flex-1"><span className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-[15px] font-semibold text-ink">{item.title}</span><span className="text-[13px] text-muted">{count ? `${count} ${session?.scope === item.id ? 'in this session' : 'available'}` : 'None to review'}</span></span><span className="mt-1 block text-[14px] leading-6 text-ink2">{item.description}</span></span>
          </label>
        })}
      </fieldset>
      {sizes.length > 0 ? <div className="mt-6"><div className="flex flex-wrap items-baseline justify-between gap-2"><label htmlFor="category-review-batch" className="text-[14px] font-semibold text-ink">Choose a batch</label><span className="text-[13px] text-muted">{sizes.reduce((sum, size) => sum + size, 0)} candidates · {sizes.length} batch{sizes.length === 1 ? '' : 'es'}</span></div>
        <select id="category-review-batch" value={index} onChange={(event) => setBatchIndex(Number(event.target.value))} className="mt-2 min-h-12 w-full rounded-lg border border-[var(--workflow-control-border)] bg-surface px-3 text-[14px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          {sizes.map((size, batch) => <option key={batch} value={batch}>Batch {batch + 1} of {sizes.length} · {size} transaction{size === 1 ? '' : 's'}{session?.scope === scope && session.previewed.includes(batch) ? ' · previewed' : ''}</option>)}
        </select>
      </div> : <p role="status" className="mt-5 text-[14px] leading-6 text-ink2">No transactions are available for review.</p>}
      {(hasActiveFilters || hasSelection) && <p className="mt-4 text-[14px] leading-6 text-ink2">This review uses loaded transactions across all accounts. {hasActiveFilters ? 'Your Ledger filters do not limit it. ' : ''}{hasSelection ? 'Use Review selected in the Ledger to check only your selection.' : ''}</p>}
      {session && <div className="mt-4 border-t border-[var(--hair)] pt-4 text-[14px] leading-6 text-ink2"><p>{session.previewed.length} of {session.batchSizes.length} batches previewed. Progress lasts until you leave or refresh the Ledger.</p>{scope !== session.scope && <p className="mt-2">Starting this review replaces the current session.</p>}<button type="button" onClick={() => { onEndSession?.(); setScope(unresolvedCount ? 'unresolved' : 'eligible'); setBatchIndex(0) }} className={`${control} !px-0 text-accent-ink underline`}>Start a new review</button></div>}
      <details className="mt-3 text-[14px] leading-6 text-ink2"><summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">How review works</summary><div className="space-y-2 pb-3"><p>Reviews use loaded transactions across accounts, regardless of Ledger filters or selected rows. Each batch includes up to {MAX_CATEGORIZATION_REVIEW_ROWS} transactions.</p><p>Unclassified transactions are marked Uncategorized with no recorded classification source. The wider check can also suggest improvements to existing categories.</p><p>Manual edits, bank categories, your rules and reconciliation entries stay protected. Suggestions are checked again before any changes are applied.</p></div></details>
      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hair)] pt-5"><button type="button" onClick={onClose} className={`${control} text-ink2`}>Cancel</button><button type="button" disabled={!sizes.length} onClick={() => onReview(scope, index)} className={`${control} inline-flex items-center gap-3 bg-ink text-surface disabled:cursor-not-allowed disabled:opacity-45`}>Preview suggestions<span aria-hidden="true">↗</span></button></footer>
    </section>
  </div>, document.body)
}
