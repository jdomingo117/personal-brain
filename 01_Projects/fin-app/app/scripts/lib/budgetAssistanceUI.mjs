import {expect} from '@playwright/test'
/** Explicit review of fictional inputs; no defaults count as confirmation. */
export async function confirmBudgetAssistance(page,payDate,{keepIncome=false}={}){
 if(!keepIncome)await page.getByRole('button',{name:'Use observed income as an editable amount',exact:true}).click()
 await page.getByLabel('Expected pay dates in this budget (YYYY-MM-DD, separated by commas)').fill(payDate)
 await page.getByRole('checkbox',{name:/I confirm this expected take-home amount/}).check()
 await page.getByRole('checkbox',{name:/Replace only my everyday allowance/}).check()
 for(const c of await page.getByRole('checkbox',{name:'Apply this individual cost',exact:true}).all())await c.check()
 for(const c of await page.getByRole('checkbox',{name:/I reviewed cost \d+,/}).all())await c.check()
 await page.getByRole('checkbox',{name:/I checked essential costs, annual and quarterly/}).check()
 await expect(page.getByRole('button',{name:'Use this draft',exact:true})).toBeEnabled()
}
