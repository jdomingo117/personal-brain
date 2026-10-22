import { useState } from 'react'
import CategorizationReviewActions from '../components/CategorizationReviewActions'

type Option = 'A' | 'B' | 'C' | 'D'
type Scenario = 'none-unclassified' | 'unclassified' | 'selected' | 'empty'
type Scope = 'unclassified' | 'eligible'

const options: { id: Option; name: string; description: string; tradeoff: string }[] = [
  { id: 'A', name: 'Compact review section', description: 'A distinct, clearly labelled home for both review actions.', tradeoff: 'Best balance of clarity and space.' },
  { id: 'B', name: 'Stronger buttons', description: 'Keep the existing row, but make the actions unmistakable.', tradeoff: 'Most compact; less room to explain scope.' },
  { id: 'C', name: 'Choose a scope', description: 'One action opens a choice of what to review.', tradeoff: 'Cleanest toolbar; adds a step.' },
  { id: 'D', name: 'Review card', description: 'Give categorisation review a more prominent dedicated card.', tradeoff: 'Most explanatory; uses more space.' },
]

const scenarios: { id: Scenario; label: string }[] = [
  { id: 'none-unclassified', label: 'No unclassified' },
  { id: 'unclassified', label: 'Unclassified available' },
  { id: 'selected', label: 'Rows selected' },
  { id: 'empty', label: 'No candidates' },
]

const buttonBase = 'inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-left text-[14px] font-semibold leading-snug transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50'
const primary = `${buttonBase} bg-ink text-surface hover:opacity-85`
const secondary = `${buttonBase} border border-[var(--hair)] bg-[var(--input-bg)] text-ink hover:border-[var(--color-accent)]`

