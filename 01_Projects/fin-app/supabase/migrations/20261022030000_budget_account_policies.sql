-- Account memberships are a dated operational projection. Immutable policy
-- events/operations retain intent and compensation; source rows are never locked.
CREATE TABLE public.budget_account_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,plan_id uuid NOT NULL,period_id uuid NOT NULL,
 version bigint NOT NULL CHECK(version>0),action text NOT NULL CHECK(action IN('saved','undo')),
 effective_from date NOT NULL,effective_until date,CHECK(effective_until IS NULL OR effective_until>effective_from),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),impact jsonb NOT NULL,
 source_revision bigint NOT NULL CHECK(source_revision>=0),actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(plan_id,version),
 FOREIGN KEY(tenant_id,plan_id,period_id) REFERENCES public.budget_periods(tenant_id,plan_id,id) ON DELETE CASCADE
);
CREATE INDEX budget_account_policy_history ON public.budget_account_policies(plan_id,version DESC);
ALTER TABLE public.budget_account_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.budget_account_policies FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.budget_account_policies TO authenticated;
GRANT SELECT,INSERT,DELETE ON public.budget_account_policies TO service_role;
CREATE POLICY budget_member_read ON public.budget_account_policies FOR SELECT TO authenticated USING(public.is_tenant_member(tenant_id));
CREATE TRIGGER budget_history_immutable BEFORE UPDATE ON public.budget_account_policies FOR EACH ROW EXECUTE FUNCTION public.budget_immutable_history();
ALTER TABLE public.budget_account_memberships ADD CONSTRAINT budget_account_scope_no_overlap
 EXCLUDE USING gist(plan_id WITH =,original_account_id WITH =,role WITH =,daterange(start_date,end_date,'[)') WITH &&);

-- Shared hypothetical/commit projection, callable only by service-owned wrappers.
CREATE FUNCTION public.budget_replace_account_scope(p_tenant uuid,p_plan uuid,p_from date,p_until date,p_activity jsonb,p_destinations jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m public.budget_account_memberships%ROWTYPE;a jsonb;role_name text;BEGIN
 IF p_from IS NULL OR (p_until IS NOT NULL AND p_until<=p_from) THEN RAISE EXCEPTION 'budget_invalid_scope';END IF;
 FOREACH role_name IN ARRAY ARRAY['activity','destination'] LOOP
  a:=CASE WHEN role_name='activity' THEN p_activity ELSE p_destinations END;
  IF jsonb_typeof(a) IS DISTINCT FROM 'array' OR jsonb_array_length(a)>100
   OR (SELECT count(DISTINCT x::text) FROM jsonb_array_elements(a) x)<>jsonb_array_length(a) THEN RAISE EXCEPTION 'budget_invalid_scope';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(a) x WHERE NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=x::uuid AND tenant_id=p_tenant AND currency='AUD')) THEN RAISE EXCEPTION 'budget_account_unavailable';END IF;
 END LOOP;
 FOR m IN SELECT * FROM public.budget_account_memberships WHERE tenant_id=p_tenant AND plan_id=p_plan AND daterange(start_date,end_date,'[)')&&daterange(p_from,p_until,'[)') LOOP
  DELETE FROM public.budget_account_memberships WHERE id=m.id;
  IF m.start_date<p_from THEN INSERT INTO public.budget_account_memberships(tenant_id,plan_id,account_id,original_account_id,role,start_date,end_date)
   VALUES(p_tenant,p_plan,m.account_id,m.original_account_id,m.role,m.start_date,p_from);END IF;
  IF p_until IS NOT NULL AND (m.end_date IS NULL OR m.end_date>p_until) THEN INSERT INTO public.budget_account_memberships(tenant_id,plan_id,account_id,original_account_id,role,start_date,end_date)
   VALUES(p_tenant,p_plan,m.account_id,m.original_account_id,m.role,p_until,m.end_date);END IF;
 END LOOP;
 INSERT INTO public.budget_account_memberships(tenant_id,plan_id,account_id,original_account_id,role,start_date,end_date)
 SELECT p_tenant,p_plan,x::uuid,x::uuid,'activity',p_from,p_until FROM jsonb_array_elements_text(p_activity) x
 UNION ALL SELECT p_tenant,p_plan,x::uuid,x::uuid,'destination',p_from,p_until FROM jsonb_array_elements_text(p_destinations) x;
 -- Match the existing workspace's explicit scope-history bound. Never commit a
 -- timeline that its reader would truncate or be unable to load.
 IF (SELECT count(*) FROM public.budget_account_memberships WHERE plan_id=p_plan)>500 THEN RAISE EXCEPTION 'budget_invalid_scope_history_limit';END IF;
