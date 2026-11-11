import {describe,it,expect,vi} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import BudgetCoverageReadiness from './BudgetCoverageReadiness'
import type {AssistanceResult} from '../../lib/budgetAssistance'

vi.mock('../../contexts/BudgetContext',()=>({useBudget:()=>({canWrite:true,busy:false,error:'',run:async()=>null})}))

const months=['2026-04-01','2026-05-01','2026-06-01','2026-07-01','2026-08-01','2026-09-01','2026-10-01']
const result={method:'budget-assist-v2',source_revision:'1',frequency:'monthly',start_date:'2026-10-01',anchor:'2026-10-01',account_ids:['spend','vanguard'],account_count:2,invalid_accounts:[],
  missing_coverage:[0,1,2,3,4,5].map(i=>({account_id:'spend',start_date:months[i],end_date:months[i+1]})).concat([{account_id:'vanguard',start_date:months[5],end_date:months[6]}]),
  periods:[],period_count:0,integrity_ok:true,eligible:false,variable:false,fingerprint:'f',suggestions:{income_cents:0,everyday_cents:null,bills_cents:0},recurring:[]} as AssistanceResult
const names:Record<string,string>={spend:'Everyday Spending',vanguard:'Index Fund'}

describe('coverage readiness checklist',()=>{
  const html=renderToStaticMarkup(<BudgetCoverageReadiness result={result} today="2026-11-10" accountName={id=>names[id]} onConfirmed={()=>{}} onLeaveOut={()=>{}}/>)
  it('states how many months are ready and how many are needed',()=>{
    expect(html).toContain('<strong>0 of 6</strong> months ready (April 2026 – September 2026). Suggestions need 3. 2 accounts need confirming.')
  })
  it('offers a pre-filled confirmation and a way to leave each account out',()=>{
    expect(html).toContain('Confirm 1 Apr 2026 – 30 Sept 2026')
    expect(html).toContain('Confirm 1 Sept 2026 – 30 Sept 2026')
    expect(html).toContain('aria-label="Leave Index Fund out of the history check"')
  })
  it('labels each month for assistive technology',()=>{
    expect(html).toContain('aria-label="April 2026: not confirmed"')
    expect(html).toContain('aria-label="Index Fund months"')
    expect((html.match(/: confirmed"/g)??[]).length).toBe(5)
  })
  it('offers to leave out unused accounts in one step and labels activity',()=>{
    const activity=[{account_id:'spend',type:'Liquid',last_activity_date:'2026-11-09',recent_activity_count:80,window_start:'2026-05-01'},
      {account_id:'vanguard',type:'Invest',last_activity_date:null,recent_activity_count:0,window_start:'2026-05-01'}]
    const out=renderToStaticMarkup(<BudgetCoverageReadiness result={result} today="2026-11-10" accountName={id=>names[id]} activity={activity} onConfirmed={()=>{}} onLeaveOut={()=>{}}/>)
    expect(out).toContain('Index Fund looks unused. Leaving it out is usually right')
    expect(out).toContain('>Leave it out<')
    expect(out).toContain('Investment account')
    expect(out).toContain('Last activity 9 Nov 2026')
  })
})