export default function LedgerReviewConcept() {
  const [option, setOption] = useState<Option>('A')
  const [scenario, setScenario] = useState<Scenario>('none-unclassified')
  const [scope, setScope] = useState<Scope>('eligible')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [filter, setFilter] = useState('All')
  const [message, setMessage] = useState('')
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  const unclassified = scenario === 'unclassified' || scenario === 'selected' ? 18 : 0
  const eligible = scenario === 'empty' ? 0 : 570
  const selected = scenario === 'selected' ? 4 : 0
  const optionInfo = options.find((item) => item.id === option)!

  function changeScenario(next: Scenario) {
    setScenario(next)
    setScope(next === 'unclassified' || next === 'selected' ? 'unclassified' : 'eligible')
    setMessage('')
  }

  function simulateReview(reviewScope: Scope | 'selected') {
    const description = reviewScope === 'selected'
      ? `${selected} selected sample transactions`
      : reviewScope === 'unclassified'
        ? `${unclassified} unclassified sample transactions`
        : `the first 500 of ${eligible} eligible sample candidates`
    setMessage(`Demo only: this would open a preview for ${description}. No request was sent and nothing was changed.`)
  }

  function actionButtons() {
    return (
      <div className="flex flex-wrap gap-2.5">
        <button type="button" className={unclassified ? primary : secondary} disabled={!unclassified} onClick={() => simulateReview('unclassified')}>
          Review unclassified ({unclassified})
        </button>
        <button type="button" className={!unclassified && eligible ? primary : secondary} disabled={!eligible} onClick={() => simulateReview('eligible')}>
          {eligible > 500 ? `Review eligible batch (first 500 of ${eligible})` : `Review eligible (${eligible})`}
        </button>
      </div>
    )
  }

  const scopeNote = 'Uses loaded transactions across accounts, not the Ledger filters or selection. The server checks protections when preparing the preview.'
  const noUnclassifiedNote = unclassified === 0 && eligible > 0 ? 'No unclassified transactions without a classification source. Other transactions may still be eligible.' : ''

  return (
    <div className="h-full overflow-y-auto bg-surface text-ink">
      <header className="border-b border-[var(--hair)] bg-[var(--input-bg)]">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3 text-[12px] font-bold tracking-[0.14em]">
            <span className="font-display text-[16px] tracking-[0.08em]">HALCYON</span>
            <span className="text-muted">/</span><span className="text-ink2">DESIGN REVIEW</span>
          </div>
          <button type="button" className={secondary} aria-pressed={dark} onClick={() => { const next = !dark; setDark(next); document.documentElement.classList.toggle('dark', next) }}>
            {dark ? 'Light appearance' : 'Dark appearance'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 pb-16 pt-10 sm:px-8">
        <p className="text-[12px] font-bold uppercase tracking-[0.13em] text-accent-ink">Ledger · design concepts</p>
        <h1 className="mt-2 font-display text-[clamp(28px,4vw,42px)] font-bold leading-tight">Make review actions easier to find</h1>
        <p className="mt-3 max-w-[800px] text-[16px] leading-relaxed text-ink2">Compare four ways to distinguish categorisation actions from filters. Choose an option and a sample state to see it in context.</p>
        <p className="mt-4 rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-4 py-3 text-[14px] leading-relaxed text-ink2"><strong className="text-ink">Review-only concept.</strong> Everything on this page is fictional. Controls demonstrate the design; they do not connect to the Ledger, run the engine or change transactions.</p>

        <section className="mt-9" aria-labelledby="choose-option">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted">01 / Compare approaches</p><h2 id="choose-option" className="mt-1 font-display text-[20px] font-bold">Choose a design</h2></div>
            <p className="text-[14px] text-ink2">Option A is the recommendation.</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Design options">
            {options.map((item) => (
              <button key={item.id} type="button" aria-pressed={option === item.id} onClick={() => { setOption(item.id); setPickerOpen(false); setMessage('') }} className={`min-h-[160px] rounded-xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${option === item.id ? 'border-[var(--color-accent)] bg-[var(--input-bg)]' : 'border-[var(--hair)] hover:bg-[var(--input-bg)]'}`}>
                <span className="flex items-center justify-between gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted"><span>Option {item.id}</span><span>{item.id === 'A' ? 'Recommended' : option === item.id ? 'Selected' : ''}</span></span>
                <span className="mt-3 block font-display text-[16px] font-bold text-ink">{item.name}</span>
                <span className="mt-2 block text-[14px] leading-relaxed text-ink2">{item.description}</span>
                <span className="mt-3 block text-[13px] font-semibold leading-relaxed text-muted">{item.tradeoff}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-9" aria-labelledby="preview-heading">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted">02 / Try the states</p><h2 id="preview-heading" className="mt-1 font-display text-[20px] font-bold">Option {option}: {optionInfo.name}</h2></div>
            <p className="max-w-[420px] text-[14px] leading-relaxed text-ink2">{optionInfo.tradeoff} Counts below are examples, not your data.</p>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Sample scenarios">
            <span className="mr-2 text-[14px] font-semibold text-ink2">Sample state</span>
            {scenarios.map((item) => <button key={item.id} type="button" aria-pressed={scenario === item.id} onClick={() => changeScenario(item.id)} className={`${scenario === item.id ? primary : secondary} !min-h-10 !px-3`}>{item.label}</button>)}
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-[var(--hair)] bg-[var(--input-bg)]">
            <div className="border-b border-[var(--hair)] px-5 py-5 sm:px-7">
              <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-accent-ink">05 — Ledger · sample</p>
              <h3 className="mt-1 font-display text-[28px] font-bold">Ledger</h3>
              <p className="mt-1 text-[14px] text-ink2">Inspect, review and correct every transaction</p>
            </div>
            <div className="px-5 py-5 sm:px-7">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Sample Ledger filters">
                {['All', 'Needs review', 'Uncategorized', 'AI', 'Bank'].map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => { setFilter(item); setMessage('Sample filter styling only: the example rows do not change. Broad review actions use loaded transactions, not the Ledger filter.') }} className={`min-h-10 rounded-full border px-4 text-[14px] font-medium ${filter === item ? 'border-[var(--color-accent)] text-accent-ink' : 'border-[var(--hair)] text-ink2'}`}>{item}</button>)}
              </div>
              <div className="mt-4 flex min-h-12 flex-wrap items-center justify-between gap-3 border-y border-[var(--hair)] py-3">
                <p className="text-[13px] text-ink2">1,000 loaded sample transactions <span className="mx-1 text-muted">·</span> Bulk limit: 500 rows</p>
                {selected > 0 ? <button type="button" className={secondary} onClick={() => simulateReview('selected')}>Review selected ({selected})</button> : <span className="text-[13px] text-muted">No rows selected</span>}
              </div>

              {option === 'A' && <CategorizationReviewActions unresolvedCount={unclassified} eligibleCount={eligible} hasActiveFilters={filter !== 'All'} hasSelection={selected > 0} onReview={(reviewScope) => simulateReview(reviewScope === 'unresolved' ? 'unclassified' : reviewScope)} />}

              {option === 'B' && <div className="my-5 border-b border-[var(--hair)] pb-5"><div className="flex flex-wrap items-center gap-3"><span className="text-[14px] font-semibold text-ink">Engine review</span>{actionButtons()}</div><p className="mt-3 text-[13px] leading-relaxed text-ink2">Preview only. {scopeNote}</p>{noUnclassifiedNote && <p className="mt-2 text-[13px] text-ink2">{noUnclassifiedNote}</p>}{eligible === 0 && <p className="mt-2 text-[13px] text-ink2">There are no review candidates in the loaded transactions.</p>}</div>}

              {option === 'C' && <div className="my-5 border-b border-[var(--hair)] pb-5"><div className="flex flex-wrap items-center gap-3"><button type="button" className={primary} aria-expanded={pickerOpen} aria-controls="concept-scope-picker" onClick={() => setPickerOpen(!pickerOpen)}>Review categories {pickerOpen ? '−' : '+'}</button><span className="text-[14px] text-ink2">Choose which transactions to preview.</span></div>
                {pickerOpen && <div id="concept-scope-picker" className="mt-3 max-w-[650px] rounded-xl border border-[var(--hair)] bg-surface p-4"><fieldset><legend className="text-[14px] font-bold">Choose a review scope</legend><label className="mt-3 flex gap-3 rounded-lg border border-[var(--hair)] p-3"><input type="radio" name="review-scope" checked={scope === 'unclassified'} disabled={!unclassified} onChange={() => setScope('unclassified')} /><span className="text-[14px] text-ink"><strong>Unclassified ({unclassified})</strong><span className="mt-1 block text-ink2">Uncategorized with no classification source.</span></span></label><label className="mt-2 flex gap-3 rounded-lg border border-[var(--hair)] p-3"><input type="radio" name="review-scope" checked={scope === 'eligible'} disabled={!eligible} onChange={() => setScope('eligible')} /><span className="text-[14px] text-ink"><strong>Eligible candidates ({eligible})</strong><span className="mt-1 block text-ink2">{eligible > 500 ? 'Preview the first 500 of the loaded candidates.' : 'Preview the loaded candidates.'}</span></span></label></fieldset><p className="mt-3 text-[13px] leading-relaxed text-ink2">{scopeNote}</p>{eligible === 0 && <p className="mt-2 text-[13px] text-ink2">There are no review candidates in the loaded transactions.</p>}<button type="button" className={`${primary} mt-4`} disabled={scope === 'unclassified' ? !unclassified : !eligible} onClick={() => simulateReview(scope)}>Preview selected scope</button></div>}
              </div>}

              {option === 'D' && <div className="my-5 rounded-xl border border-[var(--hair)] bg-surface p-6"><p className="text-[12px] font-bold uppercase tracking-[0.1em] text-accent-ink">Review your categories</p><h4 className="mt-2 font-display text-[21px] font-bold">Find suggestions worth reviewing</h4><p className="mt-2 max-w-[720px] text-[14px] leading-relaxed text-ink2">Ask the categorisation engine for fresh suggestions for your loaded transactions. You stay in control: suggestions are only applied if you choose to apply them.</p><div className="mt-5">{actionButtons()}</div>{noUnclassifiedNote && <p className="mt-3 text-[13px] leading-relaxed text-ink2">{noUnclassifiedNote}</p>}{eligible === 0 && <p className="mt-3 text-[13px] text-ink2">There are no review candidates in the loaded transactions.</p>}<p className="mt-4 border-t border-[var(--hair)] pt-4 text-[13px] leading-relaxed text-ink2">{scopeNote} Manual and bank classifications, user rules and reconciliation entries remain protected.</p></div>}

              <div role="status" aria-live="polite" className={message ? 'mb-4 rounded-lg border border-[var(--hair)] bg-surface p-4 text-[14px] leading-relaxed text-ink2' : 'sr-only'}>{message}</div>
              <div aria-label="Example transactions" className="divide-y divide-[var(--hair)] border-t border-[var(--hair)]">
                {[['Coffee House', 'Everyday account · 12 Oct 2026', 'Food & drink', '−$8.50'], ['Metro Grocer', 'Credit card · 11 Oct 2026', 'Groceries', '−$46.20'], ['Salary payment', 'Everyday account · 10 Oct 2026', 'Income', '+$2,450.00']].map(([name, details, category, amount]) => <div key={name} className="grid grid-cols-[1fr_auto] gap-3 py-4 sm:grid-cols-[1fr_160px_110px]"><div><p className="text-[14px] font-semibold">{name}</p><p className="mt-1 text-[13px] text-ink2">{details}</p></div><span className="hidden text-[13px] text-ink2 sm:block">{category}</span><span className="text-right text-[14px] font-semibold">{amount}</span></div>)}
              </div>
            </div>
          </div>
          <p className="mt-4 text-[14px] leading-relaxed text-ink2"><strong className="text-ink">Design note:</strong> The selected-row action stays with selection controls. Broad review actions are separate from filters and selection, and the 500-row limit is explicit. Actual eligibility and protection checks remain server-controlled.</p>
        </section>
      </main>
    </div>
  )
}
