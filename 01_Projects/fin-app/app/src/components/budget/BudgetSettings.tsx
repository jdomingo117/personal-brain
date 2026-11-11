import {useLayoutEffect,useRef,useState} from 'react'
import BudgetTaskPanel from '../BudgetTaskPanel'
import BudgetFrequency from '../BudgetFrequency'
import BudgetAccountPolicy from '../BudgetAccountPolicy'
import BudgetRollover from '../BudgetRollover'
import BudgetControls from '../BudgetControls'
import {Button} from '../Controls'
import {useBudget} from '../../contexts/BudgetContext'
import {useAuth} from '../../contexts/AuthContext'
import BudgetHistoryCoverage from './BudgetHistoryCoverage'

type SettingsTask='summary'|'frequency'|'accounts'|'coverage'|'rollover'|'lifecycle'
const titles:Record<SettingsTask,string>={summary:'Budget settings',frequency:'Budget frequency',accounts:'Budget accounts',coverage:'Account history coverage',rollover:'Rollover and categories',lifecycle:'Budget and allowances'}
/** Move existing controllers intact. One native modal owns focus and navigation. */
export default function BudgetSettings({onClose}:{onClose:()=>void}){
 const b=useBudget()
 const {role}=useAuth()
 const [task,setTask]=useState<SettingsTask>('summary'),last=useRef<SettingsTask>('summary'),root=useRef<HTMLDivElement>(null)
 function choose(next:SettingsTask){last.current=task==='summary'?next:task;setTask(next)}
 useLayoutEffect(()=>{const frame=requestAnimationFrame(()=>{const target=task==='summary'?root.current?.querySelector<HTMLElement>(`[data-settings-section="${last.current}"] button:not(:disabled)`):task==='coverage'?root.current?.querySelector<HTMLElement>('h4'):root.current?.querySelector<HTMLElement>('form h4')??root.current?.querySelector<HTMLElement>('form')??root.current?.querySelector<HTMLElement>('h3');if(target){target.tabIndex=target.tagName==='BUTTON'?target.tabIndex:-1;target.focus()}});return()=>cancelAnimationFrame(frame)},[task])
 const sections:[SettingsTask,typeof BudgetFrequency][]=[['frequency',BudgetFrequency],['accounts',BudgetAccountPolicy],['rollover',BudgetRollover],['lifecycle',BudgetControls]]
 return <BudgetTaskPanel title={titles[task]} onClose={onClose} resetKey={task==='coverage'?`${task}:${b.snapshot?.source_revision}`:task} completion="recovery">
  <div ref={root} className="budget-settings-content" data-settings-task={task}>
   <Button variant="ghost" disabled={b.loading||b.busy} onClick={()=>void b.refresh()}>Refresh settings data</Button>
   {b.loading&&<p role="status" className="body-copy">Refreshing saved settings data. Your current choices stay here.</p>}
   {b.preparation&&<section aria-label="Checking settings history" className="outcome-panel space-y-3"><p className="body-copy">{b.preparation.completed} of {b.preparation.total} saved budgets checked. Previously loaded settings remain below until the history check finishes.</p>{!b.loading&&<Button onClick={()=>void b.refresh()}>Continue checking settings history</Button>}</section>}
   {task==='summary'&&<p className="body-copy text-muted">Review how this budget works, which accounts it uses and what happens at the next boundary. Changes still require their existing effect review.</p>}
   {role==='owner'&&task==='summary'&&<div data-settings-section="coverage"><Button variant="ghost" onClick={()=>choose('coverage')}>Review account history coverage</Button></div>}
   {role==='owner'&&task==='coverage'&&<BudgetHistoryCoverage/>}
   {sections.filter(([kind])=>task==='summary'||task===kind).map(([kind,Component])=><div key={kind} data-settings-section={kind}><Component open={task===kind} setOpen={open=>choose(open?kind:'summary')}/></div>)}
  </div>
 </BudgetTaskPanel>
}
