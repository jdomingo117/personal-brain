-- Lifetime reserve rights persist, but a released everyday allowance belongs
-- to its effective period. Carrying it again must not duplicate that release.
CREATE OR REPLACE FUNCTION public.budget_details_m4(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET statement_timeout='8s' AS $$
DECLARE plan public.budget_plans%ROWTYPE;period public.budget_periods%ROWTYPE;v bigint;answer jsonb;BEGIN
 v:=public.budget_lock_source(p_tenant);
 IF NOT EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor) THEN RAISE EXCEPTION 'budget_forbidden';END IF;
 SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=p_plan;
 SELECT * INTO period FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=p_plan AND id=p_period;
 IF plan.id IS NULL OR period.id IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF v<>p_source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 IF plan.version<>p_version THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
 WITH claims AS MATERIALIZED (SELECT * FROM public.budget_live_claims(p_tenant,p_plan)),
 activity AS MATERIALIZED (SELECT * FROM public.budget_activity(p_tenant,p_plan,period.start_date,period.end_date)),
 config AS (SELECT DISTINCT ON(r.line_id) r.line_id,r.id,r.payload FROM public.budget_item_revisions r JOIN public.budget_periods p ON p.id=r.period_id WHERE r.plan_id=p_plan AND p.start_date<=period.start_date ORDER BY r.line_id,r.version DESC),
 facts AS (
 SELECT l.*,c.id item_revision,c.payload config,a.amount_cents planned_cents,
 coalesce((SELECT sum(CASE WHEN x.purpose='refund' THEN -x.amount_cents ELSE x.amount_cents END) FROM claims x WHERE x.valid AND x.line_id=l.id AND x.purpose IN('expense','purchase','refund') AND x.source_date>=period.start_date AND x.source_date<period.end_date),0) period_used,
 coalesce((SELECT sum(CASE WHEN x.purpose='refund' THEN -x.amount_cents ELSE x.amount_cents END) FROM claims x WHERE x.valid AND x.line_id=l.id AND x.purpose IN('expense','purchase','refund') AND x.source_date>=l.opening_date AND x.source_date<period.end_date),0) lifetime_used,
 coalesce((SELECT sum(b.amount_cents) FROM public.budget_allocations b JOIN public.budget_periods p ON p.current_revision_id=b.revision_id WHERE b.line_id=l.id AND p.end_date<=period.end_date),0) allocated_to_date,
 coalesce((SELECT sum(CASE WHEN m.to_line_id=l.id THEN m.amount_cents ELSE -m.amount_cents END) FROM public.budget_reserve_moves m WHERE m.plan_id=p_plan AND (m.to_line_id=l.id OR m.from_line_id=l.id) AND m.effective_date<period.end_date AND (l.kind='reserve' OR m.effective_date>=period.start_date)),0) reallocated,
 coalesce((SELECT sum(x.amount_cents) FROM claims x WHERE x.valid AND x.line_id=l.id AND x.purpose='funding' AND x.source_date<period.end_date AND x.provenance='bank-observed'),0) bank_confirmed,
 coalesce((SELECT sum(x.amount_cents) FROM claims x WHERE x.valid AND x.line_id=l.id AND x.purpose='funding' AND x.source_date<period.end_date AND x.provenance='user-confirmed'),0) user_confirmed
 FROM public.budget_lines l JOIN public.budget_allocations a ON a.line_id=l.id AND a.revision_id=period.current_revision_id LEFT JOIN config c ON c.line_id=l.id WHERE l.plan_id=p_plan AND NOT coalesce((c.payload->>'voided')::boolean,false)
 ), residual AS (
 SELECT a.*,a.capacity-coalesce((SELECT sum(x.amount_cents) FROM claims x LEFT JOIN public.budget_lines l ON l.id=x.line_id WHERE x.valid AND x.source_key=a.source_key AND x.purpose<>'funding' AND (x.purpose='exclude' OR l.kind<>'everyday')),0) amount FROM activity a
 ), limits AS (SELECT payload FROM public.budget_limit_revisions WHERE period_id=p_period ORDER BY version DESC LIMIT 1),
 partitioned AS (
 SELECT x value,coalesce((SELECT sum(r.amount) FROM residual r WHERE r.source_type='expense' AND r.category_id=x->>'category_id' AND
 (x->>'subcategory_id' IS NULL OR r.subcategory_id=x->>'subcategory_id') AND (x->>'custom_subcategory_id' IS NULL OR r.custom_subcategory_id=(x->>'custom_subcategory_id')::uuid)),0) usage
 FROM limits,jsonb_array_elements(payload) x
 ) SELECT jsonb_build_object(
 'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('line_id',f.id,'name',coalesce(f.config->>'name',f.name),'kind',f.kind,'config',f.config,'item_revision',f.item_revision,
 'opening_cents',f.opening_cents,'opening_date',f.opening_date,'planned_cents',f.planned_cents,
 'reallocated_cents',f.reallocated,
 'remaining_cents',CASE WHEN f.kind='reserve' THEN f.opening_cents+f.allocated_to_date+f.reallocated-f.lifetime_used WHEN f.kind='everyday' THEN f.planned_cents+f.reallocated-coalesce((SELECT sum(amount) FROM residual WHERE source_type='expense'),0)+coalesce((SELECT sum(x.amount_cents) FROM claims x WHERE x.valid AND x.line_id=f.id AND x.purpose='refund' AND x.source_date>=period.start_date AND x.source_date<period.end_date),0) ELSE f.planned_cents+f.reallocated-f.period_used END,
 'used_cents',CASE WHEN f.kind='everyday' THEN coalesce((SELECT sum(amount) FROM residual WHERE source_type='expense'),0)-coalesce((SELECT sum(x.amount_cents) FROM claims x WHERE x.valid AND x.line_id=f.id AND x.purpose='refund' AND x.source_date>=period.start_date AND x.source_date<period.end_date),0) ELSE f.period_used END,
 'reserve_cents',CASE WHEN f.kind='reserve' THEN f.opening_cents+f.allocated_to_date+f.reallocated-f.lifetime_used ELSE NULL END,
 'net_purchases_cents',coalesce((SELECT sum(CASE WHEN x.purpose='refund' THEN -x.amount_cents ELSE x.amount_cents END) FROM claims x WHERE x.valid AND x.line_id=f.id AND (x.purpose='purchase' OR (x.purpose='refund' AND EXISTS(SELECT 1 FROM claims p WHERE p.id=x.related_claim_id AND p.purpose='purchase'))) AND x.source_date<period.end_date),0),
 'bank_confirmed_cents',f.bank_confirmed,'user_confirmed_cents',f.user_confirmed,
 'changed_claims',(SELECT count(*) FROM claims x WHERE NOT x.valid AND x.line_id=f.id),
 'occurrences',CASE WHEN f.config->>'type'='bill' AND f.config->>'state'='saving' THEN
 (SELECT coalesce(jsonb_agg(jsonb_build_object('date',d,'expected_cents',(f.config->>'amount_cents')::bigint,'matched_cents',coalesce((SELECT sum(x.amount_cents) FROM claims x JOIN public.budget_source_claims raw ON raw.id=x.id WHERE x.valid AND x.line_id=f.id AND x.purpose='expense' AND x.occurrence_date=d AND raw.occurrence_revision_id=(f.config->>'schedule_id')::uuid),0))),'[]') FROM public.budget_occurrence_dates((f.config->>'anchor')::date,f.config->>'cadence',period.start_date,period.end_date) d) ELSE '[]'::jsonb END)),'[]') FROM facts f),
 'limits',(SELECT coalesce(jsonb_agg(value||jsonb_build_object('used_cents',usage,'remaining_cents',(value->>'amount_cents')::bigint-usage)),'[]') FROM partitioned),
 'other_flexible_cents',(SELECT a.amount_cents FROM public.budget_allocations a JOIN public.budget_lines l ON l.id=a.line_id WHERE a.revision_id=period.current_revision_id AND l.kind='everyday')+coalesce((SELECT reallocated FROM facts WHERE kind='everyday'),0)-coalesce((SELECT sum((value->>'amount_cents')::bigint) FROM partitioned),0),
 'other_flexible_used_cents',coalesce((SELECT sum(amount) FROM residual WHERE source_type='expense'),0)-coalesce((SELECT sum(usage) FROM partitioned),0)-coalesce((SELECT sum(x.amount_cents) FROM claims x JOIN public.budget_lines l ON l.id=x.line_id WHERE x.valid AND l.kind='everyday' AND x.purpose='refund' AND x.source_date>=period.start_date AND x.source_date<period.end_date),0),
 'excluded_cents',coalesce((SELECT sum(x.amount_cents) FROM claims x WHERE x.valid AND x.purpose='exclude' AND x.source_date>=period.start_date AND x.source_date<period.end_date),0),
 'unassigned_credit_cents',coalesce((SELECT sum(amount) FROM residual WHERE source_type='refund'),0),
 'claims',(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM claims c),
 'recurring',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'account_id',r.account_id,'merchant_key',r.merchant_key,'state',r.state,'cadence',r.cadence_override,'amount_cents',r.expected_amount_override,'next_date',r.next_expected_override)),'[]') FROM public.recurring_series_overrides r WHERE tenant_id=p_tenant),
 'taxonomy',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',display_name) ORDER BY sort_order) FROM public.taxonomy_categories WHERE active AND classification='expense'),
 'taxonomy_scopes',(SELECT coalesce(jsonb_agg(x),'[]') FROM (
  SELECT jsonb_build_object('key','global:'||id,'name',display_name,'category_id',category_id,'subcategory_id',id,'custom_subcategory_id',NULL) x FROM public.taxonomy_subcategories WHERE active
  UNION ALL SELECT jsonb_build_object('key','custom:'||id,'name',display_name,'category_id',category_id,'subcategory_id',NULL,'custom_subcategory_id',id) FROM public.tenant_subcategories WHERE tenant_id=p_tenant AND active
 ) s),
 'planning_goals',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') FROM public.planning_goals WHERE tenant_id=p_tenant AND status<>'archived'),
 'undo_operation_id',CASE WHEN EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor AND role='owner') THEN
 (SELECT o.id FROM public.budget_operations o WHERE o.tenant_id=p_tenant AND o.after_state->>'plan_id'=p_plan::text AND o.after_state->>'plan_version'=plan.version::text AND o.outcome->>'source_revision'=v::text AND o.action<>'undo' AND NOT EXISTS(SELECT 1 FROM public.budget_operations u WHERE u.undo_of=o.id) LIMIT 1) ELSE NULL END,
 'source_revision',v::text,'plan_version',plan.version::text) INTO answer;
 -- JSON numbers must never cross the exact-cent boundary (including derived reserve totals).
 IF EXISTS(SELECT 1 FROM jsonb_path_query(answer,'$.** ? (@.type() == "number")') n WHERE abs(n::text::numeric)>9007199254740991) THEN RAISE EXCEPTION 'budget_overflow';END IF;
 RETURN answer;
