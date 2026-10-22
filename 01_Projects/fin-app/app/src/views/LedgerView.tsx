import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { navNumber } from '../router'
import { Screen, ViewHeader } from '../components/Screen'
import Tile from '../components/Tile'
import { Button, Chip, SearchInput, Select } from '../components/Controls'
import TransactionCategoryDrawer from '../components/TransactionCategoryDrawer'
import BulkCategoryDialog from '../components/BulkCategoryDialog'
import BulkClassificationDialog from '../components/BulkClassificationDialog'
import { ALL_CATEGORIES, fmtCents, type Txn } from '../data'
import { useData } from '../contexts/DataContext'
import {
  filterLedger, isExactMatchingLedgerSelection, MAX_BULK_SELECTION, reviewCount,
  selectAllMatchingLedgerTransactions, summarizeLedgerSelection, toggleLedgerPageSelection,
  type LedgerReviewFilter,
} from '../lib/ledger'
import { resolveReviewBatch, reviewBatchIds, reviewScopeTransactions, type CategorizationReviewScope } from '../lib/categorizationReview'
import { KIND_LABELS, TRANSACTION_KINDS, type TransactionKind } from '../lib/classification'
import ClassificationRulesDialog from '../components/ClassificationRulesDialog'
import CategorizationReviewDialog from '../components/CategorizationReviewDialog'
import CategorizationReviewActions from '../components/CategorizationReviewActions'
import { dayLabel } from '../lib/period'

const PAGE_SIZE = 50
const PRIMARY_REVIEW_IDS: LedgerReviewFilter[] = ['all', 'needs-attention', 'uncategorized']
const REVIEW_FILTERS: { id: LedgerReviewFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'needs-attention', label: 'Needs attention' },
  { id: 'needs-review', label: 'Needs review' },
  { id: 'uncategorized', label: 'Uncategorized' },
  { id: 'missing-subcategory', label: 'Missing subcategory' },
  { id: 'ai', label: 'AI' },
  { id: 'bank', label: 'Bank' },
  { id: 'user', label: 'Manual' },
  { id: 'recurring', label: 'Recurring' },
  { id: 'subscription', label: 'Subscriptions' },
  { id: 'reimbursable', label: 'Reimbursable' },
  { id: 'tax-related', label: 'Tax-related' },
]

function sourceName(source: Txn['categorySource']) {
  return source === 'user' ? 'Manual' : source === 'bank' ? 'Bank' : source === 'ai' ? 'AI' : source === 'seed' ? 'System' : 'Unknown'
}

type IncomeSourceScope = {
  source: 'income-source'
  category: string
  accountIds: string[]
  from: string
  to: string
  incomeOnly: boolean
}

type ReviewSession = { scope: 'unresolved' | 'eligible'; batches: string[][]; currentIndex: number; previewed: number[] }
type SavedLedgerFilters = { query: string; accountId: string; category: string; kind: string; review: LedgerReviewFilter; incomeSourceScope: IncomeSourceScope | null }

