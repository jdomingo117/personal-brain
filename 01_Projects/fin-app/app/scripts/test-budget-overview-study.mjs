/** Read-only fictional design study; requires only its standalone local preview. */
import {chromium,expect} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {mkdirSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {resolve,dirname} from 'node:path'
const out=resolve(dirname(fileURLToPath(import.meta.url)),'../../docs/budget-ui/overview-simplification')
mkdirSync(out,{recursive:true})
const browser=await chromium.launch(),results=[],errors=[],external=[],writes=[]
try{
 const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),page=await context.newPage()
 page.on('pageerror',e=>errors.push(e.message))
 page.on('request',r=>{if(r.url().includes('/functions/'))writes.push(r.url());if(!r.url().startsWith('http://127.0.0.1:57300/')&&!r.url().includes('fonts.googleapis.com')&&!r.url().includes('fonts.gstatic.com'))external.push(r.url())})
 await page.goto('http://127.0.0.1:57300/budget-overview-study.html')
 await expect(page).toHaveTitle('Halcyon · A quieter Budget overview')
 for(const scenario of ['pending','healthy','overspend','history','funding'])for(const width of [320,390,1440])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:1100});await page.selectOption('#scenario',scenario)
  if((await page.locator('#theme').getAttribute('aria-pressed')==='true')!==(theme==='dark'))await page.locator('#theme').click()
  await expect(page.locator('#remaining')).toContainText(scenario==='healthy'?'60':scenario==='overspend'?'40':'80')
  if(scenario==='history'){await expect(page.locator('#projection')).toHaveText('Unavailable');await expect(page.locator('#plot')).toBeHidden()}else await expect(page.locator('#plot')).toBeVisible()
  if(scenario==='funding'){await expect(page.locator('#attention-title')).toContainText('$50');if(width<=390){await expect(page.locator('#mobile-funding')).toBeVisible();if((await page.locator('#mobile-funding').boundingBox()).y>=(await page.locator('#remaining').boundingBox()).y)throw Error('Funding gap must precede allowance on phone')}else await expect(page.locator('#mobile-funding')).toBeHidden()}
  if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw Error(`Overflow ${scenario}/${width}/${theme}`)
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()
  if(axe.violations.length)throw Error(JSON.stringify(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))))
  await page.screenshot({path:resolve(out,`${scenario}-${width}-${theme}.png`),fullPage:true})
  await page.locator('#priority-action').click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#priority-action')).toBeFocused()
  results.push({scenario,width,theme,fit:true,wcag_violations:0});console.log('PASS',scenario,width,theme)
 }
 await page.setViewportSize({width:1440,height:1100});await page.locator('#phone').click();await expect(page.locator('#stage')).toHaveClass(/phone/)
 if(Math.round((await page.locator('#stage').boundingBox()).width)!==390)throw Error('Phone stage incorrect')
 await page.selectOption('#scenario','pending');await page.locator('.method summary').focus();await page.keyboard.press('Enter');await expect(page.locator('.method')).toHaveAttribute('open','')
 await page.locator('[data-open="plan"]').first().click();await expect(page.getByRole('dialog')).toContainText('$670');await page.keyboard.press('Escape')
 if(errors.length||writes.length||external.length)throw Error(JSON.stringify({errors,writes,external}))
 writeFileSync(resolve(out,'verification.json'),JSON.stringify({scope:'Non-shipping fictional design study; no financial API calls',matrix:results,runtime_errors:errors,financial_requests:writes,unexpected_external_requests:external,phone_stage:390,keyboard_disclosure:true,dialog_focus_return:true},null,2)+'\n')
 console.log('30 width/state/theme cases passed; keyboard/dialog checks passed; zero financial API requests.')
}finally{await browser.close()}
