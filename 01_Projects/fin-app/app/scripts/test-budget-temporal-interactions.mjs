import {expect} from '@playwright/test'

/** Same combined SQL/Edge fixtures, viewed through authenticated real UI. */
export async function budgetTemporalInteractions({fixtures,check,signedPage,settled}){
 for(const [index,f] of fixtures.entries()){
  const width=index===0?1440:390,page=await signedPage(f.user,width,true)
  const region=page.getByRole('region',{name:'Budget periods and review'})
  const selector=region.getByRole('combobox',{name:'Saved budget period',exact:true})
  for(const [period,planned,reserve] of [[f.first,null,f.firstGoal],[f.second,'$30.00',f.firstGoal+3000],[f.third,'$70.00',f.firstGoal+10000]]){
   await selector.selectOption(period)
   await expect.poll(()=>new URL(page.url()).searchParams.get('budgetPeriod')).toBe(period)
   await page.getByRole('button',{name:'My plan',exact:true}).click()
   const goal=page.locator(`[data-budget-line="${f.goal}"]`)
   await expect(goal.getByRole('heading',{name:'Flight',exact:true})).toBeVisible()
   if(planned)await expect(goal.locator('dd').first()).toHaveText(planned)
   await expect(goal.locator('dd').nth(1)).toHaveText(new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(reserve/100))
   if(period===f.first)await expect(region).toContainText('Changed since review')
   await expect(goal).toContainText('Planned amounts are not bank transfers')
   await page.reload()
   await expect(selector).toHaveValue(period)
   check(`${width}px temporal: saved selection reloads ${period===f.first?'original':period===f.second?'transition':'continuing'} period with its own goal amount`,true)
  }
  await settled(page)
  check(`${width}px temporal: combined history has no horizontal overflow`,await page.locator('.budget-workspace').evaluate(el=>el.scrollWidth>el.clientWidth),false)
  await page.screenshot({path:`/tmp/halcyon-budget-m5-temporal-${width}.png`,fullPage:true})
  await page.context().close()
 }
}
