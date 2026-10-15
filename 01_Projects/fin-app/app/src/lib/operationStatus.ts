export type OperationState = 'idle' | 'working' | 'succeeded' | 'failed'

export type OperationStepState = 'complete' | 'current' | 'upcoming'

export interface OperationStep {
  id: string
  label: string
  state: OperationStepState
  detail?: string
}

export type OperationProgressValue =
  | { kind: 'indeterminate' }
  | { kind: 'determinate'; current: number; total: number }

/**
 * Protect the UI from displaying impossible percentages. Callers still own the
 * truthfulness of their checkpoint; this only normalises a real count for a
 * visual meter.
 */
export function progressFraction(progress: OperationProgressValue): number | null {
  if (progress.kind === 'indeterminate') return null
  if (!Number.isFinite(progress.current) || !Number.isFinite(progress.total) || progress.total <= 0) return null
  return Math.min(1, Math.max(0, progress.current / progress.total))
}

export function operationStateRole(state: OperationState): 'status' | 'alert' | undefined {
  if (state === 'failed') return 'alert'
  if (state === 'working' || state === 'succeeded') return 'status'
  return undefined
}

export function completedOperationSteps(steps: readonly OperationStep[]): number {
  return steps.filter((step) => step.state === 'complete').length
}
