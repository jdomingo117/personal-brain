import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { BackgroundOperationNotice, InlineActivity, OperationProgress, OperationStatusPanel, OperationSteps } from '../components/OperationStatus'
import { completedOperationSteps, operationStateRole, progressFraction } from './operationStatus'

describe('operation status view model', () => {
  it('uses a number only for valid, bounded progress', () => {
    expect(progressFraction({ kind: 'indeterminate' })).toBeNull()
    expect(progressFraction({ kind: 'determinate', current: 3, total: 4 })).toBe(0.75)
    expect(progressFraction({ kind: 'determinate', current: 8, total: 4 })).toBe(1)
    expect(progressFraction({ kind: 'determinate', current: -2, total: 4 })).toBe(0)
    expect(progressFraction({ kind: 'determinate', current: 1, total: 0 })).toBeNull()
  })

  it('uses an assertive region only for a failure', () => {
    expect(operationStateRole('idle')).toBeUndefined()
    expect(operationStateRole('working')).toBe('status')
    expect(operationStateRole('succeeded')).toBe('status')
    expect(operationStateRole('failed')).toBe('alert')
  })

  it('counts completed stages without treating the current stage as finished', () => {
    expect(completedOperationSteps([
      { id: 'protect', label: 'Protecting decisions', state: 'complete' },
      { id: 'review', label: 'Reviewing groups', state: 'current' },
      { id: 'ready', label: 'Preparing results', state: 'upcoming' },
    ])).toBe(1)
  })

  it('emits a native numeric meter only when it has a real checkpoint', () => {
    const determinate = renderToStaticMarkup(createElement(OperationProgress, {
      label: 'Rows validated', progress: { kind: 'determinate', current: 3, total: 4 },
    }))
    const indeterminate = renderToStaticMarkup(createElement(OperationProgress, {
      label: 'Committing import', progress: { kind: 'indeterminate' },
    }))

    expect(determinate).toContain('<progress')
    expect(determinate).toContain('value="3"')
    expect(determinate).toContain('max="4"')
    expect(indeterminate).toContain('<progress')
    expect(indeterminate).not.toContain('value=')
    expect(indeterminate).not.toContain('max=')
  })

  it('marks working content busy and failures assertive', () => {
    const working = renderToStaticMarkup(createElement(OperationStatusPanel, {
      state: 'working', title: 'Preparing review', description: 'Preview only.',
    }))
    const failed = renderToStaticMarkup(createElement(OperationStatusPanel, {
      state: 'failed', title: 'Could not prepare review', description: 'No data changed.',
    }))

    expect(working).toContain('role="status"')
    expect(working).toContain('aria-busy="true"')
    expect(failed).toContain('role="alert"')
    expect(failed).not.toContain('aria-busy="true"')
  })

  it('keeps compact activity labelled and preserves current/upcoming stage meaning', () => {
    const activity = renderToStaticMarkup(createElement(InlineActivity, { label: 'Saving correction', size: 'compact' }))
    const steps = renderToStaticMarkup(createElement(OperationSteps, {
      steps: [
        { id: 'saved', label: 'Saved stage', state: 'complete' },
        { id: 'writing', label: 'Writing change', state: 'current' },
        { id: 'done', label: 'Ready', state: 'upcoming' },
      ],
    }))

    expect(activity).toContain('role="status"')
    expect(activity).toContain('aria-label="Saving correction"')
    expect(steps).toContain('Writing change in progress')
    expect(steps).toContain('1 of 3 stages complete.')
  })

  it('uses a polite busy region for durable background work and an alert for failure', () => {
    const working = renderToStaticMarkup(createElement(BackgroundOperationNotice, {
      title: 'Provider sync in progress', detail: 'Checking Everyday cash.',
    }))
    const failed = renderToStaticMarkup(createElement(BackgroundOperationNotice, {
      state: 'failed', title: 'Provider sync needs attention', detail: 'Reconnect to continue.',
    }))

    expect(working).toContain('role="status"')
    expect(working).toContain('aria-busy="true"')
    expect(failed).toContain('role="alert"')
    expect(failed).not.toContain('aria-busy="true"')
  })

  it('retains a static activity cue when reduced motion is requested', () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.operation-activity__icon \{ animation: none !important; \}/)
  })
})
