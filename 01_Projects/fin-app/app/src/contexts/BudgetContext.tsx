import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabaseClient'
import { BUDGET_ENABLED, BUDGET_METHOD, recoverBudgetCommand, type Command, type Draft, type Receipt, type Setup, type Snapshot } from '../lib/budgetWorkspace'
import type { BudgetSourcesPage } from '../lib/budgetItems'
import type {AccountScopeIntent,AccountScopePreview} from '../lib/budgetAccountPolicy'
import type {RolloverIntent,RolloverPreview} from '../lib/budgetRollover'
import type {ControlIntent,ControlPreview} from '../lib/budgetControls'
import {isPreparing,historyRequest,type HistoryPreparation,type PreparingWorkspace} from '../lib/budgetHistory'
import {prepareImpact,type ImpactPreparation} from '../lib/budgetImpact'

class BudgetApiError extends Error {
  constructor(message:string,readonly definitive:boolean){super(message)}
}
async function invoke<T>(name:string,body:unknown):Promise<T> {
  const {data,error}=await supabase.functions.invoke(name,{body:body as Record<string,unknown>})
  if(error) {
    const response=error.context instanceof Response?error.context:null
    let detail:{message?:string;code?:string}|null=null
    try{detail=response?await response.clone().json():null}catch{}
    const definitive=!!response && ([400,401,403,404,409,413,422,429].includes(response.status)||detail?.code==='disabled')
    throw new BudgetApiError(detail?.message??'We couldn’t confirm the result. Your edits are still here.',definitive)
  }
  if(!data||typeof data!=='object')throw new BudgetApiError('The Budget response was incomplete. Please check again.',false)
  return data as T
}
type Workspace = {
  snapshot:Snapshot|null; draft:Draft|null; editing:Setup|null; setEditing:(s:Setup|null)=>void;
  loading:boolean; busy:boolean; error:string; notice:string; pending:Command|null; canWrite:boolean;
  preparation:HistoryPreparation|null;
  impactPreparation:ImpactPreparation|null;
  refresh:()=>Promise<void>; run:(input:Record<string,unknown>)=>Promise<Receipt|null>; recover:()=>Promise<void>;
  sources:(after?:{booking_date:string;source_key:string})=>Promise<BudgetSourcesPage>;
  selectPeriod:(id:string|null)=>void;
  previewAccountScope:(intent:AccountScopeIntent)=>Promise<AccountScopePreview>;
  previewRollover:(intent:RolloverIntent)=>Promise<RolloverPreview>;
  previewControl:(intent:ControlIntent)=>Promise<ControlPreview>;
}
const BudgetContext=createContext<Workspace|null>(null)
export function useBudget(){const ctx=useContext(BudgetContext);if(!ctx)throw new Error('Budget workspace is unavailable');return ctx}

