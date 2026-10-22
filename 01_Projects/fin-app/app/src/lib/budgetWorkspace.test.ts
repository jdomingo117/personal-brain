import { describe,expect,it,vi } from 'vitest'
import { blankSetup,parseBudgetMoney,readSavedSetup,recoverBudgetCommand,setupPeriod,setupSummary,validateSetup,type Command } from './budgetWorkspace'

describe('Budget workspace entry and previews',()=>{
  it.each([['0',0],['12.30',1230],['001.2',120],[' 5 ',500],['90071992547409.91',Number.MAX_SAFE_INTEGER]])('parses exact decimal %s',(input,value)=>expect(parseBudgetMoney(input)).toBe(value))
  it.each(['','-1','1e3','1,000','1.001','.5','Infinity','90071992547409.92','1.','abc'])('does not turn invalid %s into zero',input=>expect(parseBudgetMoney(input)).toBeNull())
  it('uses an injected clock and preserves a no-bank, zero-income setup',()=>{
    const setup=blankSetup(()=>new Date('2026-10-20T01:00:00Z'))
    expect(setup.start_date).toBe('2026-10-20');expect(setup.account_ids).toEqual([]);validateSetup(setup)
    expect(setupSummary(setup).current.resources).toBe(0)
  })
  it('keeps the existing cash out of future resources',()=>{
    const setup=blankSetup();setup.income_cents=10000;setup.opening_drawdown_cents=5000;setup.lines[0].allocation_cents=14000
    expect(setupSummary(setup).current.fundingGap).toBe(0);expect(setupSummary(setup).future.fundingGap).toBe(4000)
  })
  it('anchors the 14-day period instead of dividing a month in half',()=>{
    const setup={...blankSetup(),frequency:'fortnightly' as const,anchor:'2026-10-09',start_date:'2026-10-21'}
    expect(setupPeriod(setup)).toMatchObject({start:'2026-10-09',end:'2026-10-23'})
  })
  it('rejects invalid timezone, unsafe totals and unnamed allowances',()=>{
    const setup=blankSetup();expect(()=>validateSetup({...setup,timezone:'Not/a-zone'})).toThrow()
    expect(()=>validateSetup({...setup,income_cents:Number.MAX_SAFE_INTEGER,opening_drawdown_cents:1})).toThrow()
    setup.lines[0].name=' ';expect(()=>validateSetup(setup)).toThrow()
  })
  it('never treats an older or partial draft as ready setup',()=>{
    expect(readSavedSetup({})).toBeNull();expect(readSavedSetup({income_cents:'unknown'})).toBeNull()
    expect(readSavedSetup({...blankSetup(),lines:[null]})).toBeNull()
    const setup=blankSetup();expect(readSavedSetup(setup)).toEqual(setup)
  })
})
describe('unknown Budget result recovery',()=>{
  const command:Command={action:'activate',request_id:'original-key',expected_source:'42',expected_method:'budget-foundation-v1',expected_draft:'2',accept_gap:false}
  const receipt={request_id:'original-key',operation_id:'operation',status:'committed' as const,result:{}}
  it('uses an existing receipt without sending another mutation',async()=>{
    let writes=0;expect(await recoverBudgetCommand(command,async()=>({outcome:receipt}),async()=>{writes++;return receipt})).toEqual(receipt);expect(writes).toBe(0)
  })
  it('replays the exact key, source and payload when no receipt is present',async()=>{
    let sent:Command|null=null;await recoverBudgetCommand(command,async()=>({outcome:null}),async body=>{sent=body;return receipt});expect(sent).toBe(command)
  })
  it('does not write when the outcome lookup fails',async()=>{
    let writes=0;await expect(recoverBudgetCommand(command,async()=>{throw Error('offline')},async()=>{writes++;return receipt})).rejects.toThrow('offline');expect(writes).toBe(0)
  })
})
describe('private Budget navigation',()=>{
  it.each([false,true])('keeps existing deep links and conditionally inserts Budget: %s',async enabled=>{
    vi.resetModules();vi.stubEnv('VITE_BUDGET_V1_ENABLED',String(enabled))
    try{
      const {NAV,VIEW_PATHS,navNumber}=await import('../router')
      expect(VIEW_PATHS.ledger).toBe('/ledger');expect(VIEW_PATHS.budget).toBe('/budget')
      expect(NAV.some(n=>n.id==='budget')).toBe(enabled)
      expect(navNumber('ledger')).toBe(enabled?'06':'05')
      if(enabled)expect(NAV.findIndex(n=>n.id==='budget')).toBe(NAV.findIndex(n=>n.id==='expenses')+1)
    }finally{vi.unstubAllEnvs();vi.resetModules()}
  })
})
