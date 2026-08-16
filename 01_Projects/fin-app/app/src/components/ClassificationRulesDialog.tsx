import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabaseClient'
import { Button, Select, Switch } from './Controls'
import { useDialogFocus } from '../hooks/useDialogFocus'

type Rule = { id: string; merchant_display: string; merchant_key: string; category: string; subcategory: string | null; hit_count: number; updated_at: string }

export default function ClassificationRulesDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => Promise<void> }) {
  const dialogRef = useDialogFocus()
  const [rules, setRules] = useState<Rule[]>([])
  const [threshold, setThreshold] = useState('0.75')
  const [missing, setMissing] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const load = async () => {
    const [rulesRes, policyRes] = await Promise.all([
      supabase.from('merchant_rules').select('id,merchant_display,merchant_key,category,subcategory,hit_count,updated_at').eq('source', 'user').order('merchant_display'),
      supabase.from('classification_review_policies').select('ai_confidence_threshold,review_ai_missing_subcategory').maybeSingle(),
    ])
    if (rulesRes.error) setError(rulesRes.error.message); else setRules(rulesRes.data ?? [])
    if (policyRes.data) { setThreshold(String(policyRes.data.ai_confidence_threshold)); setMissing(policyRes.data.review_ai_missing_subcategory) }
  }
  useEffect(() => { void load(); const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key) }, [onClose])
  const savePolicy = async () => {
    setSaving(true); setError('')
    const { error: invokeError } = await supabase.functions.invoke('manage-classification-policy', { body: { ai_confidence_threshold: Number(threshold), review_ai_missing_subcategory: missing } })
    setSaving(false)
    if (invokeError) { setError(invokeError.message || 'Could not save review policy.'); return }
    await onChanged()
  }
  const remove = async (rule: Rule) => {
    setSaving(true); setError('')
    const { error: invokeError } = await supabase.functions.invoke('manage-merchant-rule', { body: { action: 'delete', rule_id: rule.id } })
    setSaving(false)
    if (invokeError) { setError(invokeError.message || 'Could not delete rule.'); return }
    await load()
  }
  return createPortal(<div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="rule-manager-title" className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto rounded-2xl border border-[var(--hair)] bg-surface p-5 shadow-2xl sm:p-6">
      <header className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-ink">Classification intelligence</p><h2 id="rule-manager-title" className="mt-1 font-display text-[24px] font-black text-ink">Rules & review policy</h2><p className="mt-1 text-[12px] text-muted">Control what the system learns and when AI suggestions need attention.</p></div><button type="button" aria-label="Close rules and review policy" onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-[var(--hair)]">×</button></header>
      <section className="mt-6 rounded-xl border border-[var(--hair)] bg-[var(--input-bg)] p-4" aria-labelledby="review-policy-title"><h3 id="review-policy-title" className="font-display text-[15px] font-bold text-ink">AI review policy</h3><p className="mt-1 text-[12px] text-muted">AI assignments below this confidence enter Needs review. User and bank precedence is unchanged.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-[12px] font-semibold text-ink2">Minimum confidence<Select value={threshold} onChange={setThreshold} ariaLabel="Minimum AI confidence"><option value="0.6">60% · More automation</option><option value="0.75">75% · Balanced</option><option value="0.9">90% · More review</option></Select></label><div className="rounded-lg border border-[var(--hair)] px-3"><Switch on={missing} onToggle={() => setMissing((value) => !value)} label="Review AI rows missing a subcategory" /></div></div><Button className="mt-3" onClick={() => void savePolicy()} disabled={saving}>{saving ? 'Saving…' : 'Save review policy'}</Button></section>
      <section className="mt-6" aria-labelledby="merchant-rules-title"><div className="flex items-baseline justify-between gap-3"><h3 id="merchant-rules-title" className="font-display text-[15px] font-bold text-ink">Your merchant rules</h3><span className="text-[11px] tabular-nums text-muted">{rules.length} rules</span></div>{rules.length === 0 ? <p className="mt-3 rounded-lg border border-[var(--hair)] p-4 text-[12px] text-muted">No reusable rules yet. Create one from a transaction drawer using “All matching past and future”.</p> : <ul className="mt-3 divide-y divide-[var(--hair-soft)] rounded-xl border border-[var(--hair)]">{rules.map((rule) => <li key={rule.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><div className="min-w-0"><strong className="block truncate text-[13px] text-ink">{rule.merchant_display}</strong><span className="text-[11px] text-muted">{rule.category}{rule.subcategory ? ` · ${rule.subcategory}` : ''} · used {rule.hit_count} times</span></div><Button variant="ghost" onClick={() => void remove(rule)} disabled={saving}>Delete rule</Button></li>)}</ul>}</section>
      {error && <p role="alert" className="mt-4 text-[12px] text-neg">{error}</p>}
    </section>
  </div>, document.body)
}
