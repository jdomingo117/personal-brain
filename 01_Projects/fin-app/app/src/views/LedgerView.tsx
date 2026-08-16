import { useEffect, useMemo, useState } from 'react'
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
import { KIND_LABELS, TRANSACTION_KINDS, type TransactionKind } from '../lib/classification'
import ClassificationRulesDialog from '../components/ClassificationRulesDialog'

const PAGE_SIZE = 50
const REVIEW_FILTERS: { id: LedgerReviewFilter; label: string }[] = [
  { id: 'all', label: 'All' },
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

export default function LedgerView() {
  const { accounts, transactions, refreshData } = useData()
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

  const filtered = useMemo(() => filterLedger(transactions, { query, accountId, category, kind, review }), [transactions, query, accountId, category, kind, review])
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const selected = selectedId ? transactions.find((transaction) => transaction.id === selectedId) ?? null : null
  const unresolved = reviewCount(transactions)
  const selectedTransactions = transactions.filter((transaction) => selectedIds.has(transaction.id))
  const selection = summarizeLedgerSelection(selectedIds, visible, transactions)
  const visibleSelected = selection.currentPage
  const pageIsFullySelected = visible.length > 0 && visibleSelected === visible.length
  const clearPartialPageAtLimit = selection.total >= MAX_BULK_SELECTION && visibleSelected > 0
  const allSelectableMatchesSelected = isExactMatchingLedgerSelection(selectedIds, filtered)

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

  return (
    <Screen>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <ViewHeader index="05 — Ledger" title="Ledger" sub="Inspect, review and correct every transaction" />
        <div className="flex flex-wrap items-center gap-2"><Button variant="ghost" onClick={() => setRulesOpen(true)}>Rules & review policy</Button><div className="rounded-xl border border-[var(--hair)] bg-[var(--input-bg)] px-4 py-3 text-right">
          <div className="text-[11px] uppercase tracking-[0.1em] text-muted">Needs attention</div>
          <div className="font-display text-[24px] font-black tabular-nums text-ink">{unresolved}</div>
        </div></div>
      </div>

      <Tile span={3} className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          {REVIEW_FILTERS.map((filter) => (
            <Chip key={filter.id} active={review === filter.id} onClick={() => setReview(filter.id)}>{filter.label}</Chip>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_180px_180px]">
          <SearchInput value={query} onChange={setQuery} placeholder="Search merchant or description" ariaLabel="Search ledger" />
          <Select value={accountId} onChange={setAccountId} ariaLabel="Filter ledger by account">
            <option value="">All accounts</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </Select>
          <Select value={category} onChange={setCategory} ariaLabel="Filter ledger by category">
            <option value="">All categories</option>
            {ALL_CATEGORIES.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
          </Select>
          <Select value={kind} onChange={setKind} ariaLabel="Filter ledger by transaction kind">
            <option value="">All kinds</option>
            {TRANSACTION_KINDS.map((candidate) => <option key={candidate} value={candidate}>{KIND_LABELS[candidate]}</option>)}
          </Select>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hair)] pb-2 text-[10.5px] uppercase tracking-[0.1em] text-muted">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{filtered.length} transaction{filtered.length === 1 ? '' : 's'}</span>
            {selection.total > 0 && <span role="status" aria-live="polite" className="normal-case tracking-normal text-accent-ink">
              {selection.total} selected · {selection.currentPage} on this page · {selection.elsewhere} elsewhere
            </span>}
            <span id="ledger-bulk-selection-limit" className="normal-case tracking-normal">Bulk limit: {MAX_BULK_SELECTION} rows per correction.</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 normal-case tracking-normal">
            <button type="button" data-dialog-focus-fallback onClick={toggleVisible} disabled={visible.length === 0 || (selection.total >= MAX_BULK_SELECTION && visibleSelected === 0)} aria-describedby="ledger-bulk-selection-limit" className="min-h-11 rounded-lg border border-[var(--hair)] px-3 text-[11px] font-semibold text-ink2 disabled:cursor-not-allowed disabled:opacity-40">
              {pageIsFullySelected ? `Clear page (${visible.length})` : clearPartialPageAtLimit ? `Clear selected on page (${visibleSelected})` : `Select page (${visible.length})`}
            </button>
            <button type="button" onClick={selectAllMatching} disabled={filtered.length === 0 || allSelectableMatchesSelected} aria-describedby="ledger-bulk-selection-limit" className="min-h-11 rounded-lg border border-[var(--hair)] px-3 text-[11px] font-semibold text-ink2 disabled:cursor-not-allowed disabled:opacity-40">
              {allSelectableMatchesSelected
                ? filtered.length > MAX_BULK_SELECTION
                  ? `First ${MAX_BULK_SELECTION} of ${filtered.length} matching selected`
                  : `All matching selected (${filtered.length})`
                : filtered.length > MAX_BULK_SELECTION
                  ? `Select first ${MAX_BULK_SELECTION} of ${filtered.length} matching`
                  : `Select all matching (${filtered.length})`}
            </button>
            {selection.total > 0 && <Button onClick={() => setBulkOpen(true)}>Correct categories ({selection.total})</Button>}
            {selection.total > 0 && <Button variant="ghost" onClick={() => setBulkClassificationOpen(true)}>Edit attributes ({selection.total})</Button>}
            {selection.total > 0 && <button type="button" onClick={() => setSelectedIds(new Set())} className="min-h-11 px-2 text-[11px] font-semibold text-muted">Clear all ({selection.total})</button>}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <p className="text-[13px] text-muted">No transactions match this ledger view.</p>
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
                  className="grid min-h-[64px] min-w-0 flex-1 grid-cols-[72px_minmax(0,1fr)_104px] items-center gap-3 py-3 text-left transition hover:bg-[var(--hair-soft)] focus-visible:bg-[var(--accent-wash)] md:grid-cols-[88px_minmax(0,1.4fr)_minmax(100px,0.65fr)_minmax(120px,0.8fr)_100px_96px]"
                >
                <span className="text-[12px] tabular-nums text-muted">{transaction.date}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink">{transaction.merchant}</span>
                  {!!transaction.allocations?.length && <span className="mr-1 inline-flex rounded-full border border-accent px-1.5 py-0.5 text-[9px] font-semibold uppercase text-accent-ink">Split {transaction.allocations.length}</span>}
                  <span className="block truncate text-[11px] text-muted md:hidden">{transaction.account} · {transaction.cat}{transaction.subcat ? ` · ${transaction.subcat}` : ''}</span>
                  <span className="hidden truncate text-[11px] text-muted md:block">{transaction.originalDescription || transaction.merchant}</span>
                </span>
                <span className="hidden min-w-0 md:block">
                  <span className="block truncate text-[12px] font-medium text-ink2">{transaction.account}</span>
                  <span className="block truncate text-[11px] text-muted">{KIND_LABELS[transaction.kind as TransactionKind]}</span>
                </span>
                <span className="hidden min-w-0 md:block">
                  <span className="block truncate text-[12px] font-medium text-ink2">{transaction.cat}</span>
                  <span className="block truncate text-[11px] text-muted">{transaction.subcat || 'No subcategory'}</span>
                </span>
                <span className="hidden md:block">
                  <span className="inline-flex rounded-full border border-[var(--hair)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">{sourceName(transaction.categorySource)}</span>
                  {(transaction.needsReview || transaction.cat === 'Uncategorized') && <span className="mt-1 block text-[10px] font-semibold uppercase text-warn">Review</span>}
                </span>
                <span className={`text-right text-[13px] font-bold tabular-nums ${transaction.amount > 0 ? 'text-pos' : 'text-ink'}`}>{fmtCents(transaction.amount)}</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-[var(--hair)] pt-4">
            <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="min-h-11 rounded-lg border border-[var(--hair)] px-4 text-[12px] font-semibold disabled:opacity-40">Previous</button>
            <span className="text-[12px] tabular-nums text-muted">Page {page} of {pages}</span>
            <button type="button" disabled={page === pages} onClick={() => setPage((value) => value + 1)} className="min-h-11 rounded-lg border border-[var(--hair)] px-4 text-[12px] font-semibold disabled:opacity-40">Next</button>
          </div>
        )}
      </Tile>

      <TransactionCategoryDrawer transaction={selected} onClose={() => setSelectedId(null)} onChanged={refreshData} />
      {bulkOpen && <BulkCategoryDialog transactions={selectedTransactions} onClose={(clearSelection) => {
        setBulkOpen(false)
        if (clearSelection) setSelectedIds(new Set())
      }} onChanged={refreshData} />}
      {bulkClassificationOpen && <BulkClassificationDialog transactions={selectedTransactions} onClose={(clearSelection) => {
        setBulkClassificationOpen(false)
        if (clearSelection) setSelectedIds(new Set())
      }} onChanged={refreshData} />}
      {rulesOpen && <ClassificationRulesDialog onClose={() => setRulesOpen(false)} onChanged={refreshData} />}
    </Screen>
  )
}
