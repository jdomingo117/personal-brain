import { describe, it, expect } from 'vitest'
import { detectPairCadence, isWithinAmountTolerance, isWithinCadenceWindow } from './pairCadence'

describe('detectPairCadence', () => {
  it('returns null with fewer than the minimum observations', () => {
    expect(detectPairCadence([
      { date: '2026-06-01', amountCents: 20000 },
      { date: '2026-06-15', amountCents: 20000 },
    ])).toBeNull()
  })

  it('detects a fortnightly, stable-amount sweep', () => {
    const history = [
      { date: '2026-06-01', amountCents: 20000 },
      { date: '2026-06-15', amountCents: 20050 },
      { date: '2026-06-29', amountCents: 19900 },
      { date: '2026-07-13', amountCents: 20000 },
    ]
    const cadence = detectPairCadence(history)
    expect(cadence).not.toBeNull()
    expect(cadence!.cadence).toBe('Biweekly')
    expect(cadence!.lastDate).toBe('2026-07-13')
  })

  it('returns null when the median gap sits in a dead zone between cadences', () => {
    // 20-day gaps sit strictly between Biweekly's upper bound (17) and
    // Monthly's lower bound (23.94) — see cadence.ts's dead-zone docblock.
    const history = [
      { date: '2026-06-01', amountCents: 20000 },
      { date: '2026-06-05', amountCents: 20000 },
      { date: '2026-06-25', amountCents: 20000 },
      { date: '2026-07-15', amountCents: 20000 },
    ]
    expect(detectPairCadence(history)).toBeNull()
  })

  it('returns null when the amount is too unstable to call a pattern', () => {
    const history = [
      { date: '2026-06-01', amountCents: 5000 },
      { date: '2026-06-15', amountCents: 40000 },
      { date: '2026-06-29', amountCents: 8000 },
      { date: '2026-07-13', amountCents: 50000 },
    ]
    expect(detectPairCadence(history)).toBeNull()
  })

  it('is order-independent — unsorted input detects the same cadence', () => {
    const sorted = [
      { date: '2026-06-01', amountCents: 20000 },
      { date: '2026-06-15', amountCents: 20000 },
      { date: '2026-06-29', amountCents: 20000 },
    ]
    const shuffled = [sorted[2], sorted[0], sorted[1]]
    expect(detectPairCadence(shuffled)).toEqual(detectPairCadence(sorted))
  })
})

describe('isWithinCadenceWindow', () => {
  const cadence = { cadence: 'Biweekly' as const, expectedAmountCents: 20000, lastDate: '2026-07-01' }

  it('accepts a candidate landing on the next cycle', () => {
    expect(isWithinCadenceWindow('2026-07-15', cadence)).toBe(true)
  })

  it('accepts a candidate two cycles out', () => {
    expect(isWithinCadenceWindow('2026-07-29', cadence)).toBe(true)
  })

  it('rejects a candidate in the dead zone between cycles', () => {
    expect(isWithinCadenceWindow('2026-07-08', cadence)).toBe(false)
  })
})

describe('isWithinAmountTolerance', () => {
  const cadence = { cadence: 'Biweekly' as const, expectedAmountCents: 20000, lastDate: '2026-07-01' }

  it('accepts an amount within the tolerance band', () => {
    expect(isWithinAmountTolerance(21000, cadence)).toBe(true)
  })

  it('rejects an amount well outside the tolerance band', () => {
    expect(isWithinAmountTolerance(65000, cadence)).toBe(false)
  })
})
