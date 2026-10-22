-- M5: future-effective frequency intent. Events and reviewed templates are
-- append-only; applying creates a period, never rewrites a saved date window.
CREATE TABLE public.budget_frequency_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), change_id uuid NOT NULL,
 tenant_id uuid NOT NULL, plan_id uuid NOT NULL, period_id uuid NOT NULL,
 version bigint NOT NULL CHECK(version>0), state text NOT NULL CHECK(state IN('pending','cancelled','applied')),
 frequency text NOT NULL CHECK(frequency IN('monthly','fortnightly')),
 effective_date date NOT NULL, initial_end date NOT NULL, continuing_end date NOT NULL,
 initial_revision_id uuid NOT NULL, continuing_revision_id uuid NOT NULL,
 source_revision bigint NOT NULL CHECK(source_revision>=0), payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(effective_date<initial_end AND initial_end<continuing_end),
 CHECK(effective_date>='0001-01-01' AND continuing_end<='9999-12-31'),
 FOREIGN KEY(tenant_id,plan_id,period_id) REFERENCES public.budget_periods(tenant_id,plan_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,plan_id,initial_revision_id) REFERENCES public.budget_revisions(tenant_id,plan_id,id),
 FOREIGN KEY(tenant_id,plan_id,continuing_revision_id) REFERENCES public.budget_revisions(tenant_id,plan_id,id),
 UNIQUE(plan_id,version)
);
CREATE INDEX budget_frequency_latest ON public.budget_frequency_changes(plan_id,version DESC);
ALTER TABLE public.budget_frequency_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.budget_frequency_changes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.budget_frequency_changes TO authenticated;
GRANT SELECT,INSERT,DELETE ON public.budget_frequency_changes TO service_role;
CREATE POLICY budget_member_read ON public.budget_frequency_changes FOR SELECT TO authenticated USING(public.is_tenant_member(tenant_id));
CREATE TRIGGER budget_history_immutable BEFORE UPDATE ON public.budget_frequency_changes FOR EACH ROW EXECUTE FUNCTION public.budget_immutable_history();