END $$;

CREATE FUNCTION public.budget_scope_facts(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint,p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d jsonb;l jsonb;BEGIN
 d:=public.budget_details(p_tenant,p_actor,p_plan,p_period,p_source,p_version);l:=d->'lifecycle';
 RETURN jsonb_build_object('key',p_key,'start_date',l->'facts'->'start_date','end_date',l->'facts'->'end_date',
 'actuals',l->'facts'->'actuals','scope_valid',l->'facts'->'scope_valid','coverage_complete',l->'facts'->'coverage_complete',
 'opening_carry_cents',l->'facts'->'opening_carry_cents','closing_everyday_cents',l->'facts'->'closing_everyday_cents',
 'provisional_carry',l->'provisional_carry','changed_since_review',l->'changed_since_review',
 'excluded_cents',d->'excluded_cents','unassigned_credit_cents',d->'unassigned_credit_cents','limits',d->'limits',
 'items',d->'items','claims',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x->'id','valid',x->'valid','amount_cents',x->'amount_cents','purpose',x->'purpose') ORDER BY x->>'id'),'[]') FROM jsonb_array_elements(d->'claims') x));
END $$;

-- Full saved history plus one clearly-labelled next-window preview. The next
-- period is created inside a rollback-only subtransaction, never on normal reads.
CREATE FUNCTION public.budget_scope_impact(p_tenant uuid,p_actor uuid,p_plan uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.budget_periods%ROWTYPE;t public.budget_revisions%ROWTYPE;outcomes jsonb:='[]';next_facts jsonb;pid uuid;rid uuid;lines jsonb;limits jsonb;BEGIN
 FOR p IN SELECT * FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=p_plan ORDER BY start_date LOOP
  outcomes:=outcomes||jsonb_build_array(public.budget_scope_facts(p_tenant,p_actor,p_plan,p.id,p_source,p_version,p.id::text));
 END LOOP;
 BEGIN
  SELECT * INTO p FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=p_plan ORDER BY start_date DESC LIMIT 1;
  SELECT r.* INTO t FROM public.budget_revisions r JOIN public.budget_plans b ON b.template_revision_id=r.id WHERE b.id=p_plan;
  pid:=gen_random_uuid();
  INSERT INTO public.budget_periods(id,tenant_id,plan_id,start_date,end_date,timezone,frequency)
  VALUES(pid,p_tenant,p_plan,p.end_date,CASE WHEN p.frequency='monthly' THEN (p.end_date+interval '1 month')::date ELSE p.end_date+14 END,p.timezone,p.frequency);
  SELECT jsonb_agg(jsonb_build_object('line_id',a.line_id,'amount_cents',a.amount_cents) ORDER BY a.line_id) INTO lines FROM public.budget_allocations a WHERE a.revision_id=t.id;
  rid:=public.budget_write_revision(p_tenant,p_plan,pid,p_version,p_source,t.income_cents,0,lines,true);
  UPDATE public.budget_periods SET activated_revision_id=rid,current_revision_id=rid WHERE id=pid;
  SELECT r.payload INTO limits FROM public.budget_limit_revisions r WHERE period_id=p.id ORDER BY version DESC LIMIT 1;
  IF limits IS NOT NULL THEN INSERT INTO public.budget_limit_revisions(tenant_id,plan_id,period_id,version,payload,actor_id) VALUES(p_tenant,p_plan,pid,p_version,limits,p_actor);END IF;
  next_facts:=public.budget_scope_facts(p_tenant,p_actor,p_plan,pid,p_source,p_version,'next');
  RAISE SQLSTATE 'P0004' USING MESSAGE='budget_preview_rollback';
 EXCEPTION WHEN assert_failure THEN IF SQLERRM<>'budget_preview_rollback' THEN RAISE;END IF;
 END;
 RETURN outcomes||jsonb_build_array(next_facts);
END $$;

CREATE FUNCTION public.budget_preview_account_scope(p_tenant uuid,p_actor uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE source bigint;plan public.budget_plans%ROWTYPE;period public.budget_periods%ROWTYPE;before_facts jsonb;after_facts jsonb;answer jsonb;from_on date;until_on date;BEGIN
 source:=public.budget_lock_source(p_tenant);PERFORM public.budget_assert_owner(p_tenant,p_actor);
 IF p_input->>'expected_method' IS DISTINCT FROM 'budget-foundation-v1' THEN RAISE EXCEPTION 'budget_stale_method';END IF;
 IF (p_input->>'expected_source')::bigint IS DISTINCT FROM source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=(p_input->>'plan_id')::uuid AND state='active';
 SELECT * INTO period FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=plan.id AND id=(p_input->>'period_id')::uuid;
 IF plan.id IS NULL OR period.id IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF plan.version IS DISTINCT FROM (p_input->>'expected_plan')::bigint THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
 IF period.end_date<=(now() AT TIME ZONE plan.timezone)::date OR EXISTS(SELECT 1 FROM public.budget_periods WHERE plan_id=plan.id AND start_date>period.start_date) THEN RAISE EXCEPTION 'budget_historical_readonly';END IF;
 IF EXISTS(SELECT 1 FROM (SELECT state FROM public.budget_frequency_changes WHERE plan_id=plan.id ORDER BY version DESC LIMIT 1) c WHERE state='pending') THEN RAISE EXCEPTION 'budget_frequency_pending';END IF;
 IF p_input->>'scope' NOT IN('period','period-and-future','future') OR p_input->>'scope' IS NULL THEN RAISE EXCEPTION 'budget_invalid_scope';END IF;
 from_on:=CASE WHEN p_input->>'scope'='future' THEN period.end_date ELSE period.start_date END;
 until_on:=CASE WHEN p_input->>'scope'='period' THEN period.end_date ELSE NULL END;
 before_facts:=public.budget_scope_impact(p_tenant,p_actor,plan.id,source,plan.version);
 BEGIN
  PERFORM public.budget_replace_account_scope(p_tenant,plan.id,from_on,until_on,p_input->'activity_account_ids',p_input->'destination_account_ids');
  after_facts:=public.budget_scope_impact(p_tenant,p_actor,plan.id,source,plan.version);
  RAISE SQLSTATE 'P0004' USING MESSAGE='budget_preview_rollback';
 EXCEPTION WHEN assert_failure THEN IF SQLERRM<>'budget_preview_rollback' THEN RAISE;END IF;
 END;
 answer:=jsonb_build_object('effective_from',from_on,'effective_until',until_on,'source_revision',source::text,'plan_version',plan.version::text,'before',before_facts,'after',after_facts,
  'activity_account_ids',p_input->'activity_account_ids','destination_account_ids',p_input->'destination_account_ids','scope',p_input->'scope');
 RETURN answer||jsonb_build_object('preview_hash',encode(extensions.digest(answer::text,'sha256'),'hex'));
END $$;

ALTER FUNCTION public.budget_command(uuid,uuid,uuid,jsonb,boolean) RENAME TO budget_command_frequency;
CREATE FUNCTION public.budget_command(p_tenant uuid,p_actor uuid,p_request uuid,p_input jsonb,p_enabled boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE source bigint;hash text;prior public.budget_operations%ROWTYPE;original public.budget_operations%ROWTYPE;plan public.budget_plans%ROWTYPE;
 preview jsonb;memberships jsonb;period_id uuid;pid uuid;new_v bigint;op uuid:=gen_random_uuid();after_data jsonb;receipt jsonb;compensation uuid;BEGIN
 source:=public.budget_lock_source(p_tenant);PERFORM public.budget_assert_owner(p_tenant,p_actor);
 hash:=encode(extensions.digest(p_input::text,'sha256'),'hex');
 SELECT * INTO prior FROM public.budget_operations WHERE tenant_id=p_tenant AND request_id=p_request;
 IF FOUND THEN IF prior.payload_hash<>hash THEN RAISE EXCEPTION 'budget_request_conflict';END IF;RETURN prior.outcome;END IF;
 IF p_input->>'action'='undo' THEN SELECT * INTO original FROM public.budget_operations WHERE tenant_id=p_tenant AND id=(p_input->>'operation_id')::uuid;END IF;
 IF p_input->>'action'<>'set_account_scope' AND NOT(p_input->>'action'='undo' AND original.action='set_account_scope') THEN RETURN public.budget_command_frequency(p_tenant,p_actor,p_request,p_input,p_enabled);END IF;
 IF p_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'budget_disabled';END IF;
 IF p_input->>'expected_method' IS DISTINCT FROM 'budget-foundation-v1' THEN RAISE EXCEPTION 'budget_stale_method';END IF;
 IF (p_input->>'expected_source')::bigint IS DISTINCT FROM source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 IF p_input->>'action'='undo' THEN
  SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=(original.after_state->>'plan_id')::uuid AND state='active' FOR UPDATE;
  IF plan.id IS NULL OR plan.version IS DISTINCT FROM (original.after_state->>'plan_version')::bigint OR source IS DISTINCT FROM (original.outcome->>'source_revision')::bigint OR EXISTS(SELECT 1 FROM public.budget_operations WHERE undo_of=original.id) THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
  period_id:=(original.after_state->>'period_id')::uuid;compensation:=original.id;
  preview:=original.before_state->'preview';
  preview:=(preview-'preview_hash')||jsonb_build_object('before',preview->'after','after',preview->'before','source_revision',source::text,'plan_version',plan.version::text);
 ELSE
  preview:=public.budget_preview_account_scope(p_tenant,p_actor,p_input);
  IF p_input->>'preview_hash' IS DISTINCT FROM preview->>'preview_hash' THEN RAISE EXCEPTION 'budget_stale_preview';END IF;
  IF jsonb_typeof(p_input->'accept_impact') IS DISTINCT FROM 'boolean' OR NOT (p_input->>'accept_impact')::boolean THEN RAISE EXCEPTION 'budget_invalid_scope_acceptance';END IF;
  IF jsonb_typeof(p_input->'accept_incomplete') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'budget_invalid_scope_acceptance';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(preview->'after') x WHERE NOT (x->>'scope_valid')::boolean OR NOT (x->>'coverage_complete')::boolean) AND NOT (p_input->>'accept_incomplete')::boolean THEN RAISE EXCEPTION 'budget_invalid_incomplete_review';END IF;
  SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=(p_input->>'plan_id')::uuid FOR UPDATE;
  period_id:=(p_input->>'period_id')::uuid;
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]') INTO memberships FROM public.budget_account_memberships m WHERE m.plan_id=plan.id;
 new_v:=plan.version+1;
 IF compensation IS NULL THEN
  PERFORM public.budget_replace_account_scope(p_tenant,plan.id,(preview->>'effective_from')::date,(preview->>'effective_until')::date,p_input->'activity_account_ids',p_input->'destination_account_ids');
 ELSE
  DELETE FROM public.budget_account_memberships WHERE tenant_id=p_tenant AND plan_id=plan.id;
  INSERT INTO public.budget_account_memberships SELECT * FROM jsonb_populate_recordset(NULL::public.budget_account_memberships,original.before_state->'memberships');
 END IF;
 UPDATE public.budget_plans SET version=new_v WHERE id=plan.id;
 -- All saved history and the exact next window are checked before commit.
 PERFORM public.budget_scope_impact(p_tenant,p_actor,plan.id,source,new_v);
 INSERT INTO public.budget_account_policies(tenant_id,plan_id,period_id,version,action,effective_from,effective_until,payload,impact,source_revision,actor_id)
 VALUES(p_tenant,plan.id,period_id,new_v,CASE WHEN compensation IS NULL THEN 'saved' ELSE 'undo' END,(preview->>'effective_from')::date,(preview->>'effective_until')::date,p_input-'preview_hash',preview,source,p_actor) RETURNING id INTO pid;
 after_data:=jsonb_build_object('plan_id',plan.id,'period_id',period_id,'plan_version',new_v::text,'policy_id',pid);
 receipt:=jsonb_build_object('request_id',p_request,'operation_id',op,'status','committed','source_revision',source::text,'method','budget-foundation-v1','result',after_data);
 INSERT INTO public.budget_operations(id,tenant_id,actor_id,request_id,payload_hash,action,before_state,after_state,outcome,undo_of)
 VALUES(op,p_tenant,p_actor,p_request,hash,p_input->>'action',jsonb_build_object('memberships',memberships,'preview',preview),after_data,receipt,compensation);
 RETURN receipt;
END $$;

ALTER FUNCTION public.budget_details(uuid,uuid,uuid,uuid,bigint,bigint) RENAME TO budget_details_frequency;
CREATE FUNCTION public.budget_details(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE answer jsonb;policy jsonb;BEGIN
 answer:=public.budget_details_frequency(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 SELECT jsonb_build_object('id',id,'version',version::text,'action',action,'effective_from',effective_from,'effective_until',effective_until)
 INTO policy FROM public.budget_account_policies WHERE tenant_id=p_tenant AND plan_id=p_plan ORDER BY version DESC LIMIT 1;
 RETURN answer||jsonb_build_object('account_policy',policy);
END $$;
REVOKE ALL ON FUNCTION public.budget_replace_account_scope(uuid,uuid,date,date,jsonb,jsonb),public.budget_scope_facts(uuid,uuid,uuid,uuid,bigint,bigint,text),public.budget_scope_impact(uuid,uuid,uuid,bigint,bigint),public.budget_preview_account_scope(uuid,uuid,jsonb),public.budget_command(uuid,uuid,uuid,jsonb,boolean),public.budget_command_frequency(uuid,uuid,uuid,jsonb,boolean),public.budget_details(uuid,uuid,uuid,uuid,bigint,bigint),public.budget_details_frequency(uuid,uuid,uuid,uuid,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_replace_account_scope(uuid,uuid,date,date,jsonb,jsonb),public.budget_scope_facts(uuid,uuid,uuid,uuid,bigint,bigint,text),public.budget_scope_impact(uuid,uuid,uuid,bigint,bigint),public.budget_preview_account_scope(uuid,uuid,jsonb),public.budget_command(uuid,uuid,uuid,jsonb,boolean),public.budget_command_frequency(uuid,uuid,uuid,jsonb,boolean),public.budget_details(uuid,uuid,uuid,uuid,bigint,bigint),public.budget_details_frequency(uuid,uuid,uuid,uuid,bigint,bigint) TO service_role;
DO $$ BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.budget_account_policies'::regclass)
 OR has_table_privilege('anon','public.budget_account_policies','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 OR has_table_privilege('authenticated','public.budget_account_policies','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 OR has_function_privilege('authenticated','public.budget_preview_account_scope(uuid,uuid,jsonb)','EXECUTE')
 OR has_function_privilege('anon','public.budget_command(uuid,uuid,uuid,jsonb,boolean)','EXECUTE') THEN RAISE EXCEPTION 'Budget account policy grant leak';END IF;
END $$;
