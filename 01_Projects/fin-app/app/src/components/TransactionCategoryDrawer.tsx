import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ALL_CATEGORIES, FULL_TAXONOMY, fmtCents, type Txn } from '../data'
import { supabase } from '../lib/supabaseClient'
import { Button, Select, Switch } from './Controls'
import { KIND_LABELS, TRANSACTION_KINDS, type SpendingNature, type TransactionKind } from '../lib/classification'
import { useData } from '../contexts/DataContext'
import TransactionSplitEditor from './TransactionSplitEditor'
import { useDialogFocus } from '../hooks/useDialogFocus'

interface CategoryEditHistory {
  id: string
  before_category: string
  before_subcategory: string | null
  after_category: string
  after_subcategory: string | null
  created_at: string
  undone_at: string | null
  scope: 'transaction' | 'selection' | 'merchant_rule'
}

interface MutationResult {
  edit_id: string
  transaction_id: string
  category: string
  subcategory: string | null
}

interface RulePreview {
  existing_matches: number
  transactions_to_update: number
}

interface ClassificationEditHistory {
  id: string
  before_kind: TransactionKind
  after_kind: TransactionKind
  before_attributes: Record<string, unknown>
  after_attributes: Record<string, unknown>
  created_at: string
  undone_at: string | null
}

const pair = (category: string, subcategory?: string | null) =>
  subcategory ? `${category} · ${subcategory}` : category

function sourceLabel(source: Txn['categorySource']) {
  if (source === 'user') return 'Manually categorised'
  if (source === 'bank') return 'Supplied by bank'
  if (source === 'ai') return 'AI categorised'
  if (source === 'seed') return 'System assigned'
  return 'Source unavailable'
}

