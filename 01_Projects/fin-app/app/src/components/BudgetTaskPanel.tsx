import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useBudget } from '../contexts/BudgetContext'
import { Button } from './Controls'

/** Native modal is the sole focus/inertness owner. Do not add useDialogFocus. */
export default function BudgetTaskPanel({ title, children, onClose, resetKey, completion='commit', open=true, retainOnClose=false, description, returnFocus }: {
  title: string; children: ReactNode; onClose: () => void; resetKey?:string; completion?:'commit'|'recovery'; open?:boolean; retainOnClose?:boolean; description?:string; returnFocus?:()=>HTMLElement|null
}) {
  const b = useBudget(), id = useId(), dialog = useRef<HTMLDialogElement>(null)
  const [dirty, setDirty] = useState(false)
  const [leave, setLeave] = useState<{ proceed: () => void } | null>(null)
  useLayoutEffect(() => { setDirty(false); setLeave(null) }, [resetKey])
  const previousFocus = useRef<HTMLElement | null>(null)
  const stay = useRef<HTMLButtonElement>(null)
  const outside = useRef(false)
  const hadPending = useRef(false)
  useEffect(() => {
    if (b.pending) { if (completion==='commit'||!b.busy) hadPending.current = true }
    else if (!b.busy) {
      if (hadPending.current && b.notice === 'Budget saved. No money was moved.') onClose()
      hadPending.current = false
    }
  }, [b.pending, b.busy, b.notice, onClose, completion])
  const attempt = useRef<(proceed: () => void) => void>(() => {})
  attempt.current = proceed => {
    if (b.busy || b.pending) return
    if (retainOnClose) { onClose(); proceed(); return }
    if (dirty) {
      previousFocus.current = document.activeElement as HTMLElement
      setLeave(current => current ?? { proceed })
    } else { onClose(); proceed() }
  }
  const close = () => {
    // An unknown result may close into page recovery, but never cancels its request.
    if (b.pending && !b.busy) onClose()
    else attempt.current(() => {})
  }
  useLayoutEffect(() => { if(open)return b.guardTaskNavigation(next => attempt.current(next)) }, [b.guardTaskNavigation,open])
  useLayoutEffect(() => {
    if(!open)return
    const el = dialog.current!, opener = document.activeElement as HTMLElement | null
    el.showModal(); el.focus({ preventScroll: true })
    return () => {
      el.close()
      requestAnimationFrame(() => {
        const fallback = document.querySelector<HTMLElement>('.budget-workspace h2')
        if (fallback) fallback.tabIndex = -1
        ;(returnFocus?.() ?? (opener?.isConnected ? opener : fallback))?.focus({ preventScroll: true })
      })
    }
  }, [open])
  useLayoutEffect(() => { if (leave) stay.current?.focus() }, [leave])
  useLayoutEffect(() => {
    if (!dirty && !b.pending) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, b.pending])
  const isOutside = (event: { clientX: number; clientY: number }) => {
    const rect = dialog.current!.getBoundingClientRect()
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
  }
  return createPortal(<dialog ref={dialog} className="budget-task budget-panel" tabIndex={-1}
    aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} aria-modal="true"
    onKeyDown={event => {
      // Native modality keeps the document inert; explicitly wrap Tab at our
      // boundaries so keyboard users do not land in browser chrome from the title.
      if (event.key !== 'Tab') return
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],summary,[tabindex]')]
        .filter(el => !el.matches(':disabled,[tabindex="-1"]') && el.getClientRects().length > 0)
      const first = controls[0], last = controls.at(-1), active = document.activeElement
      if (!first) { event.preventDefault(); event.currentTarget.focus() }
      else if (!controls.includes(active as HTMLElement) || event.shiftKey && active === first || !event.shiftKey && active === last) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus()
      }
    }}
    onCancel={event => { event.preventDefault(); if (leave) { setLeave(null); requestAnimationFrame(() => previousFocus.current?.focus()) } else close() }}
    onPointerDown={event => { outside.current = event.target === event.currentTarget && isOutside(event) }}
    onClick={event => { if (outside.current && event.target === event.currentTarget && isOutside(event)) close(); outside.current = false }}>
    <header className="budget-task-header"><div><p className="micro text-muted">Your budget plan</p><h3 id={`${id}-title`} className="font-display text-2xl font-bold">{title}</h3></div><Button variant="ghost" disabled={b.busy} onClick={close}>Close</Button></header>
    <div className="budget-task-body">
      <p id={`${id}-description`} className="detail-copy text-muted mb-5">{description??'Review the effects before saving. Your bank money stays where it is.'}</p>
      {b.error && <p role="alert" className="outcome-panel text-neg mb-4">{b.error}</p>}
      {b.pending && <div className="outcome-panel mb-4 space-y-3" role="status"><p>{b.busy ? 'Saving your budget. Keep this task open while we check the result.' : 'The save result needs checking. Your original request is retained; closing this task does not cancel it.'}</p>{!b.busy && <Button onClick={() => void b.recover()}>Check saved result</Button>}</div>}
      {leave && <section aria-labelledby={`${id}-leave`} className="outcome-panel space-y-4"><h4 id={`${id}-leave`} className="font-semibold">Leave these unsaved changes?</h4><p>Your saved budget stays unchanged. Stay to keep editing, or leave to discard these unsaved choices.</p><div className="flex flex-wrap gap-3"><button ref={stay} type="button" className="budget-panel-stay" onClick={() => { setLeave(null); requestAnimationFrame(() => previousFocus.current?.focus()) }}>Stay and keep editing</button><Button variant="ghost" onClick={() => { const next = leave.proceed; onClose(); next() }}>Leave without saving</Button></div></section>}
      <div hidden={!!leave} onChangeCapture={() => setDirty(true)} onInputCapture={() => setDirty(true)}
        onClickCapture={event => { if ((event.target as HTMLElement).closest('[data-budget-draft-change]')) setDirty(true) }}>{children}</div>
    </div>
  </dialog>, document.body)
}
