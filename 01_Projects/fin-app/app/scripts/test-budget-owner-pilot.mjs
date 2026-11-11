import { randomUUID } from 'node:crypto'

/** Uses only synthetic identities in the guarded candidate stack. */
export async function runBudgetOwnerPilotChecks({api,anon,newUser,sql,quote,check,edge,source,restartFunctions}) {
  const owner=await newUser(), other=await newUser(), member=await newUser()
  sql(`INSERT INTO public.tenant_members(tenant_id,user_id,role,joined_at)
    VALUES (${quote(owner.tenant)},${quote(member.id)},'member','2000-01-01');`)
  const request={action:'save_draft',request_id:randomUUID(),expected_source:source(owner.tenant),expected_draft:'0',payload:{unfinished:'Pilot fixture'}}
  const workspace={action:'workspace'}
  const denied=async(label,user,endpoint,body)=>{
    const response=await edge(user,endpoint,body)
    check(label,[response.status,response.body.code],[403,'budget_access_restricted'])
  }

  await denied('an unset pilot owner fails closed for reads',owner,'query-budget',workspace)
  await denied('an unset pilot owner fails closed with writes enabled',owner,'manage-budget',request)
  await restartFunctions('BUDGET_V1_ENABLED=true\nBUDGET_PILOT_OWNER_USER_ID=invalid\nBUDGET_TEST_SHARED_ACCESS=true')
  await denied('an invalid owner cannot fall through to shared access',owner,'query-budget',workspace)

  const pilot=`BUDGET_PILOT_OWNER_USER_ID=${owner.id}`
  await restartFunctions(`BUDGET_V1_ENABLED=true\n${pilot}`)
  check('anonymous requests still require authentication',(await edge(null,'query-budget',workspace)).status,401)
  check('the invited owner can read their Budget workspace',(await edge(owner,'query-budget',workspace)).status,200)
  await denied('another tenant owner cannot read Budget',other,'query-budget',workspace)
  await denied('another tenant owner cannot write Budget',other,'manage-budget',request)
  await denied('a member of the pilot tenant cannot read Budget',member,'query-budget',workspace)
  check('a member of the pilot tenant cannot write Budget',(await edge(member,'manage-budget',request)).status,403)
  sql(`UPDATE public.tenant_members SET role='viewer' WHERE tenant_id=${quote(owner.tenant)} AND user_id=${quote(owner.id)};`)
  await denied('the invited identity also needs the owner role',owner,'query-budget',workspace)
  sql(`UPDATE public.tenant_members SET role='owner' WHERE tenant_id=${quote(owner.tenant)} AND user_id=${quote(owner.id)};`)
  check('denied attempts leave no Budget operations',sql('SELECT count(*) FROM public.budget_operations;'),'0')

  const saved=await edge(owner,'manage-budget',request)
  check('the invited owner can save a Budget draft',saved.status,200)
  const direct=await fetch(`${api}/rest/v1/budget_drafts?select=*`,{headers:{apikey:anon,Authorization:`Bearer ${owner.token}`}})
  check('even the invited owner must read Budget through Edge',direct.status,403)
  const memberDirect=await fetch(`${api}/rest/v1/budget_plans?select=*`,{headers:{apikey:anon,Authorization:`Bearer ${member.token}`}})
  check('a member cannot bypass Edge through direct Budget reads',memberDirect.status,403)
  const legacy=await fetch(`${api}/rest/v1/budgets?select=id`,{headers:{apikey:anon,Authorization:`Bearer ${other.token}`}})
  check('legacy Budget table retains its existing client read path',legacy.status,200)

  await restartFunctions(`BUDGET_V1_ENABLED=false\n${pilot}\nBUDGET_TEST_SHARED_ACCESS=true`)
  await denied('shared test access cannot override a configured pilot owner',other,'query-budget',workspace)
  const paused=await edge(owner,'query-budget',workspace)
  check('the invited owner can read while Budget writes are paused',[paused.status,paused.body.write_enabled],[200,false])
  const outcome=await edge(owner,'query-budget',{action:'operation',request_id:request.request_id})
  check('the invited owner can still look up the committed receipt',[outcome.status,outcome.body.outcome],[200,saved.body])
  const replay=await edge(owner,'manage-budget',request)
  check('a paused write switch preserves exact receipt replay',[replay.status,replay.body],[200,saved.body])
  check('the paused write switch blocks new commands',(await edge(owner,'manage-budget',{...request,request_id:randomUUID(),expected_draft:'1'})).status,503)
  await denied('a denied owner cannot use another owner’s receipt key',other,'query-budget',{action:'operation',request_id:request.request_id})
  check('exactly one operation remains after recovery',sql('SELECT count(*) FROM public.budget_operations;'),'1')
}
