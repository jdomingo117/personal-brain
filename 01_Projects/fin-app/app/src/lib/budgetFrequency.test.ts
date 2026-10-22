import {it,expect} from 'vitest'
import {frequencyDraft,frequencyWindow} from './budgetFrequency'
import type {Snapshot} from './budgetWorkspace'
const s={plan:{frequency:'fortnightly'},period:{start_date:'2026-12-12',end_date:'2026-12-26',frequency:'fortnightly',timezone:'Australia/Sydney'},lines:[{id:'e',kind:'everyday',name:'Everyday'},{id:'r',kind:'reserve',name:'Goal'}],future_template:{income_cents:20000,allocations:[{line_id:'e',amount_cents:10000},{line_id:'r',amount_cents:10000}]},details:{limits:[],items:[{line_id:'r',name:'Goal',reserve_cents:30000,config:{type:'goal',cadence:'fortnightly',anchor:'2026-12-26',amount_cents:10000,state:'saving',due_date:'2027-02-01',target_cents:50000}}]}} as unknown as Snapshot
it('reviews a short bridge separately from a continuing full month',()=>{
 const d=frequencyDraft(s)
 expect(d.windows.initial).toMatchObject({start:'2026-12-26',end:'2027-01-01',transition:true})
 expect(d.windows.continuing).toMatchObject({start:'2027-01-01',end:'2027-02-01',transition:false})
 expect(d.initial.lines).toEqual(s.future_template!.allocations)
 d.initial.lines[0].amount_cents=1
 expect(d.continuing.lines[0].amount_cents).toBe(10000)
 expect(s.future_template!.allocations[0].amount_cents).toBe(10000)
})
it('monthly to fortnightly uses fourteen dates rather than half a month',()=>{
 const d=frequencyDraft({...s,period:{...s.period!,start_date:'2028-02-01',end_date:'2028-03-01',frequency:'monthly'}})
 expect(d.windows.initial).toMatchObject({start:'2028-03-01',end:'2028-03-15',transition:false})
 expect(d.windows.continuing.end).toBe('2028-03-29')
 expect(d.initial.income_cents).toBe(20000)
})
it('an aligned monthly transition has no zero-length bridge',()=>{
 expect(frequencyDraft({...s,period:{...s.period!,start_date:'2026-12-18',end_date:'2027-01-01'}}).windows.initial).toMatchObject({start:'2027-01-01',end:'2027-02-01',transition:false})
})
it('counts saved goal dates without rescheduling or inventing savings',()=>{
 const d=frequencyDraft(s),p=frequencyWindow(s,d.continuing,d.windows.continuing.start,d.windows.continuing.end)
 expect(p.schedules.find(x=>x.line_id==='r')).toMatchObject({dated_cents:20000,dates:['2027-01-09','2027-01-23'],reserve_cents:30000,deadline_dates:['2027-01-09','2027-01-23']})
 expect(p.summary.resources).toBe(20000)
})
it('checks preserved category amounts against both new everyday pools',()=>{
 const copy=structuredClone(s);copy.details!.limits=[{id:'l',category_id:'Shopping',subcategory_id:null,custom_subcategory_id:null,amount_cents:15000}]
 const d=frequencyDraft(copy)
 expect(frequencyWindow(copy,d.initial,'2026-12-26','2027-01-01').limitsFit).toBe(false)
})
it('paused goals show no promised future contribution dates',()=>{
 const copy=structuredClone(s);copy.details!.items[0].config!.state='paused'
 const d=frequencyDraft(copy),p=frequencyWindow(copy,d.continuing,d.windows.continuing.start,d.windows.continuing.end)
 expect(p.schedules.find(x=>x.line_id==='r')).toMatchObject({dates:[],deadline_dates:[],dated_cents:0})
})
it('fails safely on missing line identity and unsafe amounts',()=>{
 const d=frequencyDraft(s)
 expect(()=>frequencyWindow(s,{...d.initial,lines:[{line_id:'foreign',amount_cents:1}]},'2026-12-26','2027-01-01')).toThrow()
 expect(()=>frequencyWindow(s,{...d.initial,lines:d.initial.lines.map(l=>({...l,amount_cents:Number.MAX_SAFE_INTEGER}))},'2026-12-26','2027-01-01')).toThrow()
})
