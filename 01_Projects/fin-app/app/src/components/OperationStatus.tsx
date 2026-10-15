import type { ReactNode } from 'react'
import {
  completedOperationSteps,
  operationStateRole,
  progressFraction,
  type OperationProgressValue,
  type OperationState,
  type OperationStep,
} from '../lib/operationStatus'

type Tone = 'neutral' | 'success' | 'error'

function ActivityIcon() {
  return (
    <svg className="operation-activity__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
}

function FailureIcon() {
  return <span className="operation-status__failure-icon" aria-hidden="true">!</span>
}

export function InlineActivity({ label = 'Working', size = 'regular' }: { label?: string; size?: 'compact' | 'regular' }) {
  return (
    <span className={`operation-activity operation-activity--${size}`} role="status" aria-label={label}>
      <ActivityIcon />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function OperationStatusPanel({
  state,
  title,
  description,
  children,
  action,
  className = '',
}: {
  state: OperationState
  title: string
  description: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const tone: Tone = state === 'failed' ? 'error' : state === 'succeeded' ? 'success' : 'neutral'
  const role = operationStateRole(state)

  return (
    <section className={`outcome-panel operation-status operation-status--${tone} ${className}`} role={role} aria-live={role === 'status' ? 'polite' : undefined} aria-busy={state === 'working' || undefined}>
      <div className="flex items-start gap-3">
        {state === 'working' ? <InlineActivity label={title} /> : state === 'succeeded' ? <span className="operation-status__check"><CheckIcon /></span> : state === 'failed' ? <FailureIcon /> : null}
        <div className="min-w-0 flex-1">
          <p className="control-label">{title}</p>
          <div className="mt-1 body-copy">{description}</div>
        </div>
      </div>
      {children && <div className="mt-5">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </section>
  )
}

export function OperationSteps({ steps, label = 'Operation stages' }: { steps: readonly OperationStep[]; label?: string }) {
  const completed = completedOperationSteps(steps)
  return (
    <ol className="operation-steps" aria-label={label}>
      {steps.map((step) => (
        <li key={step.id} className={`operation-steps__item operation-steps__item--${step.state}`}>
          {step.state === 'complete' ? <span className="operation-steps__mark operation-steps__mark--complete"><CheckIcon /></span>
            : step.state === 'current' ? <InlineActivity label={`${step.label} in progress`} size="compact" />
              : <span className="operation-steps__mark operation-steps__mark--upcoming" aria-hidden="true" />}
          <span className="min-w-0"><span className="operation-steps__label">{step.label}</span>{step.detail && <span className="operation-steps__detail">{step.detail}</span>}</span>
        </li>
      ))}
      <li className="sr-only" role="status">{completed} of {steps.length} stages complete.</li>
    </ol>
  )
}

export function OperationProgress({
  progress,
  label,
  detail,
}: {
  progress: OperationProgressValue
  label: string
  detail?: ReactNode
}) {
  const fraction = progressFraction(progress)
  const isDeterminate = progress.kind === 'determinate' && fraction !== null
  const current = progress.kind === 'determinate' ? progress.current : undefined
  const total = progress.kind === 'determinate' ? progress.total : undefined
  const text = isDeterminate && current !== undefined && total !== undefined ? `${current} of ${total}` : 'In progress'

  return (
    <div className="operation-progress" aria-busy="true">
      <div className="flex items-baseline justify-between gap-3">
        <span className="control-label">{label}</span>
        <strong className="operation-progress__count">{text}</strong>
      </div>
      <progress className="operation-progress__meter" aria-label={label} max={isDeterminate ? total : undefined} value={isDeterminate ? current : undefined}>
        {isDeterminate ? text : undefined}
      </progress>
      {detail && <p className="mt-3 detail-copy" role="status">{detail}</p>}
    </div>
  )
}

export function BackgroundOperationNotice({
  title,
  detail,
  state = 'working',
  action,
}: {
  title: string
  detail: ReactNode
  state?: Extract<OperationState, 'working' | 'succeeded' | 'failed'>
  action?: ReactNode
}) {
  return (
    <aside className={`operation-background operation-background--${state}`} role={state === 'failed' ? 'alert' : 'status'} aria-live={state === 'failed' ? undefined : 'polite'} aria-busy={state === 'working' || undefined}>
      <div className="flex min-w-0 items-start gap-3">
        {state === 'working' ? <InlineActivity label={title} size="compact" /> : state === 'succeeded' ? <span className="operation-status__check"><CheckIcon /></span> : <FailureIcon />}
        <div className="min-w-0 flex-1"><p className="control-label">{title}</p><div className="mt-1 detail-copy">{detail}</div></div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </aside>
  )
}
