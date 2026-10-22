import { contributionDates, occurrences, periodAt, type Frequency, type FrequencyChange } from './frequency'
/** Fictional concept state, not the production budget engine. Money is cents. */
export const EXAMPLE_TODAY = '2026-10-19'
export const FIRST_CONTRIBUTION = '2026-10-25'
export type Goal = {
  id: string; name: string; target: number | null; estimated: boolean;
  opening: number; monthly: number; neededBy: string; mode: 'amount' | 'date';
  purchases: number; paused: boolean; completed: boolean; draft: boolean;
}
export type Category = { id: string; name: string; planned: number; spent: number }
export type Budget = {
  futureGoalAmounts?: Record<string, number>;
  carryReview?: { choice: 'carry' | 'release'; sourceSpent: number };
  frequency: Frequency; anchor: string; pendingFrequency: FrequencyChange | null;
  income: number; received: number; bills: number; upcoming: number; savings: number;
  categories: Category[]; goals: Goal[]; acknowledged: boolean; featured: string;
  coverage: boolean; reviewed: boolean; lateImport: boolean; registrationExtra: number;
  accountCount: number; hasLimits: boolean;
  reviewedSpend: number; estimates: boolean;
  futureIncome: number; futureEveryday: number;
}
export const exampleBudget: Budget = {
  frequency: 'monthly', anchor: '2026-10-01', pendingFrequency: null,
  income: 600000, received: 300000, bills: 250000, upcoming: 40000, savings: 100000,
  categories: [
    { id: 'groceries', name: 'Groceries', planned: 70000, spent: 76000 },
    { id: 'dining', name: 'Dining & takeaway', planned: 40000, spent: 35000 },
    { id: 'other', name: 'Other everyday spending', planned: 70000, spent: 40000 },
  ],
  goals: [{ id: 'flights', name: 'Flights to Japan', target: 180000, estimated: true, opening: 60000,
    monthly: 10000, neededBy: '', mode: 'amount', purchases: 0, paused: false, completed: false, draft: false }],
  acknowledged: false, featured: 'flights', coverage: true, reviewed: false, lateImport: false,
  registrationExtra: 0,
  accountCount: 4, hasLimits: true,
  reviewedSpend: 172000, estimates: false,
  futureIncome: 600000, futureEveryday: 180000,
}
export const freshBudget = (): Budget => structuredClone(exampleBudget)
export function fortnightlyBudget(anchor = '2026-10-12'): Budget {
  const b = freshBudget()
  const schedule = occurrences(periodAt('fortnightly', anchor))
  const income = schedule.filter(r => r.kind === 'pay').reduce((sum, r) => sum + r.amount, 0)
  const bills = schedule.filter(r => r.kind === 'bill').reduce((sum, r) => sum + r.amount, 0)
  return { ...b, frequency: 'fortnightly', anchor, income, received: schedule.filter(r => r.kind === 'pay' && r.date <= EXAMPLE_TODAY).reduce((sum, r) => sum + r.amount, 0),
    bills, upcoming: 110000, savings: 50000, futureIncome: income, futureEveryday: 80000,
    categories: b.categories.map((c, i) => ({ ...c, planned: [35000, 20000, 25000][i], spent: [18000, 9000, 12000][i] })),
    goals: b.goals.map(g => ({ ...g, monthly: 5000 })),
  }
}
export const budgetPeriod = (b: Budget) => periodAt(b.frequency, b.anchor)
export const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0)
export const everydayPlan = (b: Budget) => total(b.categories.map(c => c.planned))
export const everydaySpent = (b: Budget) => total(b.categories.map(c => c.spent))
export const goalMonthly = (g: Goal) => g.draft || g.paused ? 0 : g.monthly
export const stillToPlan = (b: Budget) => b.income - b.bills - b.upcoming - b.savings
  - everydayPlan(b) - total(b.goals.map(goalMonthly)) - b.registrationExtra
export const goalReserve = (g: Goal) => g.draft ? 0 : g.opening + goalMonthly(g) - g.purchases
export const goalCoverage = (g: Goal) => goalReserve(g) + g.purchases
export function goalEvidence(g: Goal) {
  const confirmed = g.draft ? 0 : Math.max(0, g.opening - g.purchases)
  return { confirmed, planned: Math.max(0, goalReserve(g) - confirmed) }
}

export function moneyInput(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null
  const [whole, fraction = ''] = value.trim().split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents <= 100000000 ? cents : null
}
export const inputValue = (cents: number) => (cents / 100).toFixed(cents % 100 ? 2 : 0)

