/** Pure Budget domain inputs. SQL supplies complete aggregates; these are not ledger rows.
 * Mirrored under supabase/functions/_shared/budget; parity tests enforce exact source equality.
 */
export type Cents = number // Runtime-checked safe integer cents, never display dollars.
export type LocalDate = string // Strict Gregorian YYYY-MM-DD, validated at every boundary.
export type Frequency = 'monthly' | 'fortnightly'
export interface Clock { now(): Date }
export type PeriodConfig =
  | { frequency: 'monthly'; timezone: string }
  | { frequency: 'fortnightly'; timezone: string; anchor: LocalDate }
export interface BudgetPeriod {
  start: LocalDate
  end: LocalDate // Exclusive; never persist an inclusive final day.
  timezone: string
  frequency: Frequency
  transition: boolean
}
export type ContributionSchedule =
  | { frequency: 'monthly'; anchor: LocalDate; dayOfMonth: number }
  | { frequency: 'fortnightly'; anchor: LocalDate }
export type LineKind = 'fixed' | 'reserve' | 'everyday' | 'contribution'
export interface LineBalance {
  id: string
  kind: LineKind
  opening: Cents
  allocation: Cents
  reallocation: Cents
  usage: Cents // Signed settled expense effect, not pending or contribution evidence.
}
export type TaxonomyScope =
  | { categoryId: string; kind: 'category' }
  | { categoryId: string; kind: 'global'; subcategoryId: string }
  | { categoryId: string; kind: 'custom'; customSubcategoryId: string }
export interface FlexLimit {
  id: string
  scope: TaxonomyScope
  allocation: Cents
  opening: Cents
  reallocation: Cents
  usage: Cents
}
export interface FlexOther {
  opening: Cents
  reallocation: Cents
  usage: Cents
}
export interface ContributionEvidence {
  id: string
  movementId: string // Both bank transfer legs must resolve to this one movement upstream.
  amount: Cents
  sourceCapacity: Cents
  kind: 'bank-observed' | 'user-confirmed'
  reversed: boolean
}
export interface GoalInput {
  target: Cents | null
  reserveRemaining: Cents
  netPurchases: Cents
  contribution: Cents
  state: 'draft' | 'saving' | 'paused' | 'purchase-recorded' | 'archived'
  asOf: LocalDate
  schedule: ContributionSchedule
  /** All scheduled dates already included in reserveRemaining, including the current allocation. */
  includedContributionDates: readonly LocalDate[]
}
export class BudgetCalculationError extends Error {
  readonly code: 'invalid-money' | 'overflow' | 'invalid-date' | 'invalid-input' | 'capacity' | 'overlap' | 'limit'
  constructor(code: BudgetCalculationError['code'], message: string) {
    super(message)
    this.name = 'BudgetCalculationError'
    this.code = code
  }
}
