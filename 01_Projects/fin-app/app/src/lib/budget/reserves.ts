import { BudgetCalculationError } from './types.ts'
import type { ContributionEvidence, GoalInput } from './types.ts'
import { ceilDivide, cents, fromBigInt, nonnegative, subtract, sumCents } from './money.ts'
import { addMonths, contributionDates, dateParts } from './periods.ts'
import { identity } from './plan.ts'

/** Inputs are authoritative bounded aggregates, not a transaction list. Confirmation adds no credit. */
export function reserveBalance(input: { opening: number; allocation: number; reallocation: number; netExpense: number }) {
  cents(input.opening); nonnegative(input.allocation); cents(input.reallocation); cents(input.netExpense)
  return fromBigInt(BigInt(input.opening) + BigInt(input.allocation) + BigInt(input.reallocation) - BigInt(input.netExpense))
}
/** Validate explicit divisions of one stable movement. This is a preview, not concurrency authority. */
export function contributionProgress(planned: number, evidence: readonly ContributionEvidence[]) {
  nonnegative(planned)
  const ids = new Set<string>(), movements = new Map<string, { capacity: bigint; claimed: bigint }>()
  for (const item of evidence) {
    identity(item.id); identity(item.movementId); nonnegative(item.amount); nonnegative(item.sourceCapacity)
    if (ids.has(item.id)) throw new BudgetCalculationError('overlap', 'Duplicate funding evidence.')
    ids.add(item.id)
    if (!['bank-observed', 'user-confirmed'].includes(item.kind)) throw new BudgetCalculationError('invalid-input', 'Unknown funding provenance.')
    if (item.reversed) continue
    const existing = movements.get(item.movementId)
    if (existing && existing.capacity !== BigInt(item.sourceCapacity)) throw new BudgetCalculationError('invalid-input', 'Conflicting movement capacity.')
    const claimed = (existing?.claimed ?? 0n) + BigInt(item.amount)
    if (claimed > BigInt(item.sourceCapacity)) throw new BudgetCalculationError('capacity', 'This movement has already been claimed.')
    movements.set(item.movementId, { capacity: BigInt(item.sourceCapacity), claimed })
  }
  const active = evidence.filter(e => !e.reversed)
  const bankObserved = sumCents(active.filter(e => e.kind === 'bank-observed').map(e => e.amount))
  const userConfirmed = sumCents(active.filter(e => e.kind === 'user-confirmed').map(e => e.amount))
  const recorded = sumCents([bankObserved, userConfirmed])
  return { planned, bankObserved, userConfirmed, recorded, outstanding: Math.max(0, subtract(planned, recorded)), abovePlan: Math.max(0, subtract(recorded, planned)) }
}
export function goalProgress(input: GoalInput) {
  if (input.target !== null) nonnegative(input.target)
  cents(input.reserveRemaining); nonnegative(input.netPurchases); nonnegative(input.contribution)
  dateParts(input.asOf)
  if (!['draft', 'saving', 'paused', 'purchase-recorded', 'archived'].includes(input.state)) throw new BudgetCalculationError('invalid-input', 'Unknown goal lifecycle state.')
  const coverage = sumCents([input.reserveRemaining, input.netPurchases])
  const gap = input.target === null ? null : Math.max(0, subtract(input.target, coverage))
  return {
    reserveRemaining: input.reserveRemaining, netPurchases: input.netPurchases,
    coverage, target: input.target, gap, targetCoveredInPlan: gap === 0,
    nextContribution: input.state === 'saving' && gap !== null && gap > 0 ? input.contribution : 0,
  }
}
export function dueDateFunding(input: GoalInput, due: string) {
  const progress = goalProgress(input)
  dateParts(due)
  const dates = contributionDates(input.schedule, input.asOf, due, input.includedContributionDates)
  if (progress.gap === null) return { dates, gap: null, suggestedContribution: null, shortfall: null, state: 'unpriced' as const }
  if (progress.gap === 0) return { dates, gap: 0, suggestedContribution: 0, shortfall: 0, state: 'covered' as const }
  const enabled = input.state === 'saving'
  const projectedFunding = enabled ? BigInt(input.contribution) * BigInt(dates.length) : 0n
  const shortfall = fromBigInt(BigInt(progress.gap) > projectedFunding ? BigInt(progress.gap) - projectedFunding : 0n)
  return {
    dates, gap: progress.gap,
    suggestedContribution: enabled && dates.length ? ceilDivide(progress.gap, dates.length) : null,
    shortfall,
    state: !enabled ? 'inactive' as const : dates.length === 0 ? 'due-now' as const : 'scheduled' as const,
  }
}
/** Conditional estimate bounded by an explicit date; suggestion UI must pass <=12 calendar months.
 * No unsupported far-future date is fabricated when a supplied horizon runs out.
 */
export function goalTiming(input: GoalInput, through: string) {
  dateParts(through)
  if (through < input.asOf) throw new BudgetCalculationError('invalid-date', 'Estimate horizon precedes the current date.')
  const progress = goalProgress(input)
  if (progress.gap === null) return { state: 'unpriced' as const, contributionsNeeded: null, estimatedDate: null }
  if (progress.gap === 0) return { state: 'covered' as const, contributionsNeeded: 0, estimatedDate: null }
  if (input.state !== 'saving' || input.contribution === 0) return { state: 'inactive' as const, contributionsNeeded: null, estimatedDate: null }
  const count = ceilDivide(progress.gap, input.contribution)
  const dates = contributionDates(input.schedule, input.asOf, through, input.includedContributionDates)
  return {
    state: count <= dates.length ? 'estimated' as const : 'beyond-horizon' as const,
    contributionsNeeded: count, estimatedDate: dates[count - 1] ?? null,
  }
}
export function suggestionGoalTiming(input: GoalInput) {
  return goalTiming(input, addMonths(input.asOf, 12))
}