/** Lives above route unmounts. A tenant/user change creates an entirely new workspace. */
export function BudgetProvider({children}:{children:ReactNode}) {
  const {user,tenantId,role}=useAuth()
  const identity=user&&tenantId?`${user.id}:${tenantId}`:null
  return <BudgetSession key={`${identity??'signed-out'}:${role??'none'}`} identity={identity} tenantId={tenantId} owner={role==='owner'}>{children}</BudgetSession>
}
function BudgetSession({children,identity,tenantId,owner}:{children:ReactNode;identity:string|null;tenantId:string|null;owner:boolean}) {
  const storageKey=identity?`halcyon-budget-pending-v1:${identity}`:null
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[draft,setDraft]=useState<Draft|null>(null)
  const [editing,setEditing]=useState<Setup|null>(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false)
  const [error,setError]=useState(''),[notice,setNotice]=useState('')
  const [preparation,setPreparation]=useState<HistoryPreparation|null>(null)
  const [impactPreparation,setImpactPreparation]=useState<ImpactPreparation|null>(null)
  const [selectedPeriod,setSelectedPeriod]=useState<string|null>(()=>new URLSearchParams(window.location.search).get('budgetPeriod'))
  useEffect(()=>{const pop=()=>setSelectedPeriod(new URLSearchParams(window.location.search).get('budgetPeriod'));window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop)},[])
  const [pending,setPending]=useState<Command|null>(()=>{
    try{return storageKey&&owner?JSON.parse(sessionStorage.getItem(storageKey)??'null'):null}catch{return null}
  })
  const mounted=useRef(true),working=useRef(false),sequence=useRef(0)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;sequence.current++}},[])
  // Signing out/switching identity clears the old user's transient checkpoint, not their saved draft.
  useEffect(()=>()=>{if(storageKey)try{sessionStorage.removeItem(storageKey)}catch{}},[storageKey])
  useEffect(()=>{
    if(!editing&&!pending)return
    const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''}
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)
  },[editing,pending])
  const refresh=useCallback(async()=>{
    if(!identity)return
    const generation=++sequence.current;setLoading(true)
    let checkingHistory=false
    try {
      const [loaded,nextDraft]=await Promise.all([
        invoke<Snapshot|PreparingWorkspace>('query-budget',{action:'workspace',...(selectedPeriod?{period_id:selectedPeriod}:{})}),
        owner?invoke<Draft>('query-budget',{action:'draft'}):Promise.resolve(null),
      ])
      let next=loaded
      for(let batch=0;isPreparing(next)&&batch<4;batch++){
        if(!mounted.current||generation!==sequence.current)return
        if(next.tenant_id!==tenantId)throw Error('Your workspace changed. Sign in again before continuing.')
        checkingHistory=true
        setPreparation(next.preparation)
        next=await invoke<PreparingWorkspace>('query-budget',historyRequest(next.preparation))
        if(isPreparing(next)&&next.preparation.ready)next=await invoke<Snapshot|PreparingWorkspace>('query-budget',{action:'workspace',...(selectedPeriod?{period_id:selectedPeriod}:{})})
      }
      if(!mounted.current||generation!==sequence.current)return
      if(next.tenant_id!==tenantId)throw new Error('Your workspace changed. Sign in again before continuing.')
      setDraft(nextDraft);setError('')
      if(isPreparing(next)){setPreparation(next.preparation);return}
      setSnapshot(next as Snapshot);setPreparation(null)
    }catch(e){if(mounted.current&&generation===sequence.current)setError(checkingHistory&&!(e instanceof BudgetApiError&&e.definitive)?'We couldn’t finish checking your history. Completed batches are saved. Continue loading when the connection is ready.':e instanceof Error?e.message:'Budget could not load.')}
    finally{if(mounted.current&&generation===sequence.current)setLoading(false)}
  },[identity,owner,tenantId,selectedPeriod])
  // Load only when the Budget page requests it, not on every authenticated route.
  function checkpoint(command:Command|null) {
    try{if(storageKey) {
      if(command)sessionStorage.setItem(storageKey,JSON.stringify(command))
      else sessionStorage.removeItem(storageKey)
    }}catch{if(command)throw new BudgetApiError('Enable tab storage before saving so an interrupted save can be recovered. No request was sent.',true)}
    setPending(command)
  }
  async function execute(command:Command,recovery:boolean):Promise<Receipt|null> {
    if(working.current||!owner)return null
    working.current=true;setBusy(true);setError('');setNotice(recovery?'Checking the saved result…':'Saving your budget…')
    try {
      // Refuse to send if a reload-safe checkpoint cannot be stored.
      checkpoint(command)
      const receipt=recovery?await recoverBudgetCommand(command,b=>invoke('query-budget',b),b=>invoke('manage-budget',b)):await invoke<Receipt>('manage-budget',command)
      if(!mounted.current)return null
      if(receipt.request_id!==command.request_id||receipt.status!=='committed')throw new BudgetApiError('The saved result needs to be checked again.',false)
      checkpoint(null);setEditing(null);setNotice(receipt.result.attention_version?'Review preference saved. Budget amounts are unchanged.':command.action==='save_draft'?'Draft saved. Your budget is not active yet.':'Budget saved. No money was moved.')
      await refresh();return receipt
    }catch(e){
      if(mounted.current) {
        if(e instanceof BudgetApiError&&e.definitive){checkpoint(null);setNotice('No new change was saved by this request. Your edits are still here.')}
        else setNotice('The result is not confirmed. Check the saved result before making another change.')
        setError(e instanceof Error?e.message:'Budget could not be saved.')
      }
      return null
    }finally{working.current=false;if(mounted.current)setBusy(false)}
  }
  const run=async(input:Record<string,unknown>)=>{
    if(!BUDGET_ENABLED||pending||preparation||!snapshot||!snapshot.write_enabled||!owner||loading)return null
    return execute({ ...input,request_id:crypto.randomUUID(),expected_source:snapshot.source_revision,expected_method:BUDGET_METHOD } as Command,false)
  }
  async function sources(after?:{booking_date:string;source_key:string}) {
    if(!snapshot?.plan||!snapshot.period)throw new Error('Load a budget before matching activity.')
    const result=await invoke<BudgetSourcesPage>('query-budget',{action:'sources',plan_id:snapshot.plan.id,period_id:snapshot.period.id,...(after?{after_date:after.booking_date,after_key:after.source_key}:{})})
    if(!mounted.current)throw new Error('Your workspace changed. Reload before matching.')
    if(result.source_revision!==snapshot.source_revision||result.plan_version!==snapshot.plan.version)throw new Error('Activity changed. Refresh your budget and review the match again.')
    return result
  }
  async function review<T>(body:Record<string,unknown>):Promise<T>{
    const generation=sequence.current
    try{return await prepareImpact<T>(body,b=>invoke<T|ImpactPreparation>('query-budget',b),p=>{if(mounted.current)setImpactPreparation(p)},()=>mounted.current&&generation===sequence.current)}
    catch(e){if(e instanceof BudgetApiError&&!e.definitive)throw Error('We couldn’t finish checking the budget effects. Completed checks are saved. Review the effects again to continue; no budget change has been saved.');throw e}
  }
  return <BudgetContext.Provider value={{snapshot,draft,editing,setEditing,loading,busy,error,notice,pending,preparation,impactPreparation,canWrite:BUDGET_ENABLED&&owner&&!!snapshot?.write_enabled&&!pending&&!preparation&&!busy&&!loading,
    refresh,run,sources,previewControl:async intent=>{
      if(!owner||!snapshot?.plan||!snapshot.period||pending||working.current||loading)throw Error('Load the latest budget before reviewing a lifecycle change.')
      const result=await review<ControlPreview>({action:'preview_control',...intent,plan_id:snapshot.plan.id,period_id:snapshot.period.id,expected_plan:snapshot.plan.version,expected_source:snapshot.source_revision,expected_method:BUDGET_METHOD})
      if(!mounted.current||result.source_revision!==snapshot.source_revision||result.plan_version!==snapshot.plan.version)throw Error('Your budget changed. Review a fresh control preview.')
      return result
    },previewRollover:async intent=>{
      if(!owner||!snapshot?.plan||!snapshot.period||pending||working.current||loading)throw Error('Load the latest budget before reviewing rollover.')
      const result=await review<RolloverPreview>({action:'preview_rollover',...intent,plan_id:snapshot.plan.id,period_id:snapshot.period.id,expected_plan:snapshot.plan.version,expected_source:snapshot.source_revision,expected_method:BUDGET_METHOD})
      if(!mounted.current||result.source_revision!==snapshot.source_revision||result.plan_version!==snapshot.plan.version)throw Error('Your budget changed. Review a fresh rollover preview.')
      return result
    },previewAccountScope:async intent=>{
      if(!owner||!snapshot?.plan||!snapshot.period||pending||working.current||loading)throw Error('Load the latest budget before reviewing account changes.')
      const result=await review<AccountScopePreview>({action:'preview_account_scope',...intent,plan_id:snapshot.plan.id,period_id:snapshot.period.id,expected_plan:snapshot.plan.version,expected_source:snapshot.source_revision,expected_method:BUDGET_METHOD})
      if(!mounted.current||result.source_revision!==snapshot.source_revision||result.plan_version!==snapshot.plan.version)throw Error('Your budget changed. Review a fresh account preview.')
      return result
    },selectPeriod:id=>{if(editing||pending||working.current||loading)return;const url=new URL(window.location.href);if(id)url.searchParams.set('budgetPeriod',id);else url.searchParams.delete('budgetPeriod');window.history.pushState({},'',url);if(id===selectedPeriod)void refresh();else setSelectedPeriod(id)},recover:async()=>{if(pending)await execute(pending,true)}}}>{children}</BudgetContext.Provider>
}
