-- Presentation preferences never change financial plan versions or signed money.
CREATE TABLE public.budget_attention_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,plan_id uuid NOT NULL,period_id uuid NOT NULL,
 version bigint NOT NULL CHECK(version>0),issue_key text NOT NULL CHECK(length(issue_key) BETWEEN 1 AND 160),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),source_revision bigint NOT NULL,
 operation_id uuid NOT NULL,actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(plan_id,version),
 FOREIGN KEY(tenant_id,plan_id,period_id) REFERENCES public.budget_periods(tenant_id,plan_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,operation_id) REFERENCES public.budget_operations(tenant_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX budget_attention_latest ON public.budget_attention_events(plan_id,period_id,issue_key,version DESC);
ALTER TABLE public.budget_attention_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.budget_attention_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.budget_attention_events TO authenticated;
GRANT SELECT,INSERT,DELETE ON public.budget_attention_events TO service_role;
CREATE POLICY budget_member_read ON public.budget_attention_events FOR SELECT TO authenticated USING(public.is_tenant_member(tenant_id));
CREATE TRIGGER budget_history_immutable BEFORE UPDATE ON public.budget_attention_events FOR EACH ROW EXECUTE FUNCTION public.budget_immutable_history();

CREATE FUNCTION public.budget_attention_issue(p_key text,p_kind text,p_label text,p_gap numeric,p_available numeric,p_due date,p_priority integer,p_basis jsonb,p_evidence jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('key',p_key,'kind',p_kind,'label',p_label,'gap_cents',p_gap,'available_cents',p_available,'due_date',p_due,'priority',p_priority,
 'threshold_cents',greatest(2500,ceil(greatest(coalesce(p_available,0),0)/20)),'basis',p_basis,'evidence',p_evidence)
$$;

-- Derive only checks backed by implemented facts. No invented pay dates or
-- flexible-spend forecasts. Complete source aggregates stay inside PostgreSQL.
CREATE FUNCTION public.budget_attention_facts(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint,p_details jsonb,p_internal boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE d jsonb:=p_details;p public.budget_periods%ROWTYPE;s jsonb;issues jsonb:='[]';result jsonb:='[]';i jsonb;c jsonb;it jsonb;lim jsonb;occ jsonb;old jsonb;event public.budget_attention_events%ROWTYPE;
 maps jsonb;claims_basis jsonb;basis jsonb;scope_basis jsonb;asof date;gap numeric;available numeric;due date;remaining numeric;future numeric;days integer;key text;reopened boolean;why text;state text;hash text;attention_v bigint;last_op uuid;
BEGIN
 SELECT * INTO p FROM public.budget_periods WHERE id=p_period AND plan_id=p_plan AND tenant_id=p_tenant;
 IF p.id IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
 asof:=(now() AT TIME ZONE p.timezone)::date;
 s:=public.budget_query_m4(p_tenant,p_actor,jsonb_build_object('action','snapshot','plan_id',p_plan,'period_id',p_period));
 -- The validated details and snapshot are read under one tenant gate.
 scope_basis:=jsonb_build_object('valid',d->'lifecycle'->'facts'->'scope_valid','covered',d->'lifecycle'->'facts'->'coverage_complete',
 'scope',(SELECT coalesce(jsonb_agg(jsonb_build_object('account',original_account_id,'role',role,'from',start_date,'until',end_date) ORDER BY original_account_id,role,start_date),'[]') FROM public.budget_account_memberships WHERE plan_id=p_plan AND start_date<p.end_date AND (end_date IS NULL OR end_date>p.start_date)));
 WITH live AS MATERIALIZED(SELECT * FROM public.budget_live_claims(p_tenant,p_plan)),
 activity AS MATERIALIZED(SELECT * FROM public.budget_activity(p_tenant,p_plan,p.start_date,p.end_date)),
 used AS(SELECT source_key,sum(amount_cents::numeric) amount FROM live l WHERE valid AND purpose<>'funding' AND (purpose='exclude' OR EXISTS(SELECT 1 FROM public.budget_lines b WHERE b.id=l.line_id AND b.kind<>'everyday')) GROUP BY source_key),
 residual AS(SELECT a.* FROM activity a LEFT JOIN used u USING(source_key) WHERE a.source_type='expense' AND a.capacity>coalesce(u.amount,0)),
 partitioned AS(SELECT a.*,coalesce(l->>'id','other') bucket FROM residual a LEFT JOIN jsonb_array_elements(d->'limits') l ON l->>'category_id'=a.category_id AND (l->>'subcategory_id' IS NULL OR l->>'subcategory_id'=a.subcategory_id) AND (l->>'custom_subcategory_id' IS NULL OR (l->>'custom_subcategory_id')::uuid=a.custom_subcategory_id)),
 scoped AS(
 SELECT bucket,source_key,identity FROM partitioned UNION ALL SELECT 'parent',source_key,identity FROM residual UNION ALL SELECT 'uncategorized',source_key,identity FROM residual WHERE category_id IS NULL OR lower(category_id)='uncategorized'
 UNION ALL SELECT l.line_id::text,a.source_key,a.identity FROM activity a JOIN live l USING(source_key) WHERE l.valid AND l.purpose<>'funding'
 ), grouped AS(SELECT bucket,jsonb_object_agg(source_key,encode(extensions.digest((identity-'amount'-'merchant')::text,'sha256'),'hex')) evidence FROM scoped GROUP BY bucket)
 SELECT coalesce(jsonb_object_agg(bucket,evidence),'{}') INTO maps FROM grouped;
 SELECT coalesce(jsonb_object_agg(line_id::text,proof),'{}') INTO claims_basis FROM (
 SELECT line_id,encode(extensions.digest(jsonb_agg(jsonb_build_object('id',id,'valid',valid,'purpose',purpose) ORDER BY id)::text,'sha256'),'hex') proof FROM public.budget_live_claims(p_tenant,p_plan) WHERE line_id IS NOT NULL GROUP BY line_id) q;
 -- Resource gaps are distinct from spending gaps; never sum them into fake savings.
 gap:=greatest(0,-(s->>'unallocated_cents')::numeric);
 IF gap>0 THEN issues:=issues||jsonb_build_array(public.budget_attention_issue('funding:current','funding_gap','More planned than expected resources',gap,(s->'revision'->>'income_cents')::numeric+(s->'revision'->>'drawdown_cents')::numeric,NULL,1,'{}'));END IF;
 gap:=greatest(0,-(s->'future_template'->>'unallocated_cents')::numeric);
 IF gap>0 THEN issues:=issues||jsonb_build_array(public.budget_attention_issue('funding:future','future_funding_gap','Future allowances need more expected income',gap,(s->'future_template'->>'income_cents')::numeric,NULL,1,'{}'));END IF;
 IF (d->'lifecycle'->'facts'->>'scope_valid')::boolean THEN
  FOR it IN SELECT value FROM jsonb_array_elements(d->'items') LOOP
   c:=it->'config';key:=it->>'line_id';basis:=scope_basis||jsonb_build_object('claims',claims_basis->key,'kind',it->'kind','archived',coalesce(it->'archived','false'));
   remaining:=(it->>'remaining_cents')::numeric;available:=(it->>'planned_cents')::numeric+coalesce((it->>'opening_carry_cents')::numeric,0)+(it->>'reallocated_cents')::numeric;
   IF remaining<0 AND it->>'kind' IN('everyday','reserve','fixed') THEN
    issues:=issues||jsonb_build_array(public.budget_attention_issue('balance:'||key,CASE WHEN it->>'kind'='reserve' THEN 'reserve_shortfall' ELSE 'overspend' END,it->>'name',-remaining,available,NULL,2,basis,coalesce(maps->CASE WHEN it->>'kind'='everyday' THEN 'parent' ELSE key END,'{}'))||jsonb_build_object('line_id',key));
   END IF;
   IF c<>'null'::jsonb AND NOT coalesce((it->>'archived')::boolean,false) THEN
    IF c->>'type'='bill' THEN
     FOR occ IN SELECT value FROM jsonb_array_elements(it->'occurrences') LOOP
      gap:=greatest(0,(occ->>'expected_cents')::numeric-(occ->>'matched_cents')::numeric);due:=(occ->>'date')::date;
      IF gap>0 AND due<=least(asof+7,p.end_date-1) THEN issues:=issues||jsonb_build_array(public.budget_attention_issue('bill:'||key||':'||due,'bill_unmatched',it->>'name',gap,(occ->>'expected_cents')::numeric,due,1,basis,coalesce(maps->key,'{}'))||jsonb_build_object('line_id',key));END IF;
     END LOOP;
    ELSIF it->>'kind'='reserve' AND c->>'due_date' IS NOT NULL AND c->>'target_cents' IS NOT NULL AND c->>'state'<>'draft' THEN
     due:=(c->>'due_date')::date;future:=0;
     -- Current-window scheduled additions are already in the reserve. Count
     -- only dates after this saved window, never the same contribution twice.
     IF c->>'state'='saving' AND NOT coalesce((d->'controls'->>'paused')::boolean,false) AND due>=p.end_date THEN
      SELECT count(*)*(c->>'amount_cents')::numeric INTO future FROM public.budget_occurrence_dates((c->>'anchor')::date,c->>'cadence',p.end_date,due+1);
     END IF;
     IF abs(future)>9007199254740991 THEN RAISE EXCEPTION 'budget_overflow';END IF;
     gap:=greatest(0,(c->>'target_cents')::numeric-(it->>'reserve_cents')::numeric-(it->>'net_purchases_cents')::numeric-future);
     IF gap>0 THEN issues:=issues||jsonb_build_array(public.budget_attention_issue('target:'||key,'goal_due_shortfall',it->>'name',gap,(c->>'target_cents')::numeric,due,1,basis||jsonb_build_object('target',c->'target_cents','cadence',c->'cadence','anchor',c->'anchor','state',c->'state','paused',d->'controls'->'paused'),coalesce(maps->key,'{}'))||jsonb_build_object('line_id',key));END IF;
    END IF;
   END IF;
   IF (it->>'changed_claims')::numeric>0 THEN issues:=issues||jsonb_build_array(public.budget_attention_issue('claims:'||key,'changed_matches',it->>'name',NULL,NULL,NULL,4,basis)||jsonb_build_object('line_id',key,'count',(it->>'changed_claims')::numeric));END IF;
  END LOOP;
  FOR lim IN SELECT value FROM jsonb_array_elements(d->'limits') LOOP
   remaining:=(lim->>'remaining_cents')::numeric;
   IF remaining<0 THEN
    SELECT coalesce((SELECT t->>'name' FROM jsonb_array_elements(d->'taxonomy_scopes') t WHERE t->>'category_id'=lim->>'category_id' AND t->>'subcategory_id' IS NOT DISTINCT FROM lim->>'subcategory_id' AND t->>'custom_subcategory_id' IS NOT DISTINCT FROM lim->>'custom_subcategory_id' LIMIT 1),
      (SELECT t->>'name' FROM jsonb_array_elements(d->'taxonomy') t WHERE t->>'id'=lim->>'category_id' LIMIT 1),lim->>'category_id') INTO key;
    issues:=issues||jsonb_build_array(public.budget_attention_issue('category:'||(lim->>'id'),'overspend',coalesce(key,lim->>'category_id'),-remaining,(lim->>'amount_cents')::numeric+coalesce((lim->>'opening_carry_cents')::numeric,0),NULL,2,scope_basis||jsonb_build_object('category',lim->'category_id','subcategory',lim->'subcategory_id','custom',lim->'custom_subcategory_id'),coalesce(maps->(lim->>'id'),'{}')));
   END IF;
  END LOOP;
  remaining:=(d->>'other_flexible_remaining_cents')::numeric;
  IF remaining<0 AND jsonb_array_length(d->'limits')>0 THEN issues:=issues||jsonb_build_array(public.budget_attention_issue('category:other','overspend','Other everyday spending',-remaining,(d->>'other_flexible_cents')::numeric+coalesce((d->>'other_opening_carry_cents')::numeric,0),NULL,2,scope_basis,coalesce(maps->'other','{}')));END IF;
  IF (d->>'unassigned_credit_cents')::numeric>0 THEN issues:=issues||jsonb_build_array(public.budget_attention_issue('credits:unassigned','unassigned_credits','Credits need a purpose',NULL,NULL,NULL,4,scope_basis||jsonb_build_object('credits',d->'unassigned_credit_cents')));END IF;
  SELECT count(*) INTO days FROM public.budget_activity(p_tenant,p_plan,p.start_date,p.end_date) WHERE source_type='expense' AND (category_id IS NULL OR lower(category_id)='uncategorized');
  IF days>0 THEN issues:=issues||jsonb_build_array(public.budget_attention_issue('categories:unclassified','uncategorized','Spending needs a category',NULL,NULL,NULL,4,scope_basis||jsonb_build_object('count',days),coalesce(maps->'uncategorized','{}'))||jsonb_build_object('count',days));END IF;
 END IF;
 IF NOT (d->'lifecycle'->'facts'->>'scope_valid')::boolean OR NOT (d->'lifecycle'->'facts'->>'coverage_complete')::boolean THEN issues:=issues||jsonb_build_array(public.budget_attention_issue('data:coverage','check_data','Check the history behind this budget',NULL,NULL,NULL,4,scope_basis));END IF;
 FOR i IN SELECT value FROM jsonb_array_elements(issues) ORDER BY (value->>'priority')::int,value->>'due_date' NULLS LAST,value->>'key' LOOP
  SELECT * INTO event FROM public.budget_attention_events e WHERE e.plan_id=p_plan AND e.period_id=p_period AND e.issue_key=i->>'key' ORDER BY e.version DESC LIMIT 1;
  old:=event.payload;reopened:=false;why:=NULL;state:='active';
  IF old IS NOT NULL AND old->>'state'<>'active' THEN
   IF (old->>'until')::date<=asof THEN why:='expired';
   ELSIF i->'due_date' IS DISTINCT FROM old->'issue'->'due_date' THEN why:='due_date_changed';
   ELSIF i->'basis' IS DISTINCT FROM old->'issue'->'basis' THEN why:='evidence_changed';
   ELSIF EXISTS(SELECT 1 FROM jsonb_each(old->'issue'->'evidence') e WHERE i->'evidence'->e.key IS DISTINCT FROM e.value) THEN why:='evidence_changed';
   ELSIF (i->>'gap_cents')::numeric-coalesce((old->'issue'->>'gap_cents')::numeric,0)>=(old->'issue'->>'threshold_cents')::numeric THEN why:='gap_worsened';
   ELSE state:=old->>'state';END IF;
   reopened:=state='active';
  END IF;
  hash:=encode(extensions.digest((i||jsonb_build_object('as_of',asof,'source_revision',p_source::text,'plan_version',p_version::text))::text,'sha256'),'hex');
  i:=i||jsonb_build_object('issue_hash',hash,'state',state,'reopened',reopened,'reopen_reason',why,'until',old->'until');
  IF NOT p_internal THEN i:=i-'basis'-'evidence';END IF;
  result:=result||jsonb_build_array(i);
 END LOOP;
 SELECT coalesce(max(version),0) INTO attention_v FROM public.budget_attention_events WHERE plan_id=p_plan;
 SELECT e.operation_id INTO last_op FROM public.budget_attention_events e JOIN public.budget_operations o ON o.id=e.operation_id
 WHERE e.plan_id=p_plan AND e.version=attention_v AND o.action='set_attention' AND NOT EXISTS(SELECT 1 FROM public.budget_operations u WHERE u.undo_of=o.id)
 AND o.after_state->>'financial_version'=p_version::text AND o.outcome->>'source_revision'=p_source::text;
 IF EXISTS(SELECT 1 FROM jsonb_path_query(result,'$.** ? (@.type() == "number")') n WHERE abs(n::text::numeric)>9007199254740991) THEN RAISE EXCEPTION 'budget_overflow';END IF;
 RETURN jsonb_build_object('items',result,'total',jsonb_array_length(result),'active_count',(SELECT count(*) FROM jsonb_array_elements(result) x WHERE x->>'state'='active'),'version',attention_v::text,'as_of',asof,'editable',asof>=p.start_date AND asof<p.end_date,'undo_operation_id',last_op,'forecast_available',false);
END $$;

-- Do not add presentation data to financial review/preview payloads. One gated
-- workspace read composes attention after the existing financial details.
CREATE FUNCTION public.budget_workspace_details(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE d jsonb;BEGIN
 d:=public.budget_details(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 RETURN d||jsonb_build_object('attention',public.budget_attention_facts(p_tenant,p_actor,p_plan,p_period,p_source,p_version,d));
END $$;

ALTER FUNCTION public.budget_command(uuid,uuid,uuid,jsonb,boolean) RENAME TO budget_command_controls;
CREATE FUNCTION public.budget_command(p_tenant uuid,p_actor uuid,p_request uuid,p_input jsonb,p_enabled boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE source bigint;hash text;prior public.budget_operations%ROWTYPE;original public.budget_operations%ROWTYPE;plan public.budget_plans%ROWTYPE;p public.budget_periods%ROWTYPE;
 queue jsonb;item jsonb;old jsonb;decision jsonb;v bigint;eid uuid;op uuid:=gen_random_uuid();compensation uuid;receipt jsonb;after_data jsonb;until_on date;asof date;
BEGIN
 source:=public.budget_lock_source(p_tenant);PERFORM public.budget_assert_owner(p_tenant,p_actor);
 hash:=encode(extensions.digest(p_input::text,'sha256'),'hex');SELECT * INTO prior FROM public.budget_operations WHERE tenant_id=p_tenant AND request_id=p_request;
 IF FOUND THEN IF prior.payload_hash<>hash THEN RAISE EXCEPTION 'budget_request_conflict';END IF;RETURN prior.outcome;END IF;
 IF p_input->>'action'='undo' THEN SELECT * INTO original FROM public.budget_operations WHERE tenant_id=p_tenant AND id=(p_input->>'operation_id')::uuid;END IF;
 IF p_input->>'action'<>'set_attention' AND NOT(p_input->>'action'='undo' AND original.action='set_attention') THEN RETURN public.budget_command_controls(p_tenant,p_actor,p_request,p_input,p_enabled);END IF;
 IF p_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'budget_disabled';END IF;
 IF p_input->>'expected_method' IS DISTINCT FROM 'budget-foundation-v1' THEN RAISE EXCEPTION 'budget_stale_method';END IF;
 IF (p_input->>'expected_source')::bigint IS DISTINCT FROM source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 SELECT * INTO plan FROM public.budget_plans b WHERE b.id=CASE WHEN original.id IS NULL THEN (p_input->>'plan_id')::uuid ELSE (original.after_state->>'plan_id')::uuid END AND b.tenant_id=p_tenant AND b.state='active';
 IF plan.id IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
 SELECT coalesce(max(version),0) INTO v FROM public.budget_attention_events WHERE plan_id=plan.id;
 IF original.id IS NOT NULL THEN
  IF plan.version IS DISTINCT FROM (original.after_state->>'financial_version')::bigint OR source IS DISTINCT FROM (original.outcome->>'source_revision')::bigint OR v IS DISTINCT FROM (original.after_state->>'attention_version')::bigint OR EXISTS(SELECT 1 FROM public.budget_operations WHERE undo_of=original.id) THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
  compensation:=original.id;decision:=original.before_state->'attention';
  IF decision='null'::jsonb THEN decision:=jsonb_build_object('state','active','until',NULL,'issue',original.before_state->'issue');END IF;
  SELECT * INTO p FROM public.budget_periods WHERE id=(original.after_state->>'period_id')::uuid AND plan_id=plan.id;
 ELSE
  IF plan.version IS DISTINCT FROM (p_input->>'expected_plan')::bigint THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
  IF v IS DISTINCT FROM (p_input->>'expected_attention')::bigint THEN RAISE EXCEPTION 'budget_stale_attention';END IF;
  SELECT * INTO p FROM public.budget_periods WHERE id=(p_input->>'period_id')::uuid AND plan_id=plan.id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
  asof:=(now() AT TIME ZONE p.timezone)::date;
  IF asof<p.start_date OR asof>=p.end_date THEN RAISE EXCEPTION 'budget_invalid_attention_period';END IF;
  queue:=public.budget_attention_facts(p_tenant,p_actor,plan.id,p.id,source,plan.version,public.budget_details(p_tenant,p_actor,plan.id,p.id,source,plan.version),true);
  SELECT value INTO item FROM jsonb_array_elements(queue->'items') WHERE value->>'key'=p_input->>'issue_key';
  IF item IS NULL OR item->>'issue_hash' IS DISTINCT FROM p_input->>'issue_hash' THEN RAISE EXCEPTION 'budget_stale_attention';END IF;
  IF p_input->>'state' NOT IN('acknowledged','snoozed','active') OR p_input->>'state' IS NULL THEN RAISE EXCEPTION 'budget_invalid_attention_state';END IF;
  IF p_input->>'state'='snoozed' THEN until_on:=(p_input->>'until')::date;
   IF until_on IS NULL OR until_on<=asof OR until_on>p.end_date THEN RAISE EXCEPTION 'budget_invalid_attention_date';END IF;
  ELSIF p_input->>'until' IS NOT NULL THEN RAISE EXCEPTION 'budget_invalid_attention_date';
  ELSIF p_input->>'state'='acknowledged' THEN until_on:=p.end_date;
  END IF;
  decision:=jsonb_build_object('state',p_input->>'state','until',until_on,'issue',item-'state'-'reopened'-'reopen_reason'-'until');
 END IF;
 SELECT e.payload INTO old FROM public.budget_attention_events e WHERE e.plan_id=plan.id AND e.period_id=p.id AND e.issue_key=decision->'issue'->>'key' ORDER BY e.version DESC LIMIT 1;
 INSERT INTO public.budget_attention_events(tenant_id,plan_id,period_id,version,issue_key,payload,source_revision,operation_id,actor_id)
 VALUES(p_tenant,plan.id,p.id,v+1,decision->'issue'->>'key',decision,source,op,p_actor) RETURNING id INTO eid;
 -- Deliberately omit plan_version here: financial Undo discovery must ignore
 -- presentation-only operations. The financial version is guarded separately.
 after_data:=jsonb_build_object('plan_id',plan.id,'period_id',p.id,'financial_version',plan.version::text,'attention_version',(v+1)::text,'attention_event_id',eid);
 receipt:=jsonb_build_object('request_id',p_request,'operation_id',op,'status','committed','source_revision',source::text,'method','budget-foundation-v1','result',after_data);
 INSERT INTO public.budget_operations(id,tenant_id,actor_id,request_id,payload_hash,action,before_state,after_state,outcome,undo_of)
 VALUES(op,p_tenant,p_actor,p_request,hash,p_input->>'action',jsonb_build_object('attention',old,'issue',decision->'issue'),after_data,receipt,compensation);
 RETURN receipt;
END $$;

DO $$ DECLARE f record;BEGIN
 IF NOT(SELECT relrowsecurity FROM pg_class WHERE oid='public.budget_attention_events'::regclass)
 OR has_table_privilege('anon','public.budget_attention_events','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 OR has_table_privilege('authenticated','public.budget_attention_events','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'Budget attention grant leak';END IF;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND left(p.proname,7)='budget_' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