export function datesThrough(date: string): string[] {
  const result: string[] = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < EXAMPLE_TODAY) return result
  for (let month = 9; month < 129; month++) {
    const next = new Date(Date.UTC(2026, month, 25)).toISOString().slice(0, 10)
    if (next > date) break
    result.push(next)
  }
  return result
}
export function requiredMonthly(target: number, opening: number, date: string, b?: Budget): number | null {
  const count = b ? contributionDates(b.frequency, b.anchor, date).length : datesThrough(date).length
  return count ? Math.ceil(Math.max(0, target - opening) / count) : null
}
export function goalTiming(goal: Goal, b?: Budget): { count: number; date: string } | null {
  if (goal.target === null || goal.draft || goal.paused || goal.monthly <= 0 || goal.completed) return null
  // Includes this month's planned contribution: it has not yet been saved.
  const count = Math.ceil(Math.max(0, goal.target - goal.opening) / goal.monthly)
  if (count > 120) return null
  const date = b ? contributionDates(b.frequency, b.anchor, '2036-10-25')[Math.max(0, count - 1)] : new Date(Date.UTC(2026, 9 + Math.max(0, count - 1), 25)).toISOString().slice(0, 10)
  if (!date) return null
  return { count, date }
}
export function moveBudget(b: Budget, from: string, to: string, amount: number): Budget {
  const source = b.categories.find(c => c.id === from)
  if (from === to || !source || !b.categories.some(c => c.id === to)
    || !Number.isSafeInteger(amount) || amount <= 0 || amount > source.planned - source.spent) {
    throw new Error('Choose an amount within the source category’s remaining budget.')
  }
  return { ...b, categories: b.categories.map(c => ({ ...c,
    planned: c.planned + (c.id === to ? amount : c.id === from ? -amount : 0),
  })), acknowledged: false }
}
export function recordPurchase(b: Budget, id: string, amount: number): Budget {
  const goal = b.goals.find(g => g.id === id)
  if (!goal || goal.draft || goal.completed || !Number.isSafeInteger(amount) || amount <= 0 || amount > goalReserve(goal)) {
    throw new Error('This purchase needs more room in the goal’s budget. Adjust the goal first.')
  }
  return { ...b, goals: b.goals.map(g => g.id !== id ? g : {
    ...g, purchases: g.purchases + amount,
    completed: g.target !== null && g.purchases + amount >= g.target,
  }) }
}

/** A private concept key: never reads the application's accounts or sessions. */
export function readBudget(): Budget {
  try {
    const saved = JSON.parse(localStorage.getItem('halcyon-budget-concept-v1') || 'null')
    if (saved && validBudget({ frequency: 'monthly', anchor: '2026-10-01', pendingFrequency: null, ...saved })) return { frequency: 'monthly', anchor: '2026-10-01', pendingFrequency: null, ...saved }
  } catch { /* Corrupt/unavailable local storage falls back to fictional fixtures. */ }
  return freshBudget()
}
function validBudget(b: unknown): b is Budget {
  if (!b || typeof b !== 'object') return false
  const v = b as Budget
  if (!['monthly', 'fortnightly'].includes(v.frequency) || !/^\d{4}-\d{2}-\d{2}$/.test(v.anchor)) return false
  const cents = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= 100000000
  if (v.futureGoalAmounts && (typeof v.futureGoalAmounts !== 'object' || Object.values(v.futureGoalAmounts).some(n => !cents(n)))) return false
  if (v.carryReview && (!['carry', 'release'].includes(v.carryReview.choice) || !cents(v.carryReview.sourceSpent))) return false
  return ['income', 'received', 'bills', 'upcoming', 'savings', 'registrationExtra', 'accountCount', 'reviewedSpend', 'futureIncome', 'futureEveryday'].every(k => cents(v[k as keyof Budget]))
    && ['coverage', 'reviewed', 'lateImport', 'acknowledged', 'hasLimits', 'estimates'].every(k => typeof v[k as keyof Budget] === 'boolean')
    && typeof v.featured === 'string' && Array.isArray(v.categories) && v.categories.length >= 3
    && v.categories.every(c => typeof c.id === 'string' && typeof c.name === 'string' && cents(c.planned) && cents(c.spent))
    && ['groceries', 'dining', 'other'].every(id => v.categories.some(c => c.id === id))
    && Array.isArray(v.goals) && v.goals.every(g => typeof g.id === 'string' && typeof g.name === 'string'
      && (g.target === null || cents(g.target)) && cents(g.opening) && cents(g.monthly) && cents(g.purchases)
      && typeof g.neededBy === 'string' && ['amount', 'date'].includes(g.mode)
      && ['estimated', 'paused', 'completed', 'draft'].every(k => typeof g[k as keyof Goal] === 'boolean'))
}