export default function LedgerView() {
  const { accounts, transactions, refreshData } = useData()
  const location = useLocation()
  const [query, setQuery] = useState('')
  const [accountId, setAccountId] = useState('')
  const [category, setCategory] = useState('')
  const [kind, setKind] = useState('')
  const [review, setReview] = useState<LedgerReviewFilter>('all')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkClassificationOpen, setBulkClassificationOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [moreViewsOpen, setMoreViewsOpen] = useState(false)
  const [categorizationReviewOpen, setCategorizationReviewOpen] = useState(false)
  const [reviewSnapshot, setReviewSnapshot] = useState<Txn[]>([])
  const [reviewScopeInfo, setReviewScopeInfo] = useState({ count: 0, truncated: false })
  const [reviewEditorId, setReviewEditorId] = useState<string | null>(null)
  const [reviewInvalidated, setReviewInvalidated] = useState(false)
  const [reviewSession, setReviewSession] = useState<ReviewSession | null>(null)
  const [batchSkipped, setBatchSkipped] = useState(0)
  const [savedFilters, setSavedFilters] = useState<SavedLedgerFilters | null>(null)
  const [categorizationReviewScope, setCategorizationReviewScope] = useState<CategorizationReviewScope>('selected')
  const [incomeSourceScope, setIncomeSourceScope] = useState<IncomeSourceScope | null>(null)

  useEffect(() => {
    const navigationState = location.state as ({ source?: string; review?: LedgerReviewFilter } & Partial<Omit<IncomeSourceScope, 'source'>>) | null
    if (navigationState?.source === 'dashboard-insight' && navigationState.review) {
      setReview(navigationState.review)
      setIncomeSourceScope(null)
    }
    if (navigationState?.source === 'income-source' && navigationState.category && navigationState.from && navigationState.to) {
      setQuery('')
      setAccountId('')
      setCategory(navigationState.category)
      setKind('')
      setReview('all')
      setSelectedIds(new Set())
      setIncomeSourceScope({
        source: 'income-source',
        category: navigationState.category,
        accountIds: navigationState.accountIds ?? [],
        from: navigationState.from,
        to: navigationState.to,
        incomeOnly: navigationState.incomeOnly ?? true,
      })
    }
  }, [location.key, location.state])

  const filtered = useMemo(() => filterLedger(transactions, {
    query,
    accountId,
    category,
    kind,
    review,
    accountIds: incomeSourceScope?.accountIds,
    from: incomeSourceScope?.from,
    to: incomeSourceScope?.to,
    incomeOnly: incomeSourceScope?.incomeOnly,
  }), [transactions, query, accountId, category, kind, review, incomeSourceScope])
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const selected = selectedId ? transactions.find((transaction) => transaction.id === selectedId) ?? null : null
  const unresolved = reviewCount(transactions)
  const attentionInView = reviewCount(filtered)
  const selectedTransactions = transactions.filter((transaction) => selectedIds.has(transaction.id))
  const selection = summarizeLedgerSelection(selectedIds, visible, transactions)
  const visibleSelected = selection.currentPage
  const pageIsFullySelected = visible.length > 0 && visibleSelected === visible.length
  const clearPartialPageAtLimit = selection.total >= MAX_BULK_SELECTION && visibleSelected > 0
  const allSelectableMatchesSelected = isExactMatchingLedgerSelection(selectedIds, filtered)
  const unresolvedReview = useMemo(() => reviewScopeTransactions(transactions, 'unresolved'), [transactions])
  const eligibleReview = useMemo(() => reviewScopeTransactions(transactions, 'eligible'), [transactions])
  const openCategorizationReview = (scope: CategorizationReviewScope, batchIndex = 0, existingSession = reviewSession) => {
    const review = scope === 'unresolved' ? unresolvedReview : scope === 'eligible' ? eligibleReview : null
    setCategorizationReviewScope(scope)
    if (review && scope !== 'selected') {
      const session = existingSession?.scope === scope ? existingSession : { scope, batches: reviewBatchIds(review.candidates), currentIndex: 0, previewed: [] }
      const index = Math.min(Math.max(0, batchIndex), session.batches.length - 1)
      if (index < 0) return
      const batch = resolveReviewBatch(session.batches[index], transactions, scope)
      setReviewSession({ ...session, currentIndex: index })
      setReviewSnapshot(batch.transactions)
      setBatchSkipped(batch.skipped)
      setReviewScopeInfo({ count: session.batches[index].length, truncated: false })
    } else {
      setReviewSnapshot([...selectedTransactions])
      setBatchSkipped(0)
      setReviewScopeInfo({ count: selectedTransactions.length, truncated: false })
    }
    setReviewInvalidated(false)
    setCategorizationReviewOpen(true)
  }

  useEffect(() => setPage(1), [query, accountId, category, kind, review])
  useEffect(() => { if (page > pages) setPage(pages) }, [page, pages])
  useEffect(() => setSelectedIds((current) => {
    const existingIds = new Set(transactions.map((transaction) => transaction.id))
    const next = new Set([...current].filter((id) => existingIds.has(id)))
    return next.size === current.size ? current : next
  }), [transactions])

  const toggleSelected = (id: string) => setSelectedIds((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else if (next.size < MAX_BULK_SELECTION) next.add(id)
    return next
  })
  const toggleVisible = () => setSelectedIds((current) => toggleLedgerPageSelection(current, visible))
  const selectAllMatching = () => setSelectedIds(selectAllMatchingLedgerTransactions(filtered))
  const showAttention = () => {
    if (query.trim() || accountId || category || kind || incomeSourceScope || !['all', 'needs-attention'].includes(review)) {
      setSavedFilters({ query, accountId, category, kind, review, incomeSourceScope })
    } else if (review !== 'needs-attention') setSavedFilters(null)
    setQuery(''); setAccountId(''); setCategory(''); setKind(''); setIncomeSourceScope(null)
    setReview('needs-attention'); setPage(1)
  }

  return (
    <Screen>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <ViewHeader index={`${navNumber('ledger')} — Ledger`} title="Ledger" sub="Inspect, review and correct every transaction" />
        <button type="button" onClick={() => setRulesOpen(true)} className="min-h-11 rounded-lg px-3 py-2 text-[14px] font-semibold text-ink2 hover:bg-[var(--hair-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">Rules & review policy <span aria-hidden="true">↗</span></button>
      </div>

      <Tile span={3} className="mt-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-display text-[18px] font-bold text-ink">Transactions</h2>
          <CategorizationReviewActions
            unresolvedCount={unresolvedReview.candidates.length}
            eligibleCount={eligibleReview.candidates.length}
            hasActiveFilters={Boolean(query.trim() || accountId || category || kind || review !== 'all' || incomeSourceScope)}
            hasSelection={selection.total > 0}
            onReview={openCategorizationReview}
            session={reviewSession && { scope: reviewSession.scope, batchSizes: reviewSession.batches.map((batch) => batch.length), previewed: reviewSession.previewed, currentIndex: reviewSession.currentIndex }}
            onEndSession={() => setReviewSession(null)}
          />
        </div>
        {savedFilters && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-wash)] px-4 py-3 text-[13px] text-ink2">
          <span>To show all transactions needing attention, previous filters were cleared. Your selection is unchanged.</span>
          <button type="button" onClick={() => { setQuery(savedFilters.query); setAccountId(savedFilters.accountId); setCategory(savedFilters.category); setKind(savedFilters.kind); setReview(savedFilters.review); setIncomeSourceScope(savedFilters.incomeSourceScope); setSavedFilters(null); setPage(1) }} className="min-h-11 font-semibold text-accent-ink underline">Restore previous filters</button>
        </div>}
        {incomeSourceScope && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-wash)] px-4 py-3 text-[13px]">
            <p className="text-ink2">
              <span className="font-semibold text-ink">Income explorer</span>
              <span className="text-muted"> · {incomeSourceScope.category} · {dayLabel(incomeSourceScope.from)} – {dayLabel(incomeSourceScope.to)} · {incomeSourceScope.accountIds.length || accounts.length} account{(incomeSourceScope.accountIds.length || accounts.length) === 1 ? '' : 's'}</span>
            </p>
            <button
              type="button"
              onClick={() => { setIncomeSourceScope(null); setCategory('') }}
              className="font-semibold text-accent-ink transition hover:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              Clear income scope
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-5 border-b border-[var(--hair)]">
          <div role="group" aria-label="Transaction views" className="flex min-w-0 gap-5 overflow-x-auto">
            {REVIEW_FILTERS.filter((filter) => PRIMARY_REVIEW_IDS.includes(filter.id)).map((filter) => <button key={filter.id} type="button" aria-pressed={review === filter.id} onClick={() => filter.id === 'needs-attention' ? showAttention() : setReview(filter.id)} className={`flex min-h-12 shrink-0 items-center gap-2 border-b-2 text-[14px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${review === filter.id ? 'border-[var(--color-ink)] text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
              {filter.label}{filter.id === 'needs-attention' && <span className={`rounded-full bg-[var(--track)] px-2 py-0.5 text-[12px] tabular-nums ${unresolved ? 'text-warn' : 'text-muted'}`}>{review === 'needs-attention' ? attentionInView : unresolved}</span>}
            </button>)}
          </div>
          <button type="button" aria-expanded={moreViewsOpen} aria-controls="additional-ledger-views" onClick={() => setMoreViewsOpen(!moreViewsOpen)} className="min-h-12 py-3 text-[14px] font-semibold text-ink2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">More views{!PRIMARY_REVIEW_IDS.includes(review) ? ` · ${REVIEW_FILTERS.find((filter) => filter.id === review)?.label}` : ''} <span aria-hidden="true">{moreViewsOpen ? '−' : '+'}</span></button>
        </div>
        {moreViewsOpen && <div id="additional-ledger-views" className="flex flex-wrap gap-2 border-b border-[var(--hair)] py-4" role="group" aria-label="Additional transaction views">{REVIEW_FILTERS.filter((filter) => !PRIMARY_REVIEW_IDS.includes(filter.id)).map((filter) => <Chip key={filter.id} active={review === filter.id} onClick={() => setReview(filter.id)} className="min-h-11 px-4 py-2.5 text-[13px]">{filter.label}</Chip>)}</div>}
        {review === 'needs-attention' && <p role="status" className="mt-4 text-[14px] leading-6 text-ink2">{unresolved === 0 ? 'All caught up. No transactions need attention.' : 'Flagged for review or missing a category.'}</p>}
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_190px_190px_190px]">
          <SearchInput value={query} onChange={setQuery} placeholder="Search merchant or description" ariaLabel="Search ledger" inputClassName="py-3 text-[14px]" />
          <Select value={accountId} onChange={setAccountId} ariaLabel="Filter ledger by account" inputClassName="py-3 text-[14px]">
            <option value="">All accounts</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </Select>
          <Select value={category} onChange={setCategory} ariaLabel="Filter ledger by category" inputClassName="py-3 text-[14px]">
            <option value="">All categories</option>
            {ALL_CATEGORIES.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
          </Select>
          <Select value={kind} onChange={setKind} ariaLabel="Filter ledger by transaction kind" inputClassName="py-3 text-[14px]">
            <option value="">All kinds</option>
            {TRANSACTION_KINDS.map((candidate) => <option key={candidate} value={candidate}>{KIND_LABELS[candidate]}</option>)}
          </Select>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hair)] pb-3 text-[12px] uppercase tracking-[0.1em] text-muted">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{filtered.length} transaction{filtered.length === 1 ? '' : 's'}</span>
            {selection.total > 0 && <span role="status" aria-live="polite" className="normal-case tracking-normal text-accent-ink">
              {selection.total} selected · {selection.currentPage} on this page · {selection.elsewhere} elsewhere
            </span>}
            <span id="ledger-bulk-selection-limit" className="normal-case tracking-normal">Bulk limit: {MAX_BULK_SELECTION} rows per correction.</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 normal-case tracking-normal">
            <button type="button" data-dialog-focus-fallback onClick={toggleVisible} disabled={visible.length === 0 || (selection.total >= MAX_BULK_SELECTION && visibleSelected === 0)} aria-describedby="ledger-bulk-selection-limit" className="min-h-11 rounded-lg border border-[var(--hair)] px-3 text-[12px] font-semibold text-ink2 disabled:cursor-not-allowed disabled:opacity-40">
              {pageIsFullySelected ? `Clear page (${visible.length})` : clearPartialPageAtLimit ? `Clear selected on page (${visibleSelected})` : `Select page (${visible.length})`}
            </button>
            <button type="button" onClick={selectAllMatching} disabled={filtered.length === 0 || allSelectableMatchesSelected} aria-describedby="ledger-bulk-selection-limit" className="min-h-11 rounded-lg border border-[var(--hair)] px-3 text-[12px] font-semibold text-ink2 disabled:cursor-not-allowed disabled:opacity-40">
              {allSelectableMatchesSelected
                ? filtered.length > MAX_BULK_SELECTION
                  ? `First ${MAX_BULK_SELECTION} of ${filtered.length} matching selected`
                  : `All matching selected (${filtered.length})`
                : filtered.length > MAX_BULK_SELECTION
                  ? `Select first ${MAX_BULK_SELECTION} of ${filtered.length} matching`
                  : `Select all matching (${filtered.length})`}
            </button>
            {selection.total > 0 && <Button onClick={() => setBulkOpen(true)}>Correct categories ({selection.total})</Button>}
            {selection.total > 0 && <Button variant="ghost" onClick={() => openCategorizationReview('selected')}>Review selected ({selection.total})</Button>}
            {selection.total > 0 && <Button variant="ghost" onClick={() => setBulkClassificationOpen(true)}>Edit attributes ({selection.total})</Button>}
            {selection.total > 0 && <button type="button" onClick={() => setSelectedIds(new Set())} className="min-h-11 px-2 text-[12px] font-semibold text-muted">Clear all ({selection.total})</button>}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <p className="body-copy">No transactions match this ledger view.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--hair-soft)]">
            {visible.map((transaction) => (
              <div key={transaction.id} className="flex items-center gap-2">
                <label className="grid min-h-11 min-w-11 cursor-pointer place-items-center" aria-label={`Select ${transaction.merchant} on ${transaction.date}`}>
                  <input type="checkbox" checked={selectedIds.has(transaction.id)} disabled={!selectedIds.has(transaction.id) && selection.total >= MAX_BULK_SELECTION} aria-describedby="ledger-bulk-selection-limit" onChange={() => toggleSelected(transaction.id)} className="h-4 w-4 accent-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40" />
                </label>
                <button
                  type="button"
                  onClick={() => setSelectedId(transaction.id)}
                  className="grid min-h-[72px] min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3.5 text-left transition hover:bg-[var(--hair-soft)] focus-visible:bg-[var(--accent-wash)] xl:grid-cols-[96px_minmax(0,1.4fr)_minmax(120px,0.7fr)_minmax(132px,0.85fr)_108px_106px]"
                >
                <span className="hidden text-[14px] tabular-nums text-muted xl:block">{transaction.date}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-ink">{transaction.merchant}</span>
                  {!!transaction.allocations?.length && <span className="mr-1 inline-flex rounded-full border border-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent-ink">Split {transaction.allocations.length}</span>}
                  <span className="mt-1 block truncate text-[13px] text-muted xl:hidden">{transaction.account} · {transaction.date}</span>
                  <span className="mt-1 block truncate text-[13px] text-ink2 xl:hidden">{transaction.cat}{transaction.subcat ? ` · ${transaction.subcat}` : ''}</span>
                  <span className="hidden truncate text-[12.5px] text-muted xl:block">{transaction.originalDescription || transaction.merchant}</span>
                </span>
                <span className="hidden min-w-0 xl:block">
                  <span className="block truncate text-[14px] font-medium text-ink2">{transaction.account}</span>
                  <span className="block truncate text-[12.5px] text-muted">{KIND_LABELS[transaction.kind as TransactionKind]}</span>
                </span>
                <span className="hidden min-w-0 xl:block">
                  <span className="block truncate text-[14px] font-medium text-ink2">{transaction.cat}</span>
                  <span className="block truncate text-[12.5px] text-muted">{transaction.subcat || 'No subcategory'}</span>
                </span>
                <span className="hidden xl:block">
                  <span className="inline-flex rounded-full border border-[var(--hair)] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{sourceName(transaction.categorySource)}</span>
                  {(transaction.needsReview || transaction.cat === 'Uncategorized') && <span className="mt-1 block text-[11px] font-semibold uppercase text-warn">Review</span>}
                </span>
                <span className={`text-right text-[15px] font-bold tabular-nums ${transaction.amount > 0 ? 'text-pos' : 'text-ink'}`}>{fmtCents(transaction.amount)}</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-[var(--hair)] pt-4">
            <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="min-h-11 rounded-lg border border-[var(--hair)] px-4 text-[13px] font-semibold disabled:opacity-40">Previous</button>
            <span className="text-[13px] tabular-nums text-muted">Page {page} of {pages}</span>
            <button type="button" disabled={page === pages} onClick={() => setPage((value) => value + 1)} className="min-h-11 rounded-lg border border-[var(--hair)] px-4 text-[13px] font-semibold disabled:opacity-40">Next</button>
          </div>
        )}
      </Tile>

      <TransactionCategoryDrawer transaction={selected} onClose={() => { setSelectedId(null); setReviewEditorId(null) }} onChanged={async () => {
        if (reviewEditorId) setReviewInvalidated(true)
        await refreshData()
      }} />
      {bulkOpen && <BulkCategoryDialog transactions={selectedTransactions} onClose={(clearSelection) => {
        setBulkOpen(false)
        if (clearSelection) setSelectedIds(new Set())
      }} onChanged={refreshData} />}
      {bulkClassificationOpen && <BulkClassificationDialog transactions={selectedTransactions} onClose={(clearSelection) => {
        setBulkClassificationOpen(false)
        if (clearSelection) setSelectedIds(new Set())
      }} onChanged={refreshData} />}
      {categorizationReviewOpen && <CategorizationReviewDialog
        key={`${categorizationReviewScope}-${reviewSession?.currentIndex ?? 0}`}
        transactions={reviewSnapshot}
        scope={categorizationReviewScope}
        scopeCandidateCount={reviewScopeInfo.count}
        scopeTruncated={reviewScopeInfo.truncated}
        suspended={reviewEditorId !== null}
        invalidated={reviewInvalidated}
        batch={categorizationReviewScope !== 'selected' && reviewSession?.scope === categorizationReviewScope ? { index: reviewSession.currentIndex, total: reviewSession.batches.length, skipped: batchSkipped, nextSize: reviewSession.batches[reviewSession.currentIndex + 1]?.length } : undefined}
        onPreviewComplete={() => setReviewSession((current) => current && current.scope === categorizationReviewScope && !current.previewed.includes(current.currentIndex) ? { ...current, previewed: [...current.previewed, current.currentIndex] } : current)}
        onNextBatch={() => { if (reviewSession) openCategorizationReview(reviewSession.scope, reviewSession.currentIndex + 1, reviewSession) }}
        onOpenTransaction={(id) => {
          if (!transactions.some((transaction) => transaction.id === id)) { setReviewInvalidated(true); return }
          setReviewEditorId(id); setSelectedId(id)
        }}
        onClose={(clearSelection) => {
        setCategorizationReviewOpen(false)
        if (clearSelection && categorizationReviewScope === 'selected') setSelectedIds(new Set())
      }} onChanged={refreshData} />}
      {rulesOpen && <ClassificationRulesDialog onClose={() => setRulesOpen(false)} onChanged={refreshData} />}
    </Screen>
  )
}
