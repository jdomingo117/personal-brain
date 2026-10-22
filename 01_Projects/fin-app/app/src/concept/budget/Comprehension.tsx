import { useState } from 'react'
import { Action, money } from './ui'
import { everydayPlan, everydaySpent, goalEvidence, stillToPlan, type Budget, type Goal } from './model'
import { frequencyLabel, periodLabel } from './frequency'
import { budgetPeriod } from './model'

export function BudgetGuide({ budget, close, openCarry, setup = false }: { budget: Budget; close: () => void; openCarry: () => void; setup?: boolean }) {
  const remaining = everydayPlan(budget) - everydaySpent(budget)
  return <div className="bc-task-body"><p className="bc-lead">A plan you can adjust—not a test you have to pass.</p>
    <ol className="bc-guide-steps">
      <li><h3>Choose your dates</h3><p>{setup ? 'Choose monthly or every two weeks. You’ll see the exact dates before starting.' : `You plan ${frequencyLabel(budget.frequency).toLowerCase()}. Your current budget covers ${periodLabel(budgetPeriod(budget))}.`} Bills keep their own payment dates.</p></li>
      <li><h3>Give your money a purpose</h3><p>Allow for bills, later costs and things you want. Choose one amount for everyday spending; category limits are optional.</p></li>
      <li><h3>Follow what you spend</h3><p>{setup ? 'Recorded purchases reduce the amount left in your everyday plan.' : `Your everyday plan is ${money(everydayPlan(budget))}. Recorded spending of ${money(everydaySpent(budget))} leaves ${money(remaining)} in that plan.`} Pending purchases stay separate.</p></li>
      <li><h3>Adjust when life changes</h3><p>Move room between categories or change the plan. You see the effect before saving and can undo your latest saved change.</p></li>
      <li><h3>Review, then look ahead</h3><p>When the period ends, check the activity and choose what carries forward. Money planned for later bills and unfinished goals stays separate from everyday leftovers.</p></li>
    </ol>
    <div className="bc-outcome"><h3>A small example</h3><p>Move $50 of budget from eating out to groceries: groceries gets $50 more room, eating out gets $50 less, and your total everyday budget stays the same.</p><p>No spending or bank transfer is created. This example does not change your plan.</p></div>
    <p className="bc-hint">Your budget is not a bank balance check. Expected income may not have arrived yet. Planning money for a goal does not transfer it into savings.</p>
    <div className="bc-task-footer">{!setup && <Action onClick={openCarry}>See a period-end example</Action>}<Action tone="primary" onClick={close}>{setup ? 'Continue setup' : 'Back to my budget'}</Action></div>
  </div>
}

export function ReadyTask({ budget, close, guide }: { budget: Budget; close: () => void; guide: () => void }) {
  const gap = stillToPlan(budget)
  return <div className="bc-task-body"><p className="bc-lead">Your budget is ready. Here’s what happens next.</p>
    <p>{frequencyLabel(budget.frequency)} · {periodLabel(budgetPeriod(budget))}</p>
    <div className="bc-outcome"><h3>{gap < 0 ? `Your plan still needs ${money(-gap)}` : `${money(gap)} still to plan`}</h3><p>{gap < 0 ? 'You chose to keep this gap visible. Adjust the plan when you can; nothing will be moved automatically.' : 'This part of your expected income has no purpose yet. Leave it unassigned or give it a job later.'}</p></div>
    <ol className="bc-guide-steps"><li><h3>Use your overview</h3><p>Recorded purchases reduce what remains in your everyday plan. This concept uses fictional activity; it is not connected to a bank.</p></li><li><h3>Make changes when you need to</h3><p>Adjust an amount or add something you want to save for. Check the effect before saving.</p></li><li><h3>Review at the end</h3><p>Check the period’s activity and choose what should carry forward. No money moves automatically.</p></li></ol>
    <div className="bc-task-footer"><Action onClick={guide}>How your budget works</Action><Action tone="primary" onClick={close}>Go to my overview</Action></div>
  </div>
}

