import { BudgetCalculationError } from './types.ts'
import type { FlexLimit, FlexOther, LineBalance, LineKind } from './types.ts'
import { cents, fromBigInt, nonnegative, subtract, sumCents } from './money.ts'

export function identity(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new BudgetCalculationError('invalid-input', 'A stable non-empty identity is required.')
  return value
}
function validateLine(line: LineBalance): void {
  identity(line.id)
  if (!['fixed', 'reserve', 'everyday', 'contribution'].includes(line.kind)) throw new BudgetCalculationError('invalid-input', 'Unsupported line purpose.')
  cents(line.opening); nonnegative(line.allocation); cents(line.reallocation); cents(line.usage)
}
export function lineRemaining(line: LineBalance): number {
  validateLine(line)
  if (line.kind === 'contribution') throw new BudgetCalculationError('invalid-input', 'Contributions use recorded-versus-planned, not a spending remainder.')
  return fromBigInt(BigInt(line.opening) + BigInt(line.allocation) + BigInt(line.reallocation) - BigInt(line.usage))
}
/** Only NEW allocations belong here: no opening reserves/carry or child limits. */
export function resourceSummary(income: number, openingDrawdown: number, allocations: readonly { id: string; kind: LineKind; amount: number }[]) {
  nonnegative(income); nonnegative(openingDrawdown)
  const ids = new Set<string>()
  for (const line of allocations) {
    identity(line.id); nonnegative(line.amount)
    if (!['fixed', 'reserve', 'everyday', 'contribution'].includes(line.kind)) throw new BudgetCalculationError('invalid-input', 'Unsupported allocation purpose.')
    if (ids.has(line.id)) throw new BudgetCalculationError('overlap', 'A line cannot be allocated twice.')
    ids.add(line.id)
  }
  const resources = sumCents([income, openingDrawdown])
  const allocated = sumCents(allocations.map(l => l.amount))
  const unallocated = subtract(resources, allocated)
  return { resources, allocated, unallocated, fundingGap: Math.max(0, -unallocated) }
}
/** Equal debit/credit preview. Persistence, protection warnings and undo are later boundaries. */
export function moveAllocation(source: LineBalance, destination: LineBalance, amount: number): { source: LineBalance; destination: LineBalance } {
  validateLine(source); validateLine(destination); nonnegative(amount)
  if (amount === 0 || source.id === destination.id) throw new BudgetCalculationError('invalid-input', 'Choose two different lines and a positive amount.')
  if (source.kind === 'contribution' || destination.kind === 'contribution') throw new BudgetCalculationError('invalid-input', 'Contribution releases need their explicit evidence-aware plan revision.')
  if (amount > Math.max(0, lineRemaining(source))) throw new BudgetCalculationError('capacity', 'The source has insufficient remaining allocation.')
  const nextSource = { ...source, reallocation: subtract(source.reallocation, amount) }
  const nextDestination = { ...destination, reallocation: sumCents([destination.reallocation, amount]) }
  lineRemaining(nextSource); lineRemaining(nextDestination)
  return { source: nextSource, destination: nextDestination }
}

export function flexPool(allocation: number, limits: readonly FlexLimit[], other: FlexOther) {
  nonnegative(allocation); cents(other.opening); cents(other.reallocation); cents(other.usage)
  const ids = new Set<string>(), parents = new Set<string>(), children = new Set<string>(), categoriesWithChildren = new Set<string>()
  for (const limit of limits) {
    identity(limit.id); identity(limit.scope.categoryId)
    if (ids.has(limit.id)) throw new BudgetCalculationError('overlap', 'Duplicate category-limit identity.')
    ids.add(limit.id)
    nonnegative(limit.allocation); cents(limit.opening); cents(limit.reallocation); cents(limit.usage)
    const scope = limit.scope
    if (scope.kind === 'category') {
      if (parents.has(scope.categoryId)) throw new BudgetCalculationError('overlap', 'Duplicate category partition.')
      parents.add(scope.categoryId)
    } else if (scope.kind === 'global' || scope.kind === 'custom') {
      const childId = identity(scope.kind === 'global' ? scope.subcategoryId : scope.customSubcategoryId)
      // Global/custom namespaces are distinct; a child cannot be claimed through two categories.
      const key = JSON.stringify([scope.kind, childId])
      if (children.has(key)) throw new BudgetCalculationError('overlap', 'Duplicate subcategory partition.')
      children.add(key); categoriesWithChildren.add(scope.categoryId)
    } else throw new BudgetCalculationError('invalid-input', 'Unsupported category identity.')
  }
  for (const category of parents) if (categoriesWithChildren.has(category)) throw new BudgetCalculationError('overlap', 'Category and subcategory partitions cannot overlap.')
  const otherAllocation = subtract(allocation, sumCents(limits.map(l => l.allocation)))
  if (otherAllocation < 0) throw new BudgetCalculationError('capacity', 'Category limits exceed the everyday pool.')
  const rows = limits.map(l => ({ id: l.id, remaining: lineRemaining({ ...l, kind: 'everyday' }) }))
  const otherRemaining = lineRemaining({ ...other, id: 'other', kind: 'everyday', allocation: otherAllocation })
  return {
    allocation, otherAllocation, rows, otherRemaining,
    opening: sumCents([other.opening, ...limits.map(l => l.opening)]),
    usage: sumCents([other.usage, ...limits.map(l => l.usage)]),
    reallocation: sumCents([other.reallocation, ...limits.map(l => l.reallocation)]),
    remaining: sumCents([otherRemaining, ...rows.map(l => l.remaining)]),
  }
}
/** Removing a partition moves its carry/activity/adjustments into Other; no vanished overspend. */
export function removeFlexLimit(allocation: number, limits: readonly FlexLimit[], other: FlexOther, id: string) {
  flexPool(allocation, limits, other)
  const removed = limits.find(l => l.id === id)
  if (!removed) throw new BudgetCalculationError('invalid-input', 'Category limit not found.')
  const nextLimits = limits.filter(l => l.id !== id)
  const nextOther = {
    opening: sumCents([other.opening, removed.opening]),
    reallocation: sumCents([other.reallocation, removed.reallocation]),
    usage: sumCents([other.usage, removed.usage]),
  }
  return { limits: nextLimits, other: nextOther, pool: flexPool(allocation, nextLimits, nextOther) }
}
export function carryForward(line: LineBalance, rollover: boolean): { nextOpening: number; priorVariance: number } {
  const closing = lineRemaining(line)
  return { nextOpening: rollover ? closing : 0, priorVariance: closing }
}
export function defaultRollover(kind: Exclude<LineKind, 'contribution'>): boolean {
  if (!['fixed', 'reserve', 'everyday'].includes(kind)) throw new BudgetCalculationError('invalid-input', 'This purpose has no spending rollover policy.')
  return kind === 'reserve'
}