ALTER FUNCTION public.budget_details(uuid,uuid,uuid,uuid,bigint,bigint) RENAME TO budget_details_lifecycle;
CREATE FUNCTION public.budget_details(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE answer jsonb;change public.budget_frequency_changes%ROWTYPE;BEGIN
 answer:=public.budget_details_lifecycle(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 SELECT * INTO change FROM public.budget_frequency_changes WHERE tenant_id=p_tenant AND plan_id=p_plan ORDER BY version DESC LIMIT 1;
 answer:=answer||jsonb_build_object('frequency_change',CASE WHEN change.id IS NULL THEN NULL ELSE
  to_jsonb(change)||jsonb_build_object('version',change.version::text,'source_revision',change.source_revision::text,
   'needs_review',change.state='pending' AND (change.version<>p_version OR change.source_revision<>p_source)) END);
 IF change.state='applied' AND EXISTS(SELECT 1 FROM public.budget_operations WHERE id=(answer->>'undo_operation_id')::uuid AND action='apply_frequency') THEN
  answer:=answer||jsonb_build_object('undo_operation_id',NULL);
 END IF;
 RETURN answer;
END $$;

ALTER FUNCTION public.budget_command(uuid,uuid,uuid,jsonb,boolean) RENAME TO budget_command_lifecycle;
CREATE FUNCTION public.budget_command(p_tenant uuid,p_actor uuid,p_request uuid,p_input jsonb,p_enabled boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE source bigint;hash text;prior public.budget_operations%ROWTYPE;original public.budget_operations%ROWTYPE;
 plan public.budget_plans%ROWTYPE;period public.budget_periods%ROWTYPE;change public.budget_frequency_changes%ROWTYPE;restore public.budget_frequency_changes%ROWTYPE;
 action text:=p_input->>'action';new_v bigint;op uuid:=gen_random_uuid();pid uuid;rid uuid;tid uuid;cid uuid;initial_end date;full_end date;asof date;
 frequency text;limits jsonb;basis jsonb;before_data jsonb;after_data jsonb;receipt jsonb;compensation uuid;total numeric;pool bigint;initial uuid;continuing uuid;
BEGIN
 source:=public.budget_lock_source(p_tenant);PERFORM public.budget_assert_owner(p_tenant,p_actor);
 hash:=encode(extensions.digest(p_input::text,'sha256'),'hex');
 SELECT * INTO prior FROM public.budget_operations WHERE tenant_id=p_tenant AND request_id=p_request;
 IF FOUND THEN IF prior.payload_hash<>hash THEN RAISE EXCEPTION 'budget_request_conflict';END IF;RETURN prior.outcome;END IF;
 IF action='undo' THEN SELECT * INTO original FROM public.budget_operations WHERE tenant_id=p_tenant AND id=(p_input->>'operation_id')::uuid;END IF;
 IF action NOT IN('schedule_frequency','cancel_frequency','apply_frequency') AND NOT(action='undo' AND original.action IN('schedule_frequency','cancel_frequency')) THEN
  IF p_enabled AND action='undo' AND original.action='apply_frequency' THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
  -- UI read-only is not an authorization boundary. Once a later period exists,
  -- earlier financial plans/assignments cannot be silently rewritten by an RPC.
  -- Reviews remain explicitly editable and source corrections live in Ledger.
  IF p_enabled AND action IN('revise','save_item','claim_source','confirm_funding','reverse_claim','set_limits','move_allocation','release_reserve') THEN
   IF EXISTS(SELECT 1 FROM public.budget_periods p JOIN public.budget_periods n ON n.plan_id=p.plan_id AND n.start_date>p.start_date
    WHERE p.tenant_id=p_tenant AND p.plan_id=(p_input->>'plan_id')::uuid AND p.id=(p_input->>'period_id')::uuid) THEN RAISE EXCEPTION 'budget_historical_readonly';END IF;
  END IF;
  IF p_enabled AND action='open_next_period' AND EXISTS(SELECT 1 FROM (
    SELECT state FROM public.budget_frequency_changes WHERE tenant_id=p_tenant AND plan_id=(p_input->>'plan_id')::uuid ORDER BY version DESC LIMIT 1
   ) c WHERE state='pending') THEN RAISE EXCEPTION 'budget_frequency_pending';END IF;
  RETURN public.budget_command_lifecycle(p_tenant,p_actor,p_request,p_input,p_enabled);
 END IF;
 IF p_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'budget_disabled';END IF;
 IF p_input->>'expected_method' IS DISTINCT FROM 'budget-foundation-v1' THEN RAISE EXCEPTION 'budget_stale_method';END IF;
 IF (p_input->>'expected_source')::bigint IS DISTINCT FROM source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=CASE WHEN action='undo' THEN (original.after_state->>'plan_id')::uuid ELSE (p_input->>'plan_id')::uuid END AND state='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF action='undo' THEN
  IF plan.version IS DISTINCT FROM (original.after_state->>'plan_version')::bigint OR source IS DISTINCT FROM (original.outcome->>'source_revision')::bigint
   OR EXISTS(SELECT 1 FROM public.budget_operations WHERE undo_of=original.id) THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
 ELSE IF plan.version IS DISTINCT FROM (p_input->>'expected_plan')::bigint THEN RAISE EXCEPTION 'budget_stale_plan';END IF;END IF;
 SELECT * INTO period FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=plan.id AND id=CASE WHEN action='undo' THEN (original.after_state->>'period_id')::uuid ELSE (p_input->>'period_id')::uuid END;
 IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
 SELECT * INTO change FROM public.budget_frequency_changes WHERE tenant_id=p_tenant AND plan_id=plan.id ORDER BY version DESC LIMIT 1;
 new_v:=plan.version+1;pid:=period.id;asof:=(now() AT TIME ZONE plan.timezone)::date;
 before_data:=jsonb_build_object('plan_id',plan.id,'period_id',period.id,'frequency_event_id',change.id);
 IF action='schedule_frequency' THEN
  IF change.state='pending' THEN RAISE EXCEPTION 'budget_frequency_pending';END IF;
  IF period.end_date<=asof OR EXISTS(SELECT 1 FROM public.budget_periods WHERE plan_id=plan.id AND start_date>period.start_date) THEN RAISE EXCEPTION 'budget_invalid_frequency_boundary';END IF;
  frequency:=p_input->>'frequency';
  IF frequency NOT IN('monthly','fortnightly') OR frequency IS NULL OR frequency=period.frequency THEN RAISE EXCEPTION 'budget_invalid_frequency';END IF;
  initial_end:=CASE WHEN frequency='monthly' THEN (date_trunc('month',period.end_date)+interval '1 month')::date ELSE period.end_date+14 END;
  full_end:=CASE WHEN frequency='monthly' THEN (initial_end+interval '1 month')::date ELSE initial_end+14 END;
  basis:=public.budget_details(p_tenant,p_actor,plan.id,period.id,source,plan.version);
  IF NOT (basis->'lifecycle'->>'chain_valid')::boolean THEN RAISE EXCEPTION 'budget_account_unavailable';END IF;
  IF jsonb_typeof(p_input->'accept_incomplete') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_input->'keep_limits') IS DISTINCT FROM 'boolean' OR NOT (p_input->>'keep_limits')::boolean THEN RAISE EXCEPTION 'budget_invalid_command';END IF;
  IF NOT (basis->'lifecycle'->'facts'->>'coverage_complete')::boolean AND NOT (p_input->>'accept_incomplete')::boolean THEN RAISE EXCEPTION 'budget_invalid_incomplete_review';END IF;
  IF jsonb_typeof(p_input->'initial'->'accept_gap') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_input->'continuing'->'accept_gap') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'budget_invalid_command';END IF;
  initial:=public.budget_write_revision(p_tenant,plan.id,NULL,new_v,source,public.budget_money(p_input->'initial'->'income_cents'),0,p_input->'initial'->'lines',(p_input->'initial'->>'accept_gap')::boolean);
  continuing:=public.budget_write_revision(p_tenant,plan.id,NULL,new_v,source,public.budget_money(p_input->'continuing'->'income_cents'),0,p_input->'continuing'->'lines',(p_input->'continuing'->>'accept_gap')::boolean);
  SELECT coalesce(r.payload,'[]') INTO limits FROM public.budget_limit_revisions r WHERE period_id=period.id ORDER BY version DESC LIMIT 1;limits:=coalesce(limits,'[]');
  SELECT coalesce(sum(public.budget_money(x->'amount_cents')),0) INTO total FROM jsonb_array_elements(limits) x;
  SELECT min(a.amount_cents) INTO pool FROM public.budget_allocations a JOIN public.budget_lines l ON l.id=a.line_id WHERE a.revision_id IN(initial,continuing) AND l.kind='everyday';
  IF total>pool THEN RAISE EXCEPTION 'budget_invalid_limits';END IF;
  cid:=gen_random_uuid();
  INSERT INTO public.budget_frequency_changes(change_id,tenant_id,plan_id,period_id,version,state,frequency,effective_date,initial_end,continuing_end,initial_revision_id,continuing_revision_id,source_revision,payload,actor_id)
  VALUES(cid,p_tenant,plan.id,period.id,new_v,'pending',frequency,period.end_date,initial_end,full_end,initial,continuing,source,
   jsonb_build_object('initial',p_input->'initial','continuing',p_input->'continuing','limits',limits,'accepted_incomplete',p_input->'accept_incomplete','reviewed_facts',basis->'lifecycle'->'facts'),p_actor);
 ELSE
  IF action='undo' THEN
   compensation:=original.id;
   IF original.action='cancel_frequency' THEN
    SELECT * INTO restore FROM public.budget_frequency_changes WHERE id=(original.before_state->>'frequency_event_id')::uuid AND tenant_id=p_tenant;
    IF restore.id IS NULL OR restore.state<>'pending' OR restore.effective_date<=asof OR restore.source_revision<>source
     OR restore.version<>(original.after_state->>'plan_version')::bigint-1 THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
    change:=restore;
   END IF;
  END IF;
  IF change.id IS NULL OR change.state<>'pending' THEN RAISE EXCEPTION 'budget_frequency_not_pending';END IF;
  IF action='apply_frequency' THEN
   IF change.period_id<>period.id OR period.end_date>asof THEN RAISE EXCEPTION 'budget_invalid_frequency_boundary';END IF;
   IF change.version<>plan.version OR change.source_revision<>source THEN RAISE EXCEPTION 'budget_frequency_needs_review';END IF;
   IF EXISTS(SELECT 1 FROM public.budget_periods WHERE plan_id=plan.id AND start_date>=change.effective_date) THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
   pid:=gen_random_uuid();
   INSERT INTO public.budget_periods(id,tenant_id,plan_id,start_date,end_date,timezone,frequency,transition)
   VALUES(pid,p_tenant,plan.id,change.effective_date,change.initial_end,period.timezone,change.frequency,change.frequency='monthly' AND extract(day FROM change.effective_date)>1);
   rid:=public.budget_write_revision(p_tenant,plan.id,pid,new_v,source,public.budget_money(change.payload->'initial'->'income_cents'),0,change.payload->'initial'->'lines',(change.payload->'initial'->>'accept_gap')::boolean);
   UPDATE public.budget_periods SET activated_revision_id=rid,current_revision_id=rid WHERE id=pid;
   tid:=public.budget_write_revision(p_tenant,plan.id,NULL,new_v,source,public.budget_money(change.payload->'continuing'->'income_cents'),0,change.payload->'continuing'->'lines',(change.payload->'continuing'->>'accept_gap')::boolean);
   INSERT INTO public.budget_limit_revisions(tenant_id,plan_id,period_id,version,payload,actor_id) VALUES(p_tenant,plan.id,pid,new_v,change.payload->'limits',p_actor);
   UPDATE public.budget_plans SET frequency=change.frequency,anchor=change.effective_date,template_revision_id=tid WHERE id=plan.id;
  END IF;
  INSERT INTO public.budget_frequency_changes(change_id,tenant_id,plan_id,period_id,version,state,frequency,effective_date,initial_end,continuing_end,initial_revision_id,continuing_revision_id,source_revision,payload,actor_id)
  VALUES(change.change_id,p_tenant,plan.id,change.period_id,new_v,CASE WHEN action='apply_frequency' THEN 'applied' WHEN action='undo' AND original.action='cancel_frequency' THEN 'pending' ELSE 'cancelled' END,
   change.frequency,change.effective_date,change.initial_end,change.continuing_end,change.initial_revision_id,change.continuing_revision_id,source,change.payload,p_actor);
 END IF;
 UPDATE public.budget_plans SET version=new_v WHERE id=plan.id;
 PERFORM public.budget_details(p_tenant,p_actor,plan.id,pid,source,new_v);
 after_data:=jsonb_build_object('plan_id',plan.id,'period_id',pid,'plan_version',new_v::text);
 receipt:=jsonb_build_object('request_id',p_request,'operation_id',op,'status','committed','source_revision',source::text,'method','budget-foundation-v1','result',after_data);
 INSERT INTO public.budget_operations(id,tenant_id,actor_id,request_id,payload_hash,action,before_state,after_state,outcome,undo_of)
 VALUES(op,p_tenant,p_actor,p_request,hash,action,before_data,after_data,receipt,compensation);
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.budget_command(uuid,uuid,uuid,jsonb,boolean),public.budget_details(uuid,uuid,uuid,uuid,bigint,bigint),public.budget_details_lifecycle(uuid,uuid,uuid,uuid,bigint,bigint),public.budget_command_lifecycle(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_command(uuid,uuid,uuid,jsonb,boolean),public.budget_details(uuid,uuid,uuid,uuid,bigint,bigint),public.budget_details_lifecycle(uuid,uuid,uuid,uuid,bigint,bigint),public.budget_command_lifecycle(uuid,uuid,uuid,jsonb,boolean) TO service_role;
DO $$ BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.budget_frequency_changes'::regclass)
  OR has_table_privilege('anon','public.budget_frequency_changes','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  OR has_table_privilege('authenticated','public.budget_frequency_changes','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  OR has_function_privilege('authenticated','public.budget_command(uuid,uuid,uuid,jsonb,boolean)','EXECUTE')
  OR has_function_privilege('anon','public.budget_details(uuid,uuid,uuid,uuid,bigint,bigint)','EXECUTE') THEN RAISE EXCEPTION 'Budget frequency grant leak';END IF;
END $$;
