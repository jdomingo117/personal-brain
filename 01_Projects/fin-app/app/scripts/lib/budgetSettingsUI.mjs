import {expect} from '@playwright/test'
export const settingsPanel=page=>page.getByRole('dialog').filter({has:page.locator('[data-settings-task]')})
export async function openBudgetSettings(page){
 const panel=settingsPanel(page)
 if(!await panel.isVisible())await page.getByRole('region',{name:'Budget header',exact:true}).getByRole('button',{name:'Accounts & settings',exact:true}).click()
 await expect(panel).toBeVisible();return panel
}
export async function stayInBudgetSettings(page){
 const panel=settingsPanel(page);await panel.getByRole('button',{name:'Close',exact:true}).click()
 await expect(panel.getByRole('button',{name:'Stay and keep editing',exact:true})).toBeFocused()
 await panel.getByRole('button',{name:'Stay and keep editing',exact:true}).click()
}
export async function closeBudgetSettings(page){
 const panel=settingsPanel(page);await expect(panel.locator('[data-settings-task]')).toHaveAttribute('data-settings-task','summary')
 await panel.getByRole('button',{name:'Close',exact:true}).click();await expect(panel).toBeHidden()
}