/** Evidence and intent are separate tracks; planning must not fill the confirmed-savings bar. */
export function GoalProgress({ goal }: { goal: Goal }) {
  const { confirmed, planned } = goalEvidence(goal)
  const target = goal.target ?? 0
  const percent = (n: number) => target > 0 ? Math.min(100, n / target * 100) : 0
  return <div className="bc-goal-evidence" data-testid="goal-evidence">
    <div className="bc-goal-track" role="img" aria-label={`${money(confirmed)} remaining from savings you confirmed; ${money(planned)} planned, not confirmed saved; target ${money(target)}`}>
      <span className="bc-goal-confirmed" style={{ width: `${percent(confirmed)}%` }} /><span className="bc-goal-planned" style={{ width: `${Math.min(percent(planned), 100 - percent(confirmed))}%` }} />
    </div>
    <div className="bc-evidence-line"><span><i className="bc-key-confirmed" />Savings you confirmed{goal.purchases ? ' · after purchases' : ''}</span><strong>{money(confirmed)}</strong></div>
    <div className="bc-evidence-line"><span><i className="bc-key-planned" />Planned this budget{goal.purchases ? ' · remaining' : ''}</span><strong>{money(planned)}</strong></div>
    <p className="bc-hint">Planned is not saved yet. Confirmed amounts are your record, not a live bank balance.</p>
  </div>
}

export function CarryReview({ budget, close, commit }: { budget: Budget; close: () => void; commit: (b: Budget, message: string) => void }) {
  const actual = 172000 + (budget.lateImport ? 4000 : 0)
  const left = 180000 - actual
  const [choice, setChoice] = useState<'carry' | 'release'>(budget.carryReview?.choice ?? 'release')
  const [confirmed, setConfirmed] = useState(false)
  return <div className="bc-task-body"><p className="bc-eyebrow">Completed September · worked example</p><p className="bc-lead">What should happen to the everyday amount left?</p>
    <div className="bc-kv"><span>September everyday plan</span><strong>{money(180000)}</strong></div><div className="bc-kv"><span>Recorded spending</span><strong>{money(actual)}</strong></div><div className="bc-kv"><span>Left in that plan</span><strong>{money(left)}</strong></div>
    <fieldset className="bc-carry-choices"><legend>Choose what the next budget would do</legend>
      <label><input type="radio" name="carry-choice" checked={choice === 'release'} onChange={() => { setChoice('release'); setConfirmed(false) }} /><span><strong>Start fresh</strong><small>Keep the next everyday plan at its new starting amount. Do not add September’s leftover allowance.</small></span></label>
      <label><input type="radio" name="carry-choice" checked={choice === 'carry'} onChange={() => { setChoice('carry'); setConfirmed(false) }} /><span><strong>Carry it forward</strong><small>Add {money(left)} of budget allowance to the next everyday plan.</small></span></label>
    </fieldset>
    <div className="bc-outcome" aria-live="polite"><h3>Next-budget example</h3><div className="bc-kv"><span>New everyday starting amount</span><strong>{money(180000)}</strong></div><div className="bc-kv"><span>From September</span><strong>{money(choice === 'carry' ? left : 0)}</strong></div><div className="bc-kv"><span>Everyday allowance after this choice</span><strong>{money(180000 + (choice === 'carry' ? left : 0))}</strong></div><p>This is budget allowance, not new income or proof of spare cash. Starting fresh does not move the leftover into savings.</p></div>
    <p>Money already planned for upcoming bills and unfinished goals is not swept into this choice. September’s spending history stays unchanged.</p>
    {!budget.coverage && <p className="bc-warning">Some activity is missing. You can explore the choices, but restore complete example data before saving a review choice.</p>}
    <label className="bc-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I understand this saves an example review choice, not a transfer or a change to my current budget.</label>
    <p className="bc-hint">Prototype only: the clock does not advance. A later import can change the leftover; review it again before applying a real carry-forward.</p>
    <div className="bc-task-footer"><Action onClick={close}>Cancel</Action><Action tone="primary" disabled={!confirmed || !budget.coverage} onClick={() => commit({ ...budget, carryReview: { choice, sourceSpent: actual } }, 'September review choice saved as a preview. Your current budget and bank accounts are unchanged.')}>Save review choice</Action></div>
  </div>
}
