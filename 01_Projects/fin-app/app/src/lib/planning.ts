export type PlanningMetric = 'cash' | 'net_worth'
export type PlanningGoalStatus = 'active' | 'paused' | 'archived'

/** Durable planning input loaded through tenant RLS. It intentionally contains
 * no forecast output: balances and the ledger remain the source of truth. */
export interface PlanningGoal {
  id: string
  name: string
  metric: PlanningMetric
  targetCents: number
  targetDate: string | null
  status: PlanningGoalStatus
  accountIds: string[]
  updatedAt: string
}

export interface PlanningScenario { id: string; goalId: string; name: string; isBaseline: boolean; annualReturnBps: number; includeRecurring: boolean; status: 'active' | 'archived' }
export interface PlanningEvent { id: string; scenarioId: string; name: string; amountCents: number; cadence: 'once' | 'monthly'; startDate: string; endDate: string | null }