END $$;

ALTER FUNCTION public.budget_command(uuid,uuid,uuid,jsonb,boolean) RENAME TO budget_command_m4;
CREATE FUNCTION public.budget_command(p_tenant uuid,p_actor uuid,p_request uuid,p_input jsonb,p_enabled boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE v bigint;hash text;prior public.budget_operations%ROWTYPE;original public.budget_operations%ROWTYPE;
 plan public.budget_plans%ROWTYPE;period public.budget_periods%ROWTYPE;review public.budget_period_reviews%ROWTYPE;
 template public.budget_revisions%ROWTYPE;lifecycle jsonb;payload jsonb;before_data jsonb;after_data jsonb;receipt jsonb;limits jsonb;
 action text:=p_input->>'action';new_v bigint;op uuid:=gen_random_uuid();pid uuid;rid uuid;mode text;state text;
 accepted boolean;asof date;compensation uuid;pool bigint;total numeric;
BEGIN
 v:=public.budget_lock_source(p_tenant);PERFORM public.budget_assert_owner(p_tenant,p_actor);
 hash:=encode(extensions.digest(p_input::text,'sha256'),'hex');
 SELECT * INTO prior FROM public.budget_operations WHERE tenant_id=p_tenant AND request_id=p_request;
 IF FOUND THEN IF prior.payload_hash<>hash THEN RAISE EXCEPTION 'budget_request_conflict';END IF;RETURN prior.outcome;END IF;
 IF action='undo' THEN SELECT * INTO original FROM public.budget_operations WHERE tenant_id=p_tenant AND id=(p_input->>'operation_id')::uuid;END IF;
 IF action NOT IN('save_review','reopen_review','open_next_period') AND NOT(action='undo' AND original.action IN('save_review','reopen_review')) THEN
  IF action='undo' AND original.action='open_next_period' THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
  IF action IN('move_allocation','release_reserve') AND p_enabled THEN
   lifecycle:=public.budget_lifecycle(p_tenant,p_actor,(p_input->>'plan_id')::uuid,(p_input->>'period_id')::uuid,(p_input->>'expected_source')::bigint,(p_input->>'expected_plan')::bigint);
   IF NOT (lifecycle->>'chain_valid')::boolean THEN RAISE EXCEPTION 'budget_account_unavailable';END IF;
   IF action='move_allocation' AND EXISTS(SELECT 1 FROM public.budget_lines l WHERE l.id=(p_input->>'from_line_id')::uuid AND l.tenant_id=p_tenant AND l.kind='everyday')
    AND public.budget_money(p_input->'amount_cents')>greatest(0,(lifecycle->'facts'->>'closing_everyday_cents')::numeric) THEN RAISE EXCEPTION 'budget_source_capacity';END IF;
  END IF;
  RETURN public.budget_command_m4(p_tenant,p_actor,p_request,p_input,p_enabled);
 END IF;
 IF p_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'budget_disabled';END IF;
 IF p_input->>'expected_method' IS DISTINCT FROM 'budget-foundation-v1' THEN RAISE EXCEPTION 'budget_stale_method';END IF;
 IF (p_input->>'expected_source')::bigint IS DISTINCT FROM v THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 SELECT b.* INTO plan FROM public.budget_plans b WHERE b.tenant_id=p_tenant AND b.id=CASE WHEN action='undo' THEN (original.after_state->>'plan_id')::uuid ELSE (p_input->>'plan_id')::uuid END AND b.state='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF action='undo' THEN
  IF plan.version IS DISTINCT FROM (original.after_state->>'plan_version')::bigint OR v IS DISTINCT FROM (original.outcome->>'source_revision')::bigint
   OR EXISTS(SELECT 1 FROM public.budget_operations WHERE undo_of=original.id) THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
 ELSE IF plan.version IS DISTINCT FROM (p_input->>'expected_plan')::bigint THEN RAISE EXCEPTION 'budget_stale_plan';END IF;END IF;
 SELECT * INTO period FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=plan.id AND id=CASE WHEN action='undo' THEN (original.after_state->>'period_id')::uuid ELSE (p_input->>'period_id')::uuid END;
 IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
 asof:=(now() AT TIME ZONE plan.timezone)::date;
 IF period.end_date>asof THEN RAISE EXCEPTION 'budget_invalid_unfinished_period';END IF;
 lifecycle:=public.budget_lifecycle(p_tenant,p_actor,plan.id,period.id,v,plan.version);
 IF NOT (lifecycle->>'chain_valid')::boolean THEN RAISE EXCEPTION 'budget_account_unavailable';END IF;
 new_v:=plan.version+1;pid:=period.id;
 SELECT * INTO review FROM public.budget_period_reviews WHERE period_id=period.id ORDER BY version DESC LIMIT 1;
 before_data:=jsonb_build_object('plan_id',plan.id,'period_id',period.id,'review',CASE WHEN review.id IS NULL THEN 'null'::jsonb ELSE to_jsonb(review) END);
 IF action='open_next_period' THEN
  IF NOT (lifecycle->>'is_latest')::boolean THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
  -- One contiguous saved period per explicit operation. No invented historical
  -- windows, repeating opening drawdown, mandatory review or hidden scheduler.
  pid:=gen_random_uuid();
  INSERT INTO public.budget_periods(id,tenant_id,plan_id,start_date,end_date,timezone,frequency)
  VALUES(pid,p_tenant,plan.id,period.end_date,CASE WHEN period.frequency='monthly' THEN (period.end_date+interval '1 month')::date ELSE period.end_date+14 END,period.timezone,period.frequency);
  IF jsonb_typeof(p_input->'accept_gap') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'budget_invalid_command';END IF;
  rid:=public.budget_write_revision(p_tenant,plan.id,pid,new_v,v,public.budget_money(p_input->'income_cents'),0,p_input->'lines',(p_input->>'accept_gap')::boolean);
  UPDATE public.budget_periods SET activated_revision_id=rid,current_revision_id=rid WHERE id=pid;
  SELECT r.payload INTO limits FROM public.budget_limit_revisions r WHERE r.period_id=period.id ORDER BY version DESC LIMIT 1;
  IF limits IS NOT NULL THEN
   SELECT coalesce(sum(public.budget_money(x->'amount_cents')),0) INTO total FROM jsonb_array_elements(limits) x;
   SELECT (x->>'amount_cents')::bigint INTO pool FROM jsonb_array_elements(p_input->'lines') x JOIN public.budget_lines l ON l.id=(x->>'line_id')::uuid WHERE l.kind='everyday';
   IF total>pool THEN RAISE EXCEPTION 'budget_invalid_limits';END IF;
   INSERT INTO public.budget_limit_revisions(tenant_id,plan_id,period_id,version,payload,actor_id) VALUES(p_tenant,plan.id,pid,new_v,limits,p_actor);
  END IF;
 ELSE
  IF action='save_review' THEN
   mode:=p_input->>'carry_mode';state:='reviewed';accepted:=(p_input->>'accept_incomplete')::boolean;
   IF mode NOT IN('fresh','carry') OR mode IS NULL OR jsonb_typeof(p_input->'accept_incomplete') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'budget_invalid_review';END IF;
   IF (NOT coalesce((lifecycle->'facts'->>'coverage_complete')::boolean,false) OR NOT EXISTS(SELECT 1 FROM public.budget_account_memberships m WHERE m.plan_id=plan.id AND m.role='activity' AND m.start_date<period.end_date AND (m.end_date IS NULL OR m.end_date>period.start_date))) AND NOT accepted THEN RAISE EXCEPTION 'budget_invalid_incomplete_review';END IF;
   payload:=lifecycle->'facts';
  ELSIF action='reopen_review' THEN
   IF review.id IS NULL OR review.state<>'reviewed' THEN RAISE EXCEPTION 'budget_invalid_review';END IF;
   mode:=review.carry_mode;state:='reopened';accepted:=review.accepted_incomplete;payload:=review.payload;
  ELSE
   compensation:=original.id;
   payload:=original.before_state->'review';
   mode:=coalesce(payload->>'carry_mode','fresh');state:=coalesce(payload->>'state','reopened');accepted:=coalesce((payload->>'accepted_incomplete')::boolean,false);
   payload:=CASE WHEN payload='null'::jsonb THEN lifecycle->'facts' ELSE payload->'payload' END;
  END IF;
  INSERT INTO public.budget_period_reviews(tenant_id,plan_id,period_id,version,state,carry_mode,payload,source_revision,accepted_incomplete,actor_id)
  VALUES(p_tenant,plan.id,pid,new_v,state,mode,payload,v,accepted,p_actor);
 END IF;
 UPDATE public.budget_plans SET version=new_v WHERE id=plan.id;
 -- Recompute through the newest saved period before commit. Earlier review
 -- choices must not commit a later overflow or unreadable carry chain.
 PERFORM public.budget_details(p_tenant,p_actor,plan.id,p.id,v,new_v) FROM public.budget_periods p WHERE p.plan_id=plan.id ORDER BY p.start_date DESC LIMIT 1;
 after_data:=jsonb_build_object('plan_id',plan.id,'period_id',pid,'plan_version',new_v::text);
 receipt:=jsonb_build_object('request_id',p_request,'operation_id',op,'status','committed','source_revision',v::text,'method','budget-foundation-v1','result',after_data);
 INSERT INTO public.budget_operations(id,tenant_id,actor_id,request_id,payload_hash,action,before_state,after_state,outcome,undo_of)
 VALUES(op,p_tenant,p_actor,p_request,hash,action,before_data,after_data,receipt,compensation);
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.budget_command(uuid,uuid,uuid,jsonb,boolean),public.budget_details_m4(uuid,uuid,uuid,uuid,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_command(uuid,uuid,uuid,jsonb,boolean),public.budget_details_m4(uuid,uuid,uuid,uuid,bigint,bigint) TO service_role;
DO $$ BEGIN
 IF has_function_privilege('authenticated','public.budget_command(uuid,uuid,uuid,jsonb,boolean)','EXECUTE') OR has_function_privilege('anon','public.budget_command(uuid,uuid,uuid,jsonb,boolean)','EXECUTE') THEN RAISE EXCEPTION 'Budget lifecycle grant leak';END IF;
END $$;