export default function TransactionCategoryDrawer({
  transaction,
  onClose,
  onChanged,
}: {
  transaction: Txn | null
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const { customSubcategories } = useData()
  const [category, setCategory] = useState('')
  const [subcategory, setSubcategory] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lastEditId, setLastEditId] = useState<string | null>(null)
  const [history, setHistory] = useState<CategoryEditHistory[]>([])
  const [scope, setScope] = useState<'transaction' | 'merchant_rule'>('transaction')
  const [preview, setPreview] = useState<RulePreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [kind, setKind] = useState<TransactionKind>('expense')
  const [isRecurring, setIsRecurring] = useState(false)
  const [isSubscription, setIsSubscription] = useState(false)
  const [spendingNature, setSpendingNature] = useState<SpendingNature>(null)
  const [isReimbursable, setIsReimbursable] = useState(false)
  const [isTaxRelated, setIsTaxRelated] = useState(false)
  const [classificationHistory, setClassificationHistory] = useState<ClassificationEditHistory[]>([])
  const [lastClassificationEditId, setLastClassificationEditId] = useState<string | null>(null)
  const [classificationSaving, setClassificationSaving] = useState(false)
  const [addingSubcategory, setAddingSubcategory] = useState(false)
  const [customName, setCustomName] = useState('')
  const dialogRef = useDialogFocus({ active: Boolean(transaction) })

  const loadHistory = async (transactionId: string) => {
    const { data } = await supabase
      .from('transaction_category_edits')
      .select('id, before_category, before_subcategory, after_category, after_subcategory, created_at, undone_at, scope')
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: false })
      .limit(20)
    setHistory(data ?? [])
    const { data: classificationData } = await supabase
      .from('transaction_classification_edits')
      .select('id,before_kind,after_kind,before_attributes,after_attributes,created_at,undone_at')
      .eq('transaction_id', transactionId).order('created_at', { ascending: false }).limit(20)
    setClassificationHistory((classificationData ?? []) as ClassificationEditHistory[])
  }

  useEffect(() => {
    if (!transaction) return
    setCategory(transaction.cat)
    setSubcategory(transaction.subcat ?? '')
    setError('')
    setLastEditId(null)
    setScope('transaction')
    setPreview(null)
    setKind(transaction.kind)
    setIsRecurring(transaction.isRecurring ?? false)
    setIsSubscription(transaction.isSubscription ?? false)
    setSpendingNature(transaction.spendingNature ?? null)
    setIsReimbursable(transaction.isReimbursable ?? false)
    setIsTaxRelated(transaction.isTaxRelated ?? false)
    setLastClassificationEditId(null)
    void loadHistory(transaction.id)
  }, [transaction?.id, transaction?.cat, transaction?.subcat, transaction?.kind, transaction?.isRecurring, transaction?.isSubscription, transaction?.spendingNature, transaction?.isReimbursable, transaction?.isTaxRelated])

  useEffect(() => {
    if (!transaction) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [transaction, onClose])

  const subcategories = [...(FULL_TAXONOMY[category] ?? []), ...customSubcategories.filter((item) => item.category === category).map((item) => item.displayName)]
  const unchanged = transaction
    ? category === transaction.cat && subcategory === (transaction.subcat ?? '')
    : true
  const isReconciliation = transaction?.kind === 'adjustment' && transaction.subcat === 'Reconciliation'
  const confidence = transaction?.categoryConfidence
  const confidenceText = confidence == null ? 'Not recorded' : `${Math.round(confidence * 100)}%`

  const latestUndoable = useMemo(
    () => history.find((entry) => entry.scope === 'transaction' && !entry.undone_at)?.id ?? null,
    [history],
  )
  const latestClassificationUndoable = useMemo(
    () => classificationHistory.find((entry) => !entry.undone_at)?.id ?? null,
    [classificationHistory],
  )
  const classificationUnchanged = transaction
    ? kind === transaction.kind
      && isRecurring === (transaction.isRecurring ?? false)
      && isSubscription === (transaction.isSubscription ?? false)
      && spendingNature === (transaction.spendingNature ?? null)
      && isReimbursable === (transaction.isReimbursable ?? false)
      && isTaxRelated === (transaction.isTaxRelated ?? false)
    : true

  const saveClassification = async () => {
    if (!transaction || isReconciliation) return
    setClassificationSaving(true); setError('')
    const { data, error: mutationError } = await supabase.functions.invoke('update-transaction-classification', {
      body: { action: 'edit', transaction_id: transaction.id, kind, is_recurring: isRecurring,
        is_subscription: isSubscription, spending_nature: spendingNature,
        is_reimbursable: isReimbursable, is_tax_related: isTaxRelated },
    })
    setClassificationSaving(false)
    if (mutationError) { setError(mutationError.message || 'Could not save classification.'); return }
    setLastClassificationEditId(data.edit_id)
    await Promise.all([loadHistory(transaction.id), onChanged()])
  }

  const undoClassification = async () => {
    if (!transaction) return
    const editId = lastClassificationEditId ?? latestClassificationUndoable
    if (!editId) return
    setClassificationSaving(true); setError('')
    const { data, error: mutationError } = await supabase.functions.invoke('update-transaction-classification', {
      body: { action: 'undo', edit_id: editId },
    })
    setClassificationSaving(false)
    if (mutationError) { setError(mutationError.message || 'Could not undo classification.'); return }
    setKind(data.kind); setIsRecurring(data.is_recurring); setIsSubscription(data.is_subscription)
    setSpendingNature(data.spending_nature); setIsReimbursable(data.is_reimbursable); setIsTaxRelated(data.is_tax_related)
    setLastClassificationEditId(null)
    await Promise.all([loadHistory(transaction.id), onChanged()])
  }

  useEffect(() => {
    if (!transaction || scope !== 'merchant_rule' || !transaction.merchantKey || isReconciliation) {
      setPreview(null)
      return
    }
    let cancelled = false
    setPreviewing(true)
    const timer = window.setTimeout(() => {
      void supabase.functions.invoke('apply-merchant-rule', {
        body: {
          action: 'preview', merchantKey: transaction.merchantKey,
          merchantDisplay: transaction.merchant, category,
          subcategory: subcategory || null, applyToExisting: true,
        },
      }).then(({ data, error: previewError }) => {
        if (cancelled) return
        setPreviewing(false)
        if (previewError) {
          setError(previewError.message || 'Could not preview this merchant rule.')
          setPreview(null)
        } else {
          setError('')
          setPreview(data as RulePreview)
        }
      })
    }, 200)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [
    transaction?.id, transaction?.merchantKey, transaction?.merchant,
    transaction?.categorySource, transaction?.categoryConfidence, transaction?.needsReview,
    scope, category, subcategory, isReconciliation,
  ])

  const save = async () => {
    if (!transaction || (scope === 'transaction' && unchanged) || isReconciliation) return
    setSaving(true)
    setError('')
    const functionName = scope === 'transaction' ? 'update-transaction-category' : 'apply-merchant-rule'
    const body = scope === 'transaction'
      ? { action: 'edit', transaction_id: transaction.id, category, subcategory: subcategory || null }
      : {
        action: 'apply', merchantKey: transaction.merchantKey,
        merchantDisplay: transaction.merchant, category,
        subcategory: subcategory || null, applyToExisting: true,
      }
    const { data, error: invokeError } = await supabase.functions.invoke(functionName, { body })
    if (invokeError) {
      setError(invokeError.message || 'Could not update this transaction.')
      setSaving(false)
      return
    }
    const result = data as MutationResult
    setLastEditId(scope === 'transaction' ? result.edit_id : null)
    await onChanged()
    await loadHistory(transaction.id)
    setSaving(false)
  }

  const createCustomSubcategory = async () => {
    if (!customName.trim() || !category) return
    setSaving(true); setError('')
    const { data, error: invokeError } = await supabase.functions.invoke('manage-taxonomy', { body: { action: 'create_subcategory', category, name: customName.trim() } })
    setSaving(false)
    if (invokeError) { setError(invokeError.message || 'Could not create subcategory.'); return }
    setSubcategory(data.display_name); setCustomName(''); setAddingSubcategory(false); await onChanged()
  }

  const undo = async () => {
    const editId = lastEditId ?? latestUndoable
    if (!transaction || !editId) return
    setSaving(true)
    setError('')
    const { data, error: invokeError } = await supabase.functions.invoke('update-transaction-category', {
      body: { action: 'undo', edit_id: editId },
    })
    if (invokeError) {
      setError(invokeError.message || 'Could not undo this change.')
      setSaving(false)
      return
    }
    const result = data as MutationResult
    setCategory(result.category)
    setSubcategory(result.subcategory ?? '')
    setLastEditId(null)
    await onChanged()
    await loadHistory(transaction.id)
    setSaving(false)
  }

  return createPortal(
    <AnimatePresence>
      {transaction && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end bg-black/35"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
        >
          <motion.aside
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-drawer-title"
            initial={{ x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            className="h-full w-full max-w-[520px] overflow-y-auto border-l border-[var(--hair)] bg-surface p-6 shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-ink">Transaction detail</p>
                <h2 id="transaction-drawer-title" className="mt-1 truncate font-display text-[25px] font-black text-ink">{transaction.merchant}</h2>
                <p className="mt-1 text-[13px] text-muted">{transaction.date} · {transaction.account}</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close transaction detail" className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-[var(--hair)] text-ink transition hover:bg-[var(--hair-soft)]">×</button>
            </header>

            <div className="mt-6 rounded-xl border border-[var(--hair)] bg-[var(--input-bg)] p-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[12px] uppercase tracking-[0.08em] text-muted">Amount</span>
                <strong className={`font-display text-[22px] tabular-nums ${transaction.amount > 0 ? 'text-pos' : 'text-ink'}`}>{fmtCents(transaction.amount)}</strong>
              </div>
              <div className="mt-3 border-t border-[var(--hair-soft)] pt-3">
                <span className="text-[11px] uppercase tracking-[0.08em] text-muted">Original description</span>
                <p className="mt-1 break-words text-[13px] text-ink2">{transaction.originalDescription || transaction.merchant}</p>
              </div>
            </div>

            <section className="mt-6" aria-labelledby="category-edit-title">
              <div className="flex items-baseline justify-between gap-3">
                <h3 id="category-edit-title" className="font-display text-[15px] font-bold text-ink">Category</h3>
                <span className="text-[11px] text-muted">Choose the correction scope</span>
              </div>
              <div className="mt-3 grid gap-2">
                <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${scope === 'transaction' ? 'border-accent bg-[var(--accent-wash)]' : 'border-[var(--hair)]'}`}>
                  <input type="radio" name="category-scope" checked={scope === 'transaction'} onChange={() => setScope('transaction')} />
                  <span><strong className="block text-[12.5px] text-ink">Only this transaction</strong><span className="mt-0.5 block text-[11.5px] text-muted">Keeps this merchant’s other transactions unchanged.</span></span>
                </label>
                <label className={`flex gap-3 rounded-lg border p-3 ${transaction.merchantKey ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} ${scope === 'merchant_rule' ? 'border-accent bg-[var(--accent-wash)]' : 'border-[var(--hair)]'}`}>
                  <input type="radio" name="category-scope" checked={scope === 'merchant_rule'} disabled={!transaction.merchantKey} onChange={() => setScope('merchant_rule')} />
                  <span><strong className="block text-[12.5px] text-ink">All matching past and future</strong><span className="mt-0.5 block text-[11.5px] text-muted">Creates a reusable rule for this normalised merchant.</span></span>
                </label>
              </div>

              {isReconciliation ? (
                <p className="mt-4 rounded-lg border border-[var(--hair)] bg-[var(--hair-soft)] p-3 text-[12.5px] text-ink2">This is a system reconciliation entry and its category is locked.</p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-[12px] font-semibold text-ink2">
                    Category
                    <Select value={category} onChange={(value) => { setCategory(value); setSubcategory('') }} ariaLabel="Transaction category">
                      {ALL_CATEGORIES.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
                    </Select>
                  </label>
                  <label className="grid gap-1.5 text-[12px] font-semibold text-ink2">
                    Subcategory
                    <Select value={subcategory} onChange={setSubcategory} ariaLabel="Transaction subcategory">
                      <option value="">No subcategory</option>
                      {subcategories
                        .filter((candidate) => !(category === 'Transfer' && candidate === 'Reconciliation'))
                        .map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
                    </Select>
                    {FULL_TAXONOMY[category] && category !== 'Uncategorized' && category !== 'Income' && category !== 'Transfer' && category !== 'Investing' && (
                      <button type="button" className="min-h-11 text-left text-[11px] font-semibold text-accent-ink" onClick={() => setAddingSubcategory((value) => !value)}>+ Add custom subcategory</button>
                    )}
                  </label>
                </div>
              )}

              {addingSubcategory && !isReconciliation && <div className="mt-3 flex flex-wrap gap-2 rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] p-3">
                <input value={customName} maxLength={48} onChange={(event) => setCustomName(event.target.value)} aria-label="Custom subcategory name" placeholder={`New ${category} subcategory`} className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-[var(--hair)] bg-surface px-3 text-[13px] text-ink outline-none focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)]" />
                <Button variant="ghost" onClick={() => void createCustomSubcategory()} disabled={saving || !customName.trim()}>Create</Button>
              </div>}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {!isReconciliation && <Button onClick={() => void save()} disabled={saving || previewing || (scope === 'transaction' && unchanged)}>{saving ? 'Saving…' : scope === 'merchant_rule' ? 'Create rule and apply' : 'Save correction'}</Button>}
                {scope === 'transaction' && (lastEditId || latestUndoable) && <Button variant="ghost" onClick={() => void undo()} disabled={saving}>Undo latest change</Button>}
              </div>
              {scope === 'merchant_rule' && (
                <p className="mt-3 rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] p-3 text-[12px] leading-relaxed text-ink2" aria-live="polite">
                  {previewing || !preview
                    ? 'Checking matching transactions…'
                    : `${preview.existing_matches} existing transaction${preview.existing_matches === 1 ? '' : 's'} match; ${preview.transactions_to_update} will change now. Future matches will use this rule.`}
                </p>
              )}
              {error && <p role="alert" className="mt-3 text-[12.5px] text-neg">{error}</p>}
            </section>

            <section className="mt-7 border-t border-[var(--hair)] pt-5" aria-labelledby="classification-edit-title">
              <div className="flex items-baseline justify-between gap-3">
                <h3 id="classification-edit-title" className="font-display text-[15px] font-bold text-ink">Accounting & attributes</h3>
                <span className="text-[11px] text-muted">Transaction only</span>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">Kind controls cash-flow behavior. Attributes describe cross-cutting context without changing the spending category.</p>
              {isReconciliation ? (
                <p className="mt-3 rounded-lg border border-[var(--hair)] bg-[var(--hair-soft)] p-3 text-[12.5px] text-ink2">System reconciliation entries remain locked as adjustments.</p>
              ) : (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-[12px] font-semibold text-ink2">Kind
                      <Select value={kind} onChange={(value) => setKind(value as TransactionKind)} ariaLabel="Transaction kind">
                        {TRANSACTION_KINDS.map((candidate) => <option key={candidate} value={candidate}>{KIND_LABELS[candidate]}</option>)}
                      </Select>
                    </label>
                    <label className="grid gap-1.5 text-[12px] font-semibold text-ink2">Spending nature
                      <Select value={spendingNature ?? ''} onChange={(value) => setSpendingNature((value || null) as SpendingNature)} ariaLabel="Transaction spending nature">
                        <option value="">Not set</option>
                        <option value="essential">Essential</option>
                        <option value="discretionary">Discretionary</option>
                      </Select>
                    </label>
                  </div>
                  <div className="mt-3 divide-y divide-[var(--hair-soft)] rounded-xl border border-[var(--hair)] px-3">
                    <Switch on={isRecurring} onToggle={() => setIsRecurring((value) => !value)} label="Recurring" />
                    <Switch on={isSubscription} onToggle={() => setIsSubscription((value) => !value)} label="Subscription" />
                    <Switch on={isReimbursable} onToggle={() => setIsReimbursable((value) => !value)} label="Reimbursable" />
                    <Switch on={isTaxRelated} onToggle={() => setIsTaxRelated((value) => !value)} label="Tax-related" />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button onClick={() => void saveClassification()} disabled={classificationSaving || classificationUnchanged}>{classificationSaving ? 'Saving…' : 'Save attributes'}</Button>
                    {(lastClassificationEditId || latestClassificationUndoable) && <Button variant="ghost" onClick={() => void undoClassification()} disabled={classificationSaving}>Undo attribute change</Button>}
                  </div>
                </>
              )}
              {classificationHistory.length > 0 && (
                <ul className="mt-4 grid gap-2">
                  {classificationHistory.slice(0, 5).map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-[var(--hair-soft)] p-3 text-[12px]">
                      <div className="text-ink2">{KIND_LABELS[entry.before_kind]} → <strong className="text-ink">{KIND_LABELS[entry.after_kind]}</strong></div>
                      <div className="mt-1 text-muted">{new Date(entry.created_at).toLocaleString()}{entry.undone_at ? ' · Undone' : ''}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <TransactionSplitEditor transaction={transaction} customSubcategories={customSubcategories} onChanged={onChanged} />

            <section className="mt-7 border-t border-[var(--hair)] pt-5">
              <h3 className="font-display text-[14px] font-bold text-ink">Classification status</h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-[12.5px]">
                <div><dt className="text-muted">Kind</dt><dd className="mt-0.5 font-medium text-ink">{KIND_LABELS[transaction.kind]}</dd></div>
                <div><dt className="text-muted">Kind source</dt><dd className="mt-0.5 font-medium capitalize text-ink">{transaction.kindSource ?? 'derived'}</dd></div>
                <div><dt className="text-muted">Source</dt><dd className="mt-0.5 font-medium text-ink">{sourceLabel(transaction.categorySource)}</dd></div>
                <div><dt className="text-muted">Confidence</dt><dd className="mt-0.5 font-medium text-ink">{confidenceText}</dd></div>
                <div><dt className="text-muted">Review</dt><dd className="mt-0.5 font-medium text-ink">{transaction.needsReview ? 'Needs review' : 'Resolved'}</dd></div>
                <div><dt className="text-muted">Transfer state</dt><dd className="mt-0.5 font-medium capitalize text-ink">{transaction.transferState ?? 'none'}</dd></div>
              </dl>
            </section>

            <section className="mt-7 border-t border-[var(--hair)] pt-5">
              <h3 className="font-display text-[14px] font-bold text-ink">Category history</h3>
              {history.length === 0 ? (
                <p className="mt-2 text-[12.5px] text-muted">No manual category changes yet.</p>
              ) : (
                <ul className="mt-3 grid gap-3">
                  {history.map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-[var(--hair-soft)] p-3 text-[12px]">
                      <div className="text-ink2">{pair(entry.before_category, entry.before_subcategory)} → <strong className="text-ink">{pair(entry.after_category, entry.after_subcategory)}</strong></div>
                      <div className="mt-1 text-muted">{new Date(entry.created_at).toLocaleString()} · {entry.scope === 'merchant_rule' ? 'Merchant rule' : entry.scope === 'selection' ? 'Bulk selection' : 'Single transaction'}{entry.undone_at ? ' · Undone' : ''}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
