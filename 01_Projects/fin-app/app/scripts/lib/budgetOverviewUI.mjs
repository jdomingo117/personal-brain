/** Explicit native disclosure navigation for the simplified production Overview.
 * Call only for the evidence or controls a journey actually inspects. */
export async function openOverviewDetails(page,selector){
 const details=page.locator(selector)
 if(await details.getAttribute('open')===null)await details.locator(':scope > summary').click()
}
export const openGoalDetails=(page,id)=>openOverviewDetails(page,`[data-budget-goal-detail="${id}"]`)
export const openAllowanceTools=page=>openOverviewDetails(page,'.budget-allowance-tools')
export const openIncomeDetails=page=>openOverviewDetails(page,'.budget-income-disclosure')
