import {expect} from '@playwright/test'
/** Explicit review of fictional inputs; no defaults count as confirmation until the final tick. */
export async function confirmBudgetAssistance(page,payDate,{keepIncome=false}={}){
 // The take-home field is pre-filled; the button only appears when it differs from history.
 const useObserved=page.getByRole('button',{name:/^Use \$/})
 if(!keepIncome&&await useObserved.count())await useObserved.click()
 await page.getByLabel('Pay dates in this budget').fill(payDate)
 const typical=page.getByRole('radio',{name:/Use my typical month/})
 if(await typical.count())await typical.check()
 for(const c of await page.getByRole('checkbox',{name:/^Include /}).all())await c.check()
 // Editing any value clears the final tick, so it comes last.
 await page.getByRole('checkbox',{name:/I’ve checked these amounts/}).check()
 await expect(page.getByRole('button',{name:'Use this draft',exact:true})).toBeEnabled()
}
