import { useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { fmtCents } from '../../data'
import { wrappedFocusIndex } from '../../hooks/useDialogFocus'

export const money = (cents: number) => fmtCents(cents)
export const shortDate = (iso: string) => new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
export function Action({ children, tone = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'secondary' | 'quiet' | 'link' }) {
  return <button type="button" className={`bc-button bc-button--${tone} ${className}`} {...props}>{children}</button>
}
export function Icon({ name, size = 20 }: { name: 'arrow' | 'plus' | 'close' | 'check' | 'moon' | 'sun' | 'chevron' | 'info' | 'mountain' | 'wallet' | 'calendar' | 'plane'; size?: number }) {
  const paths = {
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    moon: <path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.1" /></>,
    mountain: <><path d="m2 20 8-15 5 9 3-5 4 11ZM7 11l3 3 3-3" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M3 8h18m-5 4h5v5h-5Z" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2" /></>,
    plane: <path d="m22 2-7 20-4-9-9-4 20-7ZM11 13 22 2" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
export function Meter({ value, max, label, warning = false }: { value: number; max: number; label: string; warning?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, value / max * 100)) : 0
  return <div className={`bc-meter ${warning ? 'bc-meter--warning' : ''}`} role="img" aria-label={label}><span style={{ width: `${pct}%` }} /></div>
}
export function AmountField({ label, value, onChange, hint, id, required = true }: { label: string; value: string; onChange: (value: string) => void; hint?: string; id: string; required?: boolean }) {
  return <div className="bc-field"><label htmlFor={id}>{label}</label><div className="bc-money-input"><span aria-hidden="true">$</span><input id={id} inputMode="decimal" autoComplete="off" value={value} onChange={e => onChange(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} required={required} /></div>{hint && <p id={`${id}-hint`} className="bc-hint">{hint}</p>}</div>
}
export function Comparison({ rows, beforeLabel = 'Now', afterLabel = 'After' }: { rows: { label: string; before: number; after: number }[]; beforeLabel?: string; afterLabel?: string }) {
  return <div className="bc-comparison"><div className="bc-comparison-head"><span>What changes</span><span>{beforeLabel}</span><span>{afterLabel}</span></div>{rows.map(r => <div key={r.label}><span>{r.label}</span><span>{money(r.before)}</span><strong className={r.after < 0 ? 'bc-negative' : ''}>{money(r.after)}</strong></div>)}</div>
}

/** Native modal gives inert background/focus trapping; only this task can scroll. */
export function TaskDialog({ title, eyebrow, onClose, children, resumable = false, compact = false }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; resumable?: boolean; compact?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [dirty, setDirty] = useState(false)
  const [discard, setDiscard] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current!
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    el.showModal()
    el.focus()
    // Native dialog initial focus is outside React's delegated child events.
    // Use the same document-level boundary as Halcyon's other dialogs.
    const keepFocus = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !el.open) return
      const controls = [...el.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, a[href]')].filter(node => node.getClientRects().length > 0)
      const index = controls.indexOf(document.activeElement as HTMLElement)
      if (!controls.length) { e.preventDefault(); el.focus(); return }
      if (index < 0 || (e.shiftKey && index === 0) || (!e.shiftKey && index === controls.length - 1)) {
        e.preventDefault(); controls[wrappedFocusIndex(index, controls.length, e.shiftKey)].focus()
      }
    }
    document.addEventListener('keydown', keepFocus)
    return () => {
      document.removeEventListener('keydown', keepFocus)
      el.close()
      requestAnimationFrame(() => {
        if (document.querySelector('dialog[open]')) return
        const fallback = document.querySelector<HTMLElement>('[data-budget-focus-fallback]')
        ;(opener?.isConnected ? opener : fallback)?.focus({ preventScroll: true })
      })
    }
  }, [])
  const close = () => dirty && !resumable ? setDiscard(true) : onClose()
  return createPortal(<dialog ref={ref} className={`bc-dialog ${compact ? 'bc-dialog--phone' : ''}`} aria-modal="true" aria-labelledby="budget-task-title" tabIndex={-1}
    onCancel={e => { e.preventDefault(); close() }} onInputCapture={() => setDirty(true)} onChangeCapture={() => setDirty(true)}
    onClickCapture={e => { if ((e.target as Element).closest('.bc-task-body button')) setDirty(true) }}>
    <div className="bc-task-top"><div>{eyebrow && <p className="bc-eyebrow">{eyebrow}</p>}<h2 id="budget-task-title">{title}</h2></div><Action tone="quiet" aria-label={resumable ? 'Continue setup later' : 'Close task'} onClick={close}><Icon name="close" /></Action></div>
    {discard ? <div className="bc-discard" role="alert"><h3>Keep your changes?</h3><p>Your edits haven't been saved to the plan yet.</p><div className="bc-actions"><Action tone="primary" onClick={() => setDiscard(false)}>Keep editing</Action><Action onClick={onClose}>Discard changes</Action></div></div> : children}
  </dialog>, document.body)
}

export function GoalArt({ flight = false }: { flight?: boolean }) {
  return <div className="bc-goal-art" aria-hidden="true"><svg viewBox="0 0 240 125" fill="none"><circle cx="166" cy="42" r="23" fill="currentColor" opacity=".1" /><path d="M10 110 78 26l45 58 28-35 77 61" stroke="currentColor" strokeWidth="1.5" /><path d="m55 55 23 12 16-19M132 73l19 11 12-18M0 117h240" stroke="currentColor" strokeWidth="1" opacity=".5" />{flight ? <path d="m150 10 61 7-25 11 2 19-10-13-17 8 8-17-19-15Z" stroke="currentColor" strokeWidth="1.5" /> : <rect x="179" y="48" width="13" height="65" rx="6.5" transform="rotate(20 179 48)" stroke="currentColor" strokeWidth="2" />}</svg></div>
}
