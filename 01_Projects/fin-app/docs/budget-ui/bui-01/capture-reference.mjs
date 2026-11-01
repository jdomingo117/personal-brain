// Read-only concept capture. Start Vite on 5314 with --strictPort first.
// No auth, production route, database fixtures or production localStorage.
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
const require = createRequire(new URL('../../../app/package.json', import.meta.url))
const { chromium } = require('playwright')
const browser = await chromium.launch({ headless: true })
const output = new URL('./references/', import.meta.url)
const measurements = []
const errors = [], dataRequests = []
try {
  for (const theme of ['light', 'dark']) {
    for (const width of [320, 390, 768, 1024, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1100 }, reducedMotion: 'reduce' })
      const page = await context.newPage()
      page.on('pageerror', e => errors.push(e.message))
      page.on('request', req => { if (/supabase|\/functions\/v1|\/rest\/v1|\/auth\/v1/.test(req.url())) dataRequests.push(req.url()) })
      await page.goto('http://127.0.0.1:5314/budget-concept.html')
      await page.getByRole('heading', { name: 'Budget', exact: true }).waitFor()
      if (theme === 'dark') await page.getByRole('button', { name: 'Use dark appearance' }).click()
      await page.evaluate(() => document.fonts.ready)
      const name = `${width}-${theme}`
      measurements.push(await page.evaluate(({ name, width, theme }) => {
        const rect = selector => {
          const el = document.querySelector(selector), r = el.getBoundingClientRect(), css = getComputedStyle(el)
          return { x:r.x, y:r.y, width:r.width, height:r.height, fontSize:css.fontSize, columns:css.gridTemplateColumns, gap:css.gap }
        }
        return { name, width, theme, title:rect('.bc-page-heading h1'), page:rect('.bc-page'), hero:rect('.bc-hero'), amount:rect('.bc-hero-amount'), columns:rect('.bc-columns'), scroller:rect('.bc-scroll'), overflow:document.querySelector('.bc-scroll').scrollWidth > document.querySelector('.bc-scroll').clientWidth + 1, remaining:document.querySelector('[data-testid="everyday-remaining"]').textContent }
      }, { name, width, theme }))
      // Crop to the content scroller: omit review toolbar and fictional app shell.
      await page.locator('.bc-scroll').screenshot({ path:new URL(`${name}-overview.png`,output).pathname })
      if ([390,1440].includes(width)) {
        await page.locator('.bc-scroll').evaluate(el => { el.scrollTop = el.scrollHeight })
        await page.locator('.bc-scroll').screenshot({ path:new URL(`${name}-lower.png`,output).pathname })
        await page.locator('.bc-scroll').evaluate(el => { el.scrollTop = 0 })
        await page.getByRole('button', { name:'How is this worked out?' }).click()
        await page.getByRole('dialog').screenshot({ path:new URL(`${name}-calculation.png`,output).pathname })
        await page.getByRole('button', { name:'Got it',exact:true }).click()
        await page.getByRole('button', { name:'My plan',exact:true }).click()
        await page.locator('.bc-scroll').screenshot({ path:new URL(`${name}-plan.png`,output).pathname })
        await page.locator('#concept-month').selectOption('sep')
        await page.locator('.bc-scroll').screenshot({ path:new URL(`${name}-history.png`,output).pathname })
      }
      if (width === 1440) {
        await page.locator('#concept-month').selectOption('oct')
        await page.getByRole('button', { name:'Phone preview',exact:true }).click()
        await page.locator('.bc-scroll').screenshot({ path:new URL(`${name}-phone-preview.png`,output).pathname })
        await page.getByRole('button', { name:'Full width',exact:true }).click()
        const referenceBudget = await page.evaluate(() => JSON.parse(localStorage.getItem('halcyon-budget-concept-v1')))
        for (const [scenario, patch] of Object.entries({ incomplete:{coverage:false}, gap:{income:550000}, changedHistory:{lateImport:true,reviewed:true}, noLimits:{hasLimits:false} })) {
          await page.evaluate(({base,patch}) => {
            const key='halcyon-budget-concept-v1'
            // Only the concept's isolated fictional state is changed.
            localStorage.setItem(key,JSON.stringify({...base,...patch}))
          },{base:referenceBudget,patch})
          await page.reload()
          await page.evaluate(() => document.fonts.ready)
          if (scenario==='changedHistory') await page.locator('#concept-month').selectOption('sep')
          await page.locator('.bc-scroll').screenshot({ path:new URL(`${name}-${scenario}.png`,output).pathname })
        }
      }
      await context.close()
    }
  }
  const result = { captured:'2026-10-25', scope:'Fictional concept reference only; no production acceptance claim', measurements, errors, dataRequests }
  await writeFile(new URL('measurements.json',output),JSON.stringify(result,null,2)+'\n')
  if (errors.length || dataRequests.length || measurements.some(m => m.remaining !== '$290.00')) throw Error('Reference checks failed; inspect measurements.json')
  console.log(JSON.stringify({captures:36,viewports:measurements.length,pageErrors:errors.length,dataRequests:dataRequests.length,overflow:measurements.filter(m=>m.overflow).map(m=>m.name)}))
} finally { await browser.close() }
