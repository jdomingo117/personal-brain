import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prepareTestImpact} from './budget-test-impact.mjs'

/** Durable checkpoint adversarial tests, only in the isolated provisioner. */
export async function runBudgetImpactPreparationChecks({newUser,sql,quote,check,edge,source,commandSQL}){
 const u=await newUser(),foreign=await newUser(),e=randomUUID(),r=randomUUID()
 const start=sql(`SELECT date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date;`)
 const a=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},'Impact fictional','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 const snap=()=>JSON.parse(sql(`SELECT public.budget_query(${quote(u.tenant)},${quote(u.id)},'{"action":"snapshot"}');`))
 const body=i=>{const s=snap();return {plan_id:s.plan?.id,period_id:s.period?.id,expected_plan:s.plan?.version,expected_source:source(u.tenant),expected_method:'budget-foundation-v1',...i}}
 const cmd=(i,key=randomUUID(),enabled=true)=>JSON.parse(sql(commandSQL(u,key,body(i),enabled)))
 cmd({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:start,account_ids:[a],destination_account_ids:[],income_cents:10000,opening_drawdown_cents:0,lines:[{id:e,kind:'everyday',name:'Everyday',allocation_cents:7000,opening_cents:0},{id:r,kind:'reserve',name:'Flight',allocation_cents:3000,opening_cents:5000}]}})
 cmd({action:'activate',expected_draft:'1',accept_gap:false})
 const plan=snap().plan.id,scope=body({scope:'future',activity_account_ids:[a],destination_account_ids:[]})
 const step=(input=scope,actor=u,kind='account_scope',advance=true)=>JSON.parse(sql(`SET statement_timeout='8s';SELECT public.budget_review_impact(${quote(actor.tenant)},${quote(actor.id)},${quote(kind)},${quote(JSON.stringify(input))}::jsonb,${advance});`).split('\n').at(-1))
 const state=()=>sql(`SELECT jsonb_build_array((SELECT version FROM public.budget_plans WHERE id=${quote(plan)}),(SELECT count(*) FROM public.budget_operations WHERE tenant_id=${quote(u.tenant)}),(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.budget_account_memberships m WHERE plan_id=${quote(plan)}));`)
 const jobs=()=>JSON.parse(sql(`SELECT jsonb_build_array(count(*),count(before_facts),count(after_facts)) FROM public.budget_impact_preparations WHERE plan_id=${quote(plan)} AND actor_id=${quote(u.id)};`))
 const financial=state(),one=step()
 check('impact preparation commits one complete private projection only',[one.state,one.completed,jobs(),state()],[ 'preparing_impact',1,[1,1,0],financial])
 assert.throws(()=>step(scope,u,'account_scope',false),/budget_impact_required/)
 sql(`CREATE FUNCTION public.isolated_impact_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.after_facts IS NOT NULL THEN RAISE EXCEPTION 'isolated_impact_failure';END IF;RETURN NEW;END $$;CREATE TRIGGER isolated_impact_failure BEFORE UPDATE ON public.budget_impact_preparations FOR EACH ROW EXECUTE FUNCTION public.isolated_impact_failure();`)
 assert.throws(()=>step(),/isolated_impact_failure/)
 sql('DROP TRIGGER isolated_impact_failure ON public.budget_impact_preparations;DROP FUNCTION public.isolated_impact_failure();')
 check('failed second checkpoint preserves the first and every financial input',[jobs(),state()],[[1,1,0],financial])
 check('resumption needs no client cursor',step().completed,2)
 const ready=step()
 const raw=JSON.parse(sql(`SELECT public.budget_preview_account_scope_unprepared(${quote(u.tenant)},${quote(u.id)},${quote(JSON.stringify(scope))}::jsonb);`))
 check('prepared review equals the original complete calculation including hash',ready,raw)
 assert.throws(()=>step({...scope,expected_method:'old'}),/budget_stale_method/)
 assert.throws(()=>step({...scope,expected_source:String(BigInt(scope.expected_source)+1n)}),/budget_stale_source/)
 assert.throws(()=>step({...scope,expected_plan:String(BigInt(scope.expected_plan)+1n)}),/budget_stale_plan/)
 assert.throws(()=>step({...scope,expected_source:source(foreign.tenant)},foreign),/budget_not_found/)
 const viewer=await newUser();sql(`INSERT INTO public.tenant_members(tenant_id,user_id,role,joined_at) VALUES(${quote(u.tenant)},${quote(viewer.id)},'viewer','2000-01-01');`)
 assert.throws(()=>step(scope,{...viewer,tenant:u.tenant}),/budget_forbidden/)
 check('impact authority rejects foreign owners, viewers and stale generations',true)
 const changed={...scope,destination_account_ids:[a]}
 check('changing intent starts a fresh complete first check',step(changed).completed,1)
 assert.throws(()=>step(scope,u,'account_scope',false),/budget_stale_preview/)
 check('replacing intent keeps a single bounded slot',jobs(),[1,1,0])
 prepareTestImpact({sql,quote,user:u,kind:'account_scope',input:scope})
 for(const assignment of ["expires_at=now()-interval '1 second'","local_date=local_date-1","method='old'","actor_role='viewer'"]){
  sql(`UPDATE public.budget_impact_preparations SET ${assignment} WHERE plan_id=${quote(plan)};`)
  assert.throws(()=>step(scope,u,'account_scope',false),/budget_stale_preview/)
  check(`invalid impact binding (${assignment.split('=')[0]}) restarts rather than silently reuses`,step().completed,1)
  prepareTestImpact({sql,quote,user:u,kind:'account_scope',input:scope})
 }
 const reviewed=step(),input={...scope,action:'set_account_scope',preview_hash:reviewed.preview_hash,accept_impact:true,accept_incomplete:true}
 // An out-of-band financial mutation without a version bump must still fail
 // the semantic proof, never authorize cached money. Roll back the test probe.
 assert.throws(()=>sql(`BEGIN;UPDATE public.budget_account_memberships SET end_date=${quote(start)}::date+1 WHERE plan_id=${quote(plan)};${commandSQL(u,randomUUID(),input)}COMMIT;`),/budget_stale_preview/)
 check('semantic proof rejects mismatched inputs without changing money',state(),financial)
 sql(`CREATE FUNCTION public.isolated_actual_impact_mismatch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE public.budget_account_memberships SET end_date=start_date+1 WHERE plan_id=NEW.id AND start_date=${quote(start)}::date;RETURN NEW;END $$;CREATE TRIGGER isolated_actual_impact_mismatch AFTER UPDATE ON public.budget_plans FOR EACH ROW EXECUTE FUNCTION public.isolated_actual_impact_mismatch();`)
 assert.throws(()=>sql(commandSQL(u,randomUUID(),input)),/budget_stale_preview/)
 sql('DROP TRIGGER isolated_actual_impact_mismatch ON public.budget_plans;DROP FUNCTION public.isolated_actual_impact_mismatch();')
 check('actual applied inputs must match the prepared after-state or the whole save rolls back',state(),financial)
 sql(`CREATE FUNCTION public.isolated_impact_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated_impact_audit_failure';END $$;CREATE TRIGGER isolated_impact_audit_failure BEFORE INSERT ON public.budget_account_policies FOR EACH ROW EXECUTE FUNCTION public.isolated_impact_audit_failure();`)
 assert.throws(()=>sql(commandSQL(u,randomUUID(),input)),/isolated_impact_audit_failure/)
 sql('DROP TRIGGER isolated_impact_audit_failure ON public.budget_account_policies;DROP FUNCTION public.isolated_impact_audit_failure();')
 check('failed final audit preserves the ready preparation and atomic financial state',[jobs(),state()],[[1,1,1],financial])
 const key=randomUUID(),receipt=JSON.parse(sql(commandSQL(u,key,input)))
 sql(`UPDATE public.budget_impact_preparations SET expires_at=now()-interval '1 second' WHERE plan_id=${quote(plan)};`)
 check('receipt replay survives expired preparation and disabled writes',JSON.parse(sql(commandSQL(u,key,input,false))),receipt)
 check('real Edge recovers the same receipt after preparation expiry',(await edge(u,'manage-budget',{...input,request_id:key})).body,receipt)
 cmd({action:'undo',operation_id:receipt.operation_id})
 check('expired checkpoint safely falls back for compatible Undo',snap().plan.version,String(BigInt(scope.expected_plan)+2n))
 check('private impact table is not browser-readable',sql("SELECT has_table_privilege('authenticated','public.budget_impact_preparations','SELECT');"),'f')
 check('impact context cannot escape a request',sql("SELECT coalesce(current_setting('halcyon.impact_job',true),'')||coalesce(current_setting('halcyon.impact_mode',true),'');"),'')
}
