import { describe, expect, it } from 'vitest'
import { everydayPlan, freshBudget, goalEvidence, goalReserve, goalTiming, moneyInput, moveBudget, recordPurchase, requiredMonthly, stillToPlan } from './model'

describe('fictional Budget concept decisions', () => {
  it('does not present a planned goal contribution as confirmed savings', () => {
    const g = freshBudget().goals[0]
    expect(goalEvidence(g)).toEqual({ confirmed: 60000, planned: 10000 })
    expect(goalEvidence({ ...g, paused: true })).toEqual({ confirmed: 60000, planned: 0 })
    expect(goalEvidence({ ...g, draft: true })).toEqual({ confirmed: 0, planned: 0 })
  })
  it('keeps confirmed and planned remaining goal amounts consistent after partial purchases', () => {
    const g = { ...freshBudget().goals[0], purchases: 65000 }
    expect(goalEvidence(g)).toEqual({ confirmed: 0, planned: 5000 })
    expect(goalEvidence(g).confirmed + goalEvidence(g).planned).toBe(goalReserve(g))
  })
  it('parses money exactly and rejects ambiguous/negative/excess precision input', () => {
    expect(moneyInput('19.29')).toBe(1929)
    expect(moneyInput('0.01')).toBe(1)
    for (const value of ['', '-1', '12.345', '1e3', 'NaN']) expect(moneyInput(value)).toBeNull()
  })
  it('covers a category gap without creating extra budget or changing resource capacity', () => {
    const before = freshBudget()
    const after = moveBudget(before, 'other', 'groceries', 6000)
    expect(after.categories[0].planned - after.categories[0].spent).toBe(0)
    expect(after.categories[2].planned - after.categories[2].spent).toBe(24000)
    expect(everydayPlan(after)).toBe(everydayPlan(before))
    expect(stillToPlan(after)).toBe(20000)
    expect(before.categories[0].planned).toBe(70000)
    expect(() => moveBudget(before, 'other', 'groceries', 30001)).toThrow()
  })
  it('adds a goal once, separating confirmed opening savings from a new monthly earmark', () => {
    const b = freshBudget()
    const goal = { ...b.goals[0], id: 'snowboard', target: 90000, opening: 30000, monthly: 10000 }
    expect(stillToPlan({ ...b, goals: [...b.goals, goal] })).toBe(10000)
    expect(goalReserve(goal)).toBe(40000)
    expect(goalTiming(goal)).toEqual({ count: 6, date: '2027-03-25' })
    expect(goalTiming({ ...goal, monthly: 0 })).toBeNull()
  })
  it('uses only contribution dates before the booking deadline', () => {
    expect(requiredMonthly(90000, 30000, '2027-02-10')).toBe(15000)
    expect(requiredMonthly(90000, 30000, '2026-10-20')).toBeNull()
    expect(requiredMonthly(10001, 0, '2026-12-25')).toBe(3334)
  })
  it('records a purchase once and preserves the current allocation and goal achievement', () => {
    const b = freshBudget()
    b.goals[0] = { ...b.goals[0], target: 90000, opening: 80000, monthly: 10000 }
    const after = recordPurchase(b, 'flights', 90000)
    expect(goalReserve(after.goals[0])).toBe(0)
    expect(after.goals[0].completed).toBe(true)
    expect(stillToPlan(after)).toBe(stillToPlan(b))
    expect(() => recordPurchase(after, 'flights', 90000)).toThrow()
    expect(() => recordPurchase(b, 'flights', 90001)).toThrow()
  })
})
