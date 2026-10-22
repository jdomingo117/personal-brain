CREATE OR REPLACE FUNCTION public.budget_command_rollover(p_tenant uuid,p_actor uuid,p_request uuid,p_input jsonb,p_enabled boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE source bigint;hash text;prior public.budget_operations%ROWTYPE;original public.budget_operations%ROWTYPE;plan public.budget_plans%ROWTYPE;preview jsonb;timeline jsonb;before_timeline jsonb;pid uuid;new_v bigint;op uuid:=gen_random_uuid();after_data jsonb;receipt jsonb;compensation uuid;current_limits jsonb;BEGIN
 source:=public.budget_lock_source(p_tenant);PERFORM public.budget_assert_owner(p_tenant,p_actor);
 hash:=encode(extensions.digest(p_input::text,'sha256'),'hex');SELECT * INTO prior FROM public.budget_operations WHERE tenant_id=p_tenant AND request_id=p_request;
 IF FOUND THEN IF prior.payload_hash<>hash THEN RAISE EXCEPTION 'budget_request_conflict';END IF;RETURN prior.outcome;END IF;
 IF p_input->>'action'='undo' THEN SELECT * INTO original FROM public.budget_operations WHERE tenant_id=p_tenant AND id=(p_input->>'operation_id')::uuid;END IF;
 IF p_input->>'action'<>'set_rollover' AND NOT(p_input->>'action'='undo' AND original.action='set_rollover') THEN
  -- Prevent legacy removal/remapping and review carry from bypassing the dated
  -- policy. Amount-only current-period edits remain possible before its start.
  IF p_enabled AND p_input->>'action' IN('set_limits','save_review') AND EXISTS(SELECT 1 FROM public.budget_rollover_policies e WHERE e.plan_id=(p_input->>'plan_id')::uuid AND e.version=(SELECT max(v.version) FROM public.budget_rollover_policies v WHERE v.plan_id=e.plan_id) AND jsonb_array_length(e.timeline)>0) THEN
   IF p_input->>'action'='save_review' AND p_input->>'carry_mode'<>'fresh' AND public.budget_rollover_at((p_input->>'plan_id')::uuid,(SELECT end_date FROM public.budget_periods WHERE id=(p_input->>'period_id')::uuid AND tenant_id=p_tenant)) IS NOT NULL THEN RAISE EXCEPTION 'budget_invalid_policy_review';END IF;
   IF p_input->>'action'='set_limits' THEN RAISE EXCEPTION 'budget_invalid_policy_limits';END IF;
  END IF;
  receipt:=public.budget_command_accounts(p_tenant,p_actor,p_request,p_input,p_enabled);
  -- A later allowance/frequency/item edit must not commit a future partition
  -- that exceeds its new-resource pool. Validate the complete next window too.
  -- Account save/Undo already validates this exact committed source/version,
  -- including the next dated partition, before appending its audit receipt.
  -- No financial input changes between that check and this wrapper.
  IF NOT (p_input->>'action'='set_account_scope' OR (p_input->>'action'='undo' AND original.action='set_account_scope')) AND EXISTS(SELECT 1 FROM public.budget_rollover_policies e WHERE e.plan_id=(receipt->'result'->>'plan_id')::uuid AND e.version=(SELECT max(v.version) FROM public.budget_rollover_policies v WHERE v.plan_id=e.plan_id) AND jsonb_array_length(e.timeline)>0) THEN
   PERFORM public.budget_scope_impact(p_tenant,p_actor,(receipt->'result'->>'plan_id')::uuid,source,(receipt->'result'->>'plan_version')::bigint);
  END IF;
  RETURN receipt;
 END IF;
 IF p_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'budget_disabled';END IF;
 IF p_input->>'expected_method' IS DISTINCT FROM 'budget-foundation-v1' THEN RAISE EXCEPTION 'budget_stale_method';END IF;
 IF (p_input->>'expected_source')::bigint IS DISTINCT FROM source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 IF p_input->>'action'='undo' THEN
  SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=(original.after_state->>'plan_id')::uuid AND state='active' FOR UPDATE;
  IF plan.id IS NULL OR plan.version IS DISTINCT FROM (original.after_state->>'plan_version')::bigint OR source IS DISTINCT FROM (original.outcome->>'source_revision')::bigint OR EXISTS(SELECT 1 FROM public.budget_operations WHERE undo_of=original.id) THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
  pid:=(original.after_state->>'period_id')::uuid;compensation:=original.id;timeline:=original.before_state->'timeline';preview:=original.before_state->'preview';
  preview:=(preview-'preview_hash')||jsonb_build_object('before',preview->'after','after',preview->'before');
 ELSE
  preview:=public.budget_preview_rollover(p_tenant,p_actor,p_input);
  IF p_input->>'preview_hash' IS DISTINCT FROM preview->>'preview_hash' THEN RAISE EXCEPTION 'budget_stale_preview';END IF;
  IF p_input->'accept_impact' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(p_input->'accept_incomplete') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'budget_invalid_scope_acceptance';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(preview->'after') x WHERE NOT (x->>'scope_valid')::boolean OR NOT (x->>'coverage_complete')::boolean) AND NOT (p_input->>'accept_incomplete')::boolean THEN RAISE EXCEPTION 'budget_invalid_incomplete_review';END IF;
  SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=(p_input->>'plan_id')::uuid FOR UPDATE;
  pid:=(p_input->>'period_id')::uuid;timeline:=preview->'timeline';
 END IF;
 SELECT coalesce(e.timeline,'[]') INTO before_timeline FROM public.budget_rollover_policies e WHERE plan_id=plan.id ORDER BY version DESC LIMIT 1;before_timeline:=coalesce(before_timeline,'[]');new_v:=plan.version+1;
 INSERT INTO public.budget_rollover_policies(tenant_id,plan_id,period_id,version,action,timeline,impact,source_revision,actor_id) VALUES(p_tenant,plan.id,pid,new_v,CASE WHEN compensation IS NULL THEN 'saved' ELSE 'undo' END,timeline,preview,source,p_actor);
 UPDATE public.budget_plans SET version=new_v WHERE id=plan.id;
 PERFORM public.budget_scope_impact(p_tenant,p_actor,plan.id,source,new_v);
 after_data:=jsonb_build_object('plan_id',plan.id,'period_id',pid,'plan_version',new_v::text);
 receipt:=jsonb_build_object('request_id',p_request,'operation_id',op,'status','committed','source_revision',source::text,'method','budget-foundation-v1','result',after_data);
 INSERT INTO public.budget_operations(id,tenant_id,actor_id,request_id,payload_hash,action,before_state,after_state,outcome,undo_of) VALUES(op,p_tenant,p_actor,p_request,hash,p_input->>'action',jsonb_build_object('timeline',before_timeline,'preview',preview),after_data,receipt,compensation);
 RETURN receipt;
END $$;

DO $$ BEGIN
 IF has_function_privilege('anon','public.budget_command_rollover(uuid,uuid,uuid,jsonb,boolean)','EXECUTE') OR has_function_privilege('authenticated','public.budget_command_rollover(uuid,uuid,uuid,jsonb,boolean)','EXECUTE') OR NOT has_function_privilege('service_role','public.budget_command_rollover(uuid,uuid,uuid,jsonb,boolean)','EXECUTE') THEN RAISE EXCEPTION 'Budget account validation grant leak';END IF;
END $$;
