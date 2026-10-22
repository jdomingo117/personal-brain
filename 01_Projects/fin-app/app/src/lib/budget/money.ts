import { BudgetCalculationError } from './types.ts'

export function cents(value: number): number {
  if (!Number.isSafeInteger(value)) throw new BudgetCalculationError('invalid-money', 'Money must be a safe integer number of cents.')
  return value === 0 ? 0 : value
}
export function nonnegative(value: number): number {
  cents(value)
  if (value < 0) throw new BudgetCalculationError('invalid-money', 'This amount cannot be negative.')
  return value
}
export function fromBigInt(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new BudgetCalculationError('overflow', 'The result exceeds supported exact-cent arithmetic.')
  }
  return Number(value)
}
/** Sum bounded plan lines or SQL aggregate series, never fetched raw transaction history. */
export function sumCents(values: readonly number[]): number {
  return fromBigInt(values.reduce((total, value) => total + BigInt(cents(value)), 0n))
}
export function subtract(a: number, b: number): number {
  return fromBigInt(BigInt(cents(a)) - BigInt(cents(b)))
}
export function ceilDivide(amount: number, count: number): number {
  nonnegative(amount)
  if (!Number.isSafeInteger(count) || count <= 0) throw new BudgetCalculationError('invalid-input', 'A positive integer count is required.')
  return fromBigInt((BigInt(amount) + BigInt(count) - 1n) / BigInt(count))
}
/** PostgreSQL bigint aggregate boundary: reject exponent/decimal strings and precision loss. */
export function aggregateCents(value: string): number {
  if (!/^-?(0|[1-9]\d*)$/.test(value)) throw new BudgetCalculationError('invalid-money', 'Invalid integer-cent aggregate.')
  return fromBigInt(BigInt(value))
}
