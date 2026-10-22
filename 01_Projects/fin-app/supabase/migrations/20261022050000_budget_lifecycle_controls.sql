-- Budget pause/resume is an operational control, not plan deletion. Line archive
-- keeps stable purposes, source claims and current allocations in history.
CREATE TABLE public.budget_control_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,plan_id uuid NOT NULL,period_id uuid NOT NULL,
 version bigint NOT NULL CHECK(version>0),action text NOT NULL CHECK(action IN('pause_budget','resume_budget','archive_line','undo')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),impact jsonb NOT NULL,source_revision bigint NOT NULL CHECK(source_revision>=0),
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(plan_id,version),UNIQUE(tenant_id,plan_id,id),
 FOREIGN KEY(tenant_id,plan_id,period_id) REFERENCES public.budget_periods(tenant_id,plan_id,id) ON DELETE CASCADE
);
CREATE TABLE public.budget_control_moves (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,plan_id uuid NOT NULL,period_id uuid NOT NULL,
 event_id uuid NOT NULL,
 from_line_id uuid NOT NULL,to_line_id uuid NOT NULL,amount_cents bigint NOT NULL CHECK(amount_cents<>0 AND abs(amount_cents::numeric)<=9007199254740991),
 FOREIGN KEY(tenant_id,plan_id,event_id) REFERENCES public.budget_control_events(tenant_id,plan_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,plan_id,period_id) REFERENCES public.budget_periods(tenant_id,plan_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,plan_id,from_line_id) REFERENCES public.budget_lines(tenant_id,plan_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,plan_id,to_line_id) REFERENCES public.budget_lines(tenant_id,plan_id,id) ON DELETE CASCADE,CHECK(from_line_id<>to_line_id)
);
CREATE INDEX budget_control_history ON public.budget_control_events(plan_id,version DESC);
CREATE INDEX budget_control_move_period ON public.budget_control_moves(plan_id,period_id);
DO $$ DECLARE tbl text;BEGIN
 FOREACH tbl IN ARRAY ARRAY['budget_control_events','budget_control_moves'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tbl);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tbl);EXECUTE format('GRANT SELECT,INSERT,DELETE ON public.%I TO service_role',tbl);
  EXECUTE format('CREATE POLICY budget_member_read ON public.%I FOR SELECT TO authenticated USING(public.is_tenant_member(tenant_id))',tbl);
 END LOOP;
END $$;
CREATE TRIGGER budget_history_immutable BEFORE UPDATE ON public.budget_control_events FOR EACH ROW EXECUTE FUNCTION public.budget_immutable_history();
-- Moves have no anonymised actor column, so every update is prohibited.
CREATE FUNCTION public.budget_immutable_control_move() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'budget_immutable_history';END $$;
CREATE TRIGGER budget_history_immutable BEFORE UPDATE ON public.budget_control_moves FOR EACH ROW EXECUTE FUNCTION public.budget_immutable_control_move();

CREATE FUNCTION public.budget_control_state(p_plan uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT payload FROM public.budget_control_events WHERE plan_id=p_plan ORDER BY version DESC LIMIT 1),'{"paused":false,"archives":[]}'::jsonb)
$$;
CREATE FUNCTION public.budget_control_delta(p_plan uuid,p_period uuid,p_line uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(sum(CASE WHEN m.to_line_id=p_line THEN m.amount_cents::numeric ELSE -m.amount_cents::numeric END),0)
 FROM public.budget_control_moves m JOIN public.budget_periods origin ON origin.id=m.period_id
 JOIN public.budget_periods selected ON selected.id=p_period JOIN public.budget_lines l ON l.id=p_line
 WHERE m.plan_id=p_plan AND (m.from_line_id=p_line OR m.to_line_id=p_line)
 AND CASE WHEN l.kind='everyday' THEN m.period_id=p_period ELSE origin.start_date<=selected.start_date END
$$;

-- Apply signed disposition before the category carry chain reads M4 facts.
ALTER FUNCTION public.budget_details_m4(uuid,uuid,uuid,uuid,bigint,bigint) RENAME TO budget_details_m4_before_controls;
CREATE FUNCTION public.budget_details_m4(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d jsonb;items jsonb:='[]';item jsonb;arch jsonb;control jsonb;delta numeric;everyday_delta numeric:=0;start_on date;BEGIN
 d:=public.budget_details_m4_before_controls(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 control:=public.budget_control_state(p_plan);SELECT start_date INTO start_on FROM public.budget_periods WHERE id=p_period;
 FOR item IN SELECT value FROM jsonb_array_elements(d->'items') LOOP
  delta:=public.budget_control_delta(p_plan,p_period,(item->>'line_id')::uuid);
  IF delta<>0 THEN
   item:=item||jsonb_build_object('reallocated_cents',(item->>'reallocated_cents')::numeric+delta,'remaining_cents',(item->>'remaining_cents')::numeric+delta,
    'reserve_cents',CASE WHEN item->>'kind'='reserve' THEN to_jsonb((item->>'reserve_cents')::numeric+delta) ELSE item->'reserve_cents' END);
   IF item->>'kind'='everyday' THEN everyday_delta:=delta;END IF;
  END IF;
  SELECT value INTO arch FROM jsonb_array_elements(control->'archives') WHERE value->>'line_id'=item->>'line_id' AND (value->>'from')::date<=start_on;
  IF arch IS NOT NULL THEN
   item:=item||jsonb_build_object('archived',true,'archive',arch);
   IF item->'config'<>'null'::jsonb THEN item:=jsonb_set(item,'{config}',(item->'config')||jsonb_build_object('state','paused'));END IF;
   IF (arch->>'from')::date<start_on THEN item:=item||jsonb_build_object('occurrences','[]'::jsonb);END IF;
  END IF;
  items:=items||jsonb_build_array(item);
 END LOOP;
 d:=d||jsonb_build_object('items',items,'other_flexible_cents',(d->>'other_flexible_cents')::numeric+everyday_delta);
 IF EXISTS(SELECT 1 FROM jsonb_path_query(d,'$.** ? (@.type() == "number")') n WHERE abs(n::text::numeric)>9007199254740991) THEN RAISE EXCEPTION 'budget_overflow';END IF;
 RETURN d;
END $$;

-- Every template writer (item edits, reviews, frequency and undo) respects an
-- archived line. Current-period intent stays separate from future zero refill.
ALTER FUNCTION public.budget_write_revision(uuid,uuid,uuid,bigint,bigint,bigint,bigint,jsonb,boolean) RENAME TO budget_write_revision_before_controls;
CREATE FUNCTION public.budget_write_revision(p_tenant uuid,p_plan uuid,p_period uuid,p_version bigint,p_source bigint,p_income bigint,p_drawdown bigint,p_lines jsonb,p_gap boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE archives jsonb;lines jsonb;start_on date;BEGIN
 archives:=public.budget_control_state(p_plan)->'archives';lines:=p_lines;
 IF p_period IS NULL THEN
  SELECT jsonb_agg(CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(archives) a WHERE a->>'line_id'=x.line_data->>'line_id') THEN x.line_data||jsonb_build_object('amount_cents',0) ELSE x.line_data END ORDER BY x.line_data->>'line_id') INTO lines FROM jsonb_array_elements(p_lines) x(line_data);
 ELSE
  SELECT start_date INTO start_on FROM public.budget_periods WHERE id=p_period;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) l,jsonb_array_elements(archives) a WHERE a->>'line_id'=l->>'line_id' AND (a->>'from')::date<start_on AND public.budget_money(l->'amount_cents')<>0) THEN RAISE EXCEPTION 'budget_invalid_archived_line';END IF;
 END IF;
 RETURN public.budget_write_revision_before_controls(p_tenant,p_plan,p_period,p_version,p_source,p_income,p_drawdown,lines,p_gap);
END $$;

CREATE FUNCTION public.budget_control_gap(p_tenant uuid,p_plan uuid,p_period uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.budget_periods%ROWTYPE;asof date;cursor_on date;until_on date;finish date;windows jsonb:='[]';valid boolean;covered boolean;gross numeric;credits numeric;matched jsonb;BEGIN
 SELECT * INTO p FROM public.budget_periods WHERE id=p_period AND plan_id=p_plan AND tenant_id=p_tenant;
 asof:=(now() AT TIME ZONE p.timezone)::date;cursor_on:=p.end_date;until_on:=asof+1;
 IF cursor_on>=until_on THEN RETURN jsonb_build_object('windows',windows,'from',p.end_date,'until',p.end_date,'scope_valid',true,'coverage_complete',true,'gross_expense_cents',0,'expense_credits_cents',0,'reserve_usage','[]'::jsonb);END IF;
 WHILE cursor_on<until_on LOOP
  IF jsonb_array_length(windows)>=600 THEN RAISE EXCEPTION 'budget_invalid_gap_history_limit';END IF;
  finish:=CASE WHEN p.frequency='monthly' THEN (cursor_on+interval '1 month')::date ELSE cursor_on+14 END;
  windows:=windows||jsonb_build_array(jsonb_build_object('start_date',cursor_on,'end_date',finish,'state','unplanned'));
  cursor_on:=finish;
 END LOOP;
 SELECT NOT EXISTS(SELECT 1 FROM public.budget_account_memberships m LEFT JOIN public.accounts a ON a.id=m.account_id AND a.tenant_id=m.tenant_id WHERE m.plan_id=p_plan AND m.role='activity' AND m.start_date<until_on AND (m.end_date IS NULL OR m.end_date>p.end_date) AND (a.id IS NULL OR a.currency<>'AUD')) INTO valid;
 SELECT EXISTS(SELECT 1 FROM public.budget_account_memberships m WHERE m.plan_id=p_plan AND m.role='activity' AND m.start_date<until_on AND (m.end_date IS NULL OR m.end_date>p.end_date)) AND NOT EXISTS(
  SELECT 1 FROM public.budget_account_memberships m WHERE m.plan_id=p_plan AND m.role='activity' AND m.start_date<until_on AND (m.end_date IS NULL OR m.end_date>p.end_date)
  AND NOT coalesce((SELECT range_agg(daterange(c.start_date,c.end_date,'[)')) @> daterange(greatest(p.end_date,m.start_date),least(until_on,coalesce(m.end_date,until_on)),'[)') FROM public.account_activity_coverage c WHERE c.tenant_id=p_tenant AND c.account_id=m.account_id AND c.revoked_at IS NULL),false)) INTO covered;
 SELECT coalesce(sum(capacity) FILTER(WHERE source_type='expense'),0),coalesce(sum(capacity) FILTER(WHERE source_type='refund'),0) INTO gross,credits FROM public.budget_activity(p_tenant,p_plan,p.end_date,until_on);
 SELECT coalesce(jsonb_agg(jsonb_build_object('line_id',line_id,'net_used_cents',used)),'[]') INTO matched FROM (
  SELECT c.line_id,sum(CASE WHEN c.purpose='refund' THEN -c.amount_cents::numeric ELSE c.amount_cents::numeric END) used FROM public.budget_live_claims(p_tenant,p_plan) c JOIN public.budget_lines l ON l.id=c.line_id
  WHERE c.valid AND l.kind='reserve' AND c.purpose IN('expense','purchase','refund') AND c.source_date>=p.end_date AND c.source_date<until_on GROUP BY c.line_id
 ) usage;
 RETURN jsonb_build_object('windows',windows,'from',p.end_date,'until',until_on,'scope_valid',valid,'coverage_complete',covered,
  'gross_expense_cents',CASE WHEN valid THEN to_jsonb(gross) ELSE 'null'::jsonb END,'expense_credits_cents',CASE WHEN valid THEN to_jsonb(credits) ELSE 'null'::jsonb END,'reserve_usage',CASE WHEN valid THEN matched ELSE 'null'::jsonb END);
END $$;

ALTER FUNCTION public.budget_details(uuid,uuid,uuid,uuid,bigint,bigint) RENAME TO budget_details_rollover;
CREATE FUNCTION public.budget_details(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d jsonb;e jsonb;BEGIN
 d:=public.budget_details_rollover(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 SELECT jsonb_build_object('id',id,'version',version::text,'action',action) INTO e FROM public.budget_control_events WHERE plan_id=p_plan AND tenant_id=p_tenant ORDER BY version DESC LIMIT 1;
 RETURN d||jsonb_build_object('controls',public.budget_control_state(p_plan),'control_event',e);
END $$;

CREATE FUNCTION public.budget_preview_control(p_tenant uuid,p_actor uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE source bigint;plan public.budget_plans%ROWTYPE;p public.budget_periods%ROWTYPE;line public.budget_lines%ROWTYPE;state jsonb;before_state jsonb;before_facts jsonb;after_facts jsonb;gap jsonb;answer jsonb;item jsonb;entry jsonb;allocations jsonb;template public.budget_revisions%ROWTYPE;rid uuid;eid uuid;target uuid;amount numeric;asof date;BEGIN
 source:=public.budget_lock_source(p_tenant);PERFORM public.budget_assert_owner(p_tenant,p_actor);
 IF p_input->>'expected_method' IS DISTINCT FROM 'budget-foundation-v1' THEN RAISE EXCEPTION 'budget_stale_method';END IF;
 IF (p_input->>'expected_source')::bigint IS DISTINCT FROM source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 SELECT * INTO plan FROM public.budget_plans b WHERE b.id=(p_input->>'plan_id')::uuid AND b.tenant_id=p_tenant AND b.state='active';
 SELECT * INTO p FROM public.budget_periods WHERE id=(p_input->>'period_id')::uuid AND plan_id=plan.id;
 IF plan.id IS NULL OR p.id IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF plan.version IS DISTINCT FROM (p_input->>'expected_plan')::bigint THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
 IF EXISTS(SELECT 1 FROM public.budget_periods WHERE plan_id=plan.id AND start_date>p.start_date) THEN RAISE EXCEPTION 'budget_historical_readonly';END IF;
 IF EXISTS(SELECT 1 FROM (SELECT fc.state FROM public.budget_frequency_changes fc WHERE fc.plan_id=plan.id ORDER BY fc.version DESC LIMIT 1) f WHERE f.state='pending') THEN RAISE EXCEPTION 'budget_frequency_pending';END IF;
 state:=public.budget_control_state(plan.id);before_state:=state;asof:=(now() AT TIME ZONE plan.timezone)::date;
 gap:=public.budget_control_gap(p_tenant,plan.id,p.id);
 IF p_input->>'control' IN('pause_budget','resume_budget') AND (p_input->>'line_id' IS NOT NULL OR p_input->>'disposition' IS NOT NULL OR p_input->>'target_line_id' IS NOT NULL) THEN RAISE EXCEPTION 'budget_invalid_disposition';END IF;
 IF p_input->>'control'='archive_line' AND p_input->>'disposition'='release' AND p_input->>'target_line_id' IS NOT NULL THEN RAISE EXCEPTION 'budget_invalid_disposition';END IF;
 IF p_input->>'control'='pause_budget' AND NOT (state->>'paused')::boolean THEN state:=state||jsonb_build_object('paused',true,'paused_on',asof);
 ELSIF p_input->>'control'='resume_budget' AND (state->>'paused')::boolean THEN state:=state||jsonb_build_object('paused',false,'resumed_on',asof);
 ELSIF p_input->>'control'='archive_line' THEN
  IF p.end_date<=asof THEN RAISE EXCEPTION 'budget_historical_readonly';END IF;
  SELECT * INTO line FROM public.budget_lines WHERE id=(p_input->>'line_id')::uuid AND plan_id=plan.id AND tenant_id=p_tenant AND kind<>'everyday';
  IF line.id IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(state->'archives') a WHERE a->>'line_id'=line.id::text) THEN RAISE EXCEPTION 'budget_invalid_archived_line';END IF;
  SELECT value INTO item FROM jsonb_array_elements(public.budget_details(p_tenant,p_actor,plan.id,p.id,source,plan.version)->'items') WHERE value->>'line_id'=line.id::text;
  IF item IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
  IF p_input->>'disposition' NOT IN('retain','release','transfer') OR p_input->>'disposition' IS NULL THEN RAISE EXCEPTION 'budget_invalid_disposition';END IF;
  IF line.kind<>'reserve' AND p_input->>'disposition'<>'retain' THEN RAISE EXCEPTION 'budget_invalid_disposition';END IF;
  IF p_input->>'disposition'='retain' THEN IF p_input->>'target_line_id' IS NOT NULL THEN RAISE EXCEPTION 'budget_invalid_disposition';END IF;
  ELSE
   amount:=(item->>'reserve_cents')::numeric;
   IF amount IS NULL OR NOT (public.budget_lifecycle(p_tenant,p_actor,plan.id,p.id,source,plan.version)->>'chain_valid')::boolean THEN RAISE EXCEPTION 'budget_account_unavailable';END IF;
   IF p_input->>'disposition'='release' THEN SELECT id INTO target FROM public.budget_lines WHERE plan_id=plan.id AND kind='everyday';
   ELSE target:=(p_input->>'target_line_id')::uuid;
    IF target IS NULL OR target=line.id OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.budget_details(p_tenant,p_actor,plan.id,p.id,source,plan.version)->'items') d WHERE d->>'line_id'=target::text AND d->>'kind'='reserve') OR EXISTS(SELECT 1 FROM jsonb_array_elements(state->'archives') a WHERE a->>'line_id'=target::text) THEN RAISE EXCEPTION 'budget_invalid_disposition';END IF;
   END IF;
  END IF;
  entry:=jsonb_build_object('line_id',line.id,'name',item->>'name','from',p.start_date,'archived_on',asof,'period_id',p.id,'disposition',p_input->>'disposition','target_line_id',target);
  state:=jsonb_set(state,'{archives}',(state->'archives')||jsonb_build_array(entry));
 ELSE RAISE EXCEPTION 'budget_invalid_control_state';END IF;
 before_facts:=public.budget_scope_impact(p_tenant,p_actor,plan.id,source,plan.version);
 gap:=gap||jsonb_build_object('reserve_effects',(
  SELECT coalesce(jsonb_agg(jsonb_build_object('line_id',it->'line_id','remaining_cents',CASE WHEN (gap->>'scope_valid')::boolean THEN to_jsonb((it->>'reserve_cents')::numeric-coalesce((SELECT (u->>'net_used_cents')::numeric FROM jsonb_array_elements(coalesce(nullif(gap->'reserve_usage','null'::jsonb),'[]'::jsonb)) u WHERE u->>'line_id'=it->>'line_id'),0)) ELSE 'null'::jsonb END)),'[]')
  FROM jsonb_array_elements(before_facts) f,jsonb_array_elements(f->'items') it WHERE f->>'key'=p.id::text AND it->>'kind'='reserve'
 ));
 SELECT * INTO template FROM public.budget_revisions WHERE id=plan.template_revision_id;
 BEGIN
  INSERT INTO public.budget_control_events(tenant_id,plan_id,period_id,version,action,payload,impact,source_revision,actor_id) VALUES(p_tenant,plan.id,p.id,plan.version+1,p_input->>'control',state,'{}',source,p_actor) RETURNING id INTO eid;
  IF p_input->>'control'='archive_line' THEN
   IF coalesce(amount,0)<>0 THEN INSERT INTO public.budget_control_moves(tenant_id,plan_id,period_id,event_id,from_line_id,to_line_id,amount_cents) VALUES(p_tenant,plan.id,p.id,eid,line.id,target,amount::bigint);END IF;
   SELECT jsonb_agg(jsonb_build_object('line_id',a.line_id,'amount_cents',a.amount_cents) ORDER BY a.line_id) INTO allocations FROM public.budget_allocations a WHERE revision_id=template.id;
   rid:=public.budget_write_revision(p_tenant,plan.id,NULL,plan.version,source,template.income_cents,0,allocations,template.accepted_gap);
   UPDATE public.budget_plans SET template_revision_id=rid WHERE id=plan.id;
  END IF;
  after_facts:=public.budget_scope_impact(p_tenant,p_actor,plan.id,source,plan.version);
  SELECT jsonb_agg(jsonb_build_object('line_id',a.line_id,'amount_cents',a.amount_cents) ORDER BY a.line_id) INTO allocations FROM public.budget_allocations a JOIN public.budget_plans b ON b.template_revision_id=a.revision_id WHERE b.id=plan.id;
  RAISE SQLSTATE 'P0004' USING MESSAGE='budget_preview_rollback';
 EXCEPTION WHEN assert_failure THEN IF SQLERRM<>'budget_preview_rollback' THEN RAISE;END IF;END;
 -- SQL aggregate row order is not part of a financial preview's meaning.
 SELECT jsonb_agg(f||jsonb_build_object('items',(SELECT jsonb_agg(i ORDER BY i->>'line_id') FROM jsonb_array_elements(f->'items') i),'limits',coalesce((SELECT jsonb_agg(i ORDER BY i->>'id') FROM jsonb_array_elements(f->'limits') i),'[]'::jsonb)) ORDER BY f->>'start_date',f->>'key') INTO before_facts FROM jsonb_array_elements(before_facts) f;
 SELECT jsonb_agg(f||jsonb_build_object('items',(SELECT jsonb_agg(i ORDER BY i->>'line_id') FROM jsonb_array_elements(f->'items') i),'limits',coalesce((SELECT jsonb_agg(i ORDER BY i->>'id') FROM jsonb_array_elements(f->'limits') i),'[]'::jsonb)) ORDER BY f->>'start_date',f->>'key') INTO after_facts FROM jsonb_array_elements(after_facts) f;
 gap:=jsonb_set(gap,'{reserve_effects}',coalesce((SELECT jsonb_agg(i ORDER BY i->>'line_id') FROM jsonb_array_elements(gap->'reserve_effects') i),'[]'::jsonb));
 IF gap->'reserve_usage'<>'null'::jsonb THEN gap:=jsonb_set(gap,'{reserve_usage}',coalesce((SELECT jsonb_agg(i ORDER BY i->>'line_id') FROM jsonb_array_elements(gap->'reserve_usage') i),'[]'::jsonb));END IF;
 answer:=jsonb_build_object('control',p_input->>'control','line_id',p_input->'line_id','disposition',p_input->'disposition','target_line_id',p_input->'target_line_id','before_control',before_state,'after_control',state,
  'before',before_facts,'after',after_facts,'gap',gap,'future_allocations',allocations,'move_from',line.id,'move_to',target,'move_cents',amount,'source_revision',source::text,'plan_version',plan.version::text,'as_of',asof);
 IF EXISTS(SELECT 1 FROM jsonb_path_query(answer,'$.** ? (@.type() == "number")') n WHERE abs(n::text::numeric)>9007199254740991) THEN RAISE EXCEPTION 'budget_overflow';END IF;
 RETURN answer||jsonb_build_object('preview_hash',encode(extensions.digest(answer::text,'sha256'),'hex'));
END $$;

ALTER FUNCTION public.budget_command(uuid,uuid,uuid,jsonb,boolean) RENAME TO budget_command_rollover;
CREATE FUNCTION public.budget_command(p_tenant uuid,p_actor uuid,p_request uuid,p_input jsonb,p_enabled boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE source bigint;hash text;prior public.budget_operations%ROWTYPE;original public.budget_operations%ROWTYPE;plan public.budget_plans%ROWTYPE;preview jsonb;oldstate jsonb;newstate jsonb;pid uuid;eid uuid;op uuid:=gen_random_uuid();compensation uuid;receipt jsonb;after_data jsonb;template public.budget_revisions%ROWTYPE;allocations jsonb;rid uuid;new_v bigint;item jsonb;BEGIN
 source:=public.budget_lock_source(p_tenant);PERFORM public.budget_assert_owner(p_tenant,p_actor);
 hash:=encode(extensions.digest(p_input::text,'sha256'),'hex');SELECT * INTO prior FROM public.budget_operations WHERE tenant_id=p_tenant AND request_id=p_request;
 IF FOUND THEN IF prior.payload_hash<>hash THEN RAISE EXCEPTION 'budget_request_conflict';END IF;RETURN prior.outcome;END IF;
 IF p_input->>'action'='undo' THEN SELECT * INTO original FROM public.budget_operations WHERE tenant_id=p_tenant AND id=(p_input->>'operation_id')::uuid;END IF;
 IF p_input->>'action'<>'set_control' AND NOT(p_input->>'action'='undo' AND original.action='set_control') THEN
  IF p_enabled THEN
   IF p_input->>'action' IN('open_next_period','schedule_frequency','apply_frequency') AND (public.budget_control_state((p_input->>'plan_id')::uuid)->>'paused')::boolean THEN RAISE EXCEPTION 'budget_paused';END IF;
   IF p_input->>'action'='save_item' AND EXISTS(SELECT 1 FROM jsonb_array_elements(public.budget_control_state((p_input->>'plan_id')::uuid)->'archives') a WHERE a->>'line_id'=p_input->>'line_id') THEN RAISE EXCEPTION 'budget_invalid_archived_line';END IF;
   IF p_input->>'action'='release_reserve' THEN
    SELECT value INTO item FROM jsonb_array_elements(public.budget_details(p_tenant,p_actor,(p_input->>'plan_id')::uuid,(p_input->>'period_id')::uuid,source,(p_input->>'expected_plan')::bigint)->'items') WHERE value->>'line_id'=p_input->>'from_line_id';
    IF public.budget_money(p_input->'amount_cents')>coalesce((item->>'reserve_cents')::numeric,0) THEN RAISE EXCEPTION 'budget_source_capacity';END IF;
   END IF;
  END IF;
  RETURN public.budget_command_rollover(p_tenant,p_actor,p_request,p_input,p_enabled);
 END IF;
 IF p_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'budget_disabled';END IF;
 IF p_input->>'expected_method' IS DISTINCT FROM 'budget-foundation-v1' THEN RAISE EXCEPTION 'budget_stale_method';END IF;
 IF (p_input->>'expected_source')::bigint IS DISTINCT FROM source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 IF p_input->>'action'='undo' THEN
  SELECT * INTO plan FROM public.budget_plans WHERE id=(original.after_state->>'plan_id')::uuid AND tenant_id=p_tenant AND state='active' FOR UPDATE;
  IF plan.id IS NULL OR plan.version IS DISTINCT FROM (original.after_state->>'plan_version')::bigint OR source IS DISTINCT FROM (original.outcome->>'source_revision')::bigint OR EXISTS(SELECT 1 FROM public.budget_operations WHERE undo_of=original.id) THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
  compensation:=original.id;pid:=(original.after_state->>'period_id')::uuid;newstate:=original.before_state->'control';preview:=original.before_state->'preview';
  SELECT jsonb_agg(jsonb_build_object('line_id',a.line_id,'amount_cents',a.amount_cents) ORDER BY a.line_id) INTO allocations FROM public.budget_allocations a WHERE a.revision_id=(original.before_state->>'template_revision_id')::uuid;
  preview:=(preview-'preview_hash')||jsonb_build_object('before',preview->'after','after',preview->'before','before_control',preview->'after_control','after_control',newstate,'move_cents',-(preview->>'move_cents')::numeric,'future_allocations',allocations,'source_revision',source::text,'plan_version',plan.version::text);
 ELSE
  preview:=public.budget_preview_control(p_tenant,p_actor,p_input);
  IF p_input->>'preview_hash' IS DISTINCT FROM preview->>'preview_hash' THEN RAISE EXCEPTION 'budget_stale_preview';END IF;
  IF p_input->'accept_impact' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(p_input->'accept_incomplete') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_input->'accept_carry') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'budget_invalid_scope_acceptance';END IF;
  IF (EXISTS(SELECT 1 FROM jsonb_array_elements(preview->'after') f WHERE NOT(f->>'scope_valid')::boolean OR NOT(f->>'coverage_complete')::boolean) OR NOT(preview->'gap'->>'coverage_complete')::boolean OR NOT(preview->'gap'->>'scope_valid')::boolean) AND p_input->'accept_incomplete'<>'true'::jsonb THEN RAISE EXCEPTION 'budget_invalid_incomplete_review';END IF;
  IF p_input->>'control'='resume_budget' AND p_input->'accept_carry'<>'true'::jsonb THEN RAISE EXCEPTION 'budget_invalid_resume_carry';END IF;
  SELECT * INTO plan FROM public.budget_plans WHERE id=(p_input->>'plan_id')::uuid AND tenant_id=p_tenant FOR UPDATE;
  pid:=(p_input->>'period_id')::uuid;newstate:=preview->'after_control';
 END IF;
 oldstate:=public.budget_control_state(plan.id);new_v:=plan.version+1;
 INSERT INTO public.budget_control_events(tenant_id,plan_id,period_id,version,action,payload,impact,source_revision,actor_id) VALUES(p_tenant,plan.id,pid,new_v,CASE WHEN compensation IS NULL THEN p_input->>'control' ELSE 'undo' END,newstate,preview,source,p_actor) RETURNING id INTO eid;
 IF compensation IS NULL AND p_input->>'control'='archive_line' AND coalesce((preview->>'move_cents')::numeric,0)<>0 THEN
  INSERT INTO public.budget_control_moves(tenant_id,plan_id,period_id,event_id,from_line_id,to_line_id,amount_cents) VALUES(p_tenant,plan.id,pid,eid,(preview->>'move_from')::uuid,(preview->>'move_to')::uuid,(preview->>'move_cents')::bigint);
 ELSIF compensation IS NOT NULL THEN
  INSERT INTO public.budget_control_moves(tenant_id,plan_id,period_id,event_id,from_line_id,to_line_id,amount_cents) SELECT tenant_id,plan_id,period_id,eid,from_line_id,to_line_id,-amount_cents FROM public.budget_control_moves WHERE event_id=(original.after_state->>'control_event_id')::uuid;
 END IF;
 IF compensation IS NOT NULL THEN SELECT * INTO template FROM public.budget_revisions WHERE id=(original.before_state->>'template_revision_id')::uuid;
 ELSE SELECT * INTO template FROM public.budget_revisions WHERE id=plan.template_revision_id;END IF;
 SELECT jsonb_agg(jsonb_build_object('line_id',a.line_id,'amount_cents',a.amount_cents) ORDER BY a.line_id) INTO allocations FROM public.budget_allocations a WHERE revision_id=template.id;
 rid:=public.budget_write_revision(p_tenant,plan.id,NULL,new_v,source,template.income_cents,0,allocations,template.accepted_gap);
 UPDATE public.budget_plans SET version=new_v,template_revision_id=rid WHERE id=plan.id;
 PERFORM public.budget_scope_impact(p_tenant,p_actor,plan.id,source,new_v);
 after_data:=jsonb_build_object('plan_id',plan.id,'period_id',pid,'plan_version',new_v::text,'control_event_id',eid);
 receipt:=jsonb_build_object('request_id',p_request,'operation_id',op,'status','committed','source_revision',source::text,'method','budget-foundation-v1','result',after_data);
 INSERT INTO public.budget_operations(id,tenant_id,actor_id,request_id,payload_hash,action,before_state,after_state,outcome,undo_of) VALUES(op,p_tenant,p_actor,p_request,hash,p_input->>'action',jsonb_build_object('control',oldstate,'preview',preview,'template_revision_id',plan.template_revision_id),after_data,receipt,compensation);
 RETURN receipt;
END $$;

-- Existing explicit positive reserve releases use the adjusted rights too.
CREATE OR REPLACE FUNCTION public.budget_command_m4(p_tenant uuid,p_actor uuid,p_request uuid,p_input jsonb,p_enabled boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE source_v bigint; hash text; previous public.budget_operations%ROWTYPE; original public.budget_operations%ROWTYPE;
 plan public.budget_plans%ROWTYPE; period public.budget_periods%ROWTYPE; line public.budget_lines%ROWTYPE;
 config public.budget_item_revisions%ROWTYPE; prior_config public.budget_item_revisions%ROWTYPE;
 claim public.budget_source_claims%ROWTYPE; parent public.budget_source_claims%ROWTYPE;
 rev public.budget_revisions%ROWTYPE; future public.budget_revisions%ROWTYPE;
 op uuid:=gen_random_uuid(); rid uuid; tid uuid; new_v bigint; lineid uuid; other uuid; amount bigint; future_amount bigint; current_amount bigint;
 payload jsonb; lines jsonb; future_lines jsonb; before_data jsonb:='{}'; after_data jsonb; receipt jsonb; result jsonb:='{}';
 src record; item jsonb; candidate jsonb; total numeric; claimed numeric; lim record; schedule_id uuid; compensation uuid;
 action text:=p_input->>'action'; gap boolean; scope text; creating boolean; oldamount bigint;
BEGIN
 source_v:=public.budget_lock_source(p_tenant);PERFORM public.budget_assert_owner(p_tenant,p_actor);
 hash:=encode(extensions.digest(p_input::text,'sha256'),'hex');
 SELECT * INTO previous FROM public.budget_operations WHERE tenant_id=p_tenant AND request_id=p_request;
 IF FOUND THEN IF previous.payload_hash<>hash THEN RAISE EXCEPTION 'budget_request_conflict';END IF;RETURN previous.outcome;END IF;
 IF action='undo' THEN SELECT * INTO original FROM public.budget_operations WHERE tenant_id=p_tenant AND id=(p_input->>'operation_id')::uuid;END IF;
 IF action NOT IN('save_item','claim_source','confirm_funding','reverse_claim','set_limits','move_allocation','release_reserve') AND NOT(action='undo' AND original.action IN('save_item','claim_source','confirm_funding','reverse_claim','set_limits','move_allocation','release_reserve')) THEN
  receipt:=public.budget_command_m2(p_tenant,p_actor,p_request,p_input,p_enabled);
  IF action='revise' THEN
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_input->'lines') x JOIN LATERAL(SELECT r.payload FROM public.budget_item_revisions r WHERE r.line_id=(x->>'line_id')::uuid ORDER BY r.version DESC LIMIT 1) c ON true
    WHERE (x->>'amount_cents')::numeric>0 AND (coalesce((c.payload->>'voided')::boolean,false) OR (p_input->>'scope'='period-and-future' AND c.payload->>'state' IN('paused','purchase-recorded','draft')))) THEN RAISE EXCEPTION 'budget_invalid_inactive_item';END IF;
   SELECT r.payload INTO candidate FROM public.budget_limit_revisions r WHERE r.period_id=(p_input->>'period_id')::uuid ORDER BY r.version DESC LIMIT 1;
   IF candidate IS NOT NULL THEN
    SELECT coalesce(sum(public.budget_money(x->'amount_cents')),0) INTO total FROM jsonb_array_elements(candidate) x;
    SELECT (x->>'amount_cents')::bigint INTO current_amount FROM jsonb_array_elements(p_input->'lines') x JOIN public.budget_lines l ON l.id=(x->>'line_id')::uuid WHERE l.kind='everyday';
    IF total>current_amount THEN RAISE EXCEPTION 'budget_invalid_limits';END IF;
   END IF;
  END IF;
  IF receipt->'result'->>'period_id' IS NOT NULL AND EXISTS(SELECT 1 FROM public.budget_plans p WHERE p.id=(receipt->'result'->>'plan_id')::uuid AND p.state='active') THEN
   PERFORM public.budget_details(p_tenant,p_actor,(receipt->'result'->>'plan_id')::uuid,(receipt->'result'->>'period_id')::uuid,source_v,(receipt->'result'->>'plan_version')::bigint);
  END IF;
  RETURN receipt;
 END IF;
 IF p_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'budget_disabled';END IF;
 IF p_input->>'expected_method' IS DISTINCT FROM 'budget-foundation-v1' THEN RAISE EXCEPTION 'budget_stale_method';END IF;
 IF source_v IS DISTINCT FROM (p_input->>'expected_source')::bigint THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=coalesce((p_input->>'plan_id')::uuid,(original.after_state->>'plan_id')::uuid) AND state='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF action='undo' THEN
  IF plan.version IS DISTINCT FROM (original.after_state->>'plan_version')::bigint OR source_v IS DISTINCT FROM (original.outcome->>'source_revision')::bigint
   OR EXISTS(SELECT 1 FROM public.budget_operations WHERE undo_of=original.id) THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
 ELSE
  IF plan.version IS DISTINCT FROM (p_input->>'expected_plan')::bigint THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
 END IF;
 SELECT * INTO period FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=plan.id AND id=coalesce((p_input->>'period_id')::uuid,(original.after_state->>'period_id')::uuid) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
 SELECT * INTO rev FROM public.budget_revisions WHERE id=period.current_revision_id;
 SELECT * INTO future FROM public.budget_revisions WHERE id=plan.template_revision_id;
 new_v:=plan.version+1;rid:=rev.id;tid:=future.id;
 before_data:=jsonb_build_object('plan_id',plan.id,'period_id',period.id,'period_revision',rev.id,'template_revision',future.id);
 gap:=coalesce((p_input->>'accept_gap')::boolean,false);scope:=coalesce(p_input->>'scope','period');
 IF action='save_item' THEN
  payload:=p_input->'item';lineid:=(p_input->>'line_id')::uuid;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN('type','name','target_cents','estimated','due_date','cadence','anchor','amount_cents','state','recurring_id','planning_goal_id','source_account_id','source_merchant_key','featured'))
   OR payload->>'type' NOT IN('bill','reserve','goal','contribution') OR payload->>'type' IS NULL OR char_length(trim(coalesce(payload->>'name',''))) NOT BETWEEN 1 AND 60
   OR payload->>'state' NOT IN('draft','saving','paused','purchase-recorded') OR payload->>'state' IS NULL
   OR payload->>'cadence' NOT IN('once','weekly','fortnightly','monthly','quarterly','annual') OR payload->>'cadence' IS NULL THEN RAISE EXCEPTION 'budget_invalid_item';END IF;
  amount:=public.budget_money(payload->'amount_cents');
  IF payload->'target_cents'<>'null'::jsonb THEN PERFORM public.budget_money(payload->'target_cents');END IF;
  IF payload->>'type'='goal' AND payload->>'state'='saving' AND payload->>'target_cents' IS NULL THEN RAISE EXCEPTION 'budget_invalid_target';END IF;
  IF coalesce(payload->>'anchor','')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'budget_invalid_date';END IF;
  PERFORM (payload->>'anchor')::date;
  IF payload->>'due_date' IS NOT NULL THEN PERFORM (payload->>'due_date')::date;END IF;
  IF jsonb_typeof(payload->'estimated') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'budget_invalid_item';END IF;
  IF payload->>'recurring_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.recurring_series_overrides WHERE id=(payload->>'recurring_id')::uuid AND tenant_id=p_tenant) THEN RAISE EXCEPTION 'budget_invalid_recurring';END IF;
  -- Planning remains contextual only; no Planning mutation occurs here.
  IF payload ? 'featured' AND jsonb_typeof(payload->'featured') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'budget_invalid_item';END IF;
  IF coalesce((payload->>'featured')::boolean,false) THEN
   IF payload->>'type'<>'goal' OR EXISTS(SELECT 1 FROM (SELECT DISTINCT ON(x.line_id) x.line_id,x.payload FROM public.budget_item_revisions x WHERE x.plan_id=plan.id ORDER BY x.line_id,x.version DESC) r WHERE r.line_id<>lineid AND coalesce((r.payload->>'featured')::boolean,false) AND NOT coalesce((r.payload->>'voided')::boolean,false)) THEN RAISE EXCEPTION 'budget_invalid_featured_goal';END IF;
  END IF;
  IF (payload->>'source_account_id' IS NULL)<>(payload->>'source_merchant_key' IS NULL) THEN RAISE EXCEPTION 'budget_invalid_recurring';END IF;
  IF payload->>'source_account_id' IS NOT NULL AND (payload->>'type'<>'bill' OR char_length(payload->>'source_merchant_key') NOT BETWEEN 1 AND 240 OR NOT EXISTS(SELECT 1 FROM public.budget_account_memberships m JOIN public.accounts a ON a.id=m.account_id AND a.tenant_id=p_tenant AND a.currency='AUD' WHERE m.plan_id=plan.id AND m.role='activity' AND m.account_id=(payload->>'source_account_id')::uuid AND m.end_date IS NULL)) THEN RAISE EXCEPTION 'budget_invalid_recurring';END IF;
  IF payload->>'planning_goal_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.planning_goals WHERE tenant_id=p_tenant AND id=(payload->>'planning_goal_id')::uuid) THEN RAISE EXCEPTION 'budget_invalid_planning_link';END IF;
  SELECT * INTO line FROM public.budget_lines WHERE tenant_id=p_tenant AND plan_id=plan.id AND id=lineid;
  creating:=NOT FOUND;
  IF creating THEN
   INSERT INTO public.budget_lines(id,tenant_id,plan_id,kind,name,opening_cents,opening_date)
   VALUES(lineid,p_tenant,plan.id,CASE payload->>'type' WHEN 'bill' THEN 'fixed' WHEN 'contribution' THEN 'contribution' ELSE 'reserve' END,payload->>'name',public.budget_money(p_input->'opening_cents'),(p_input->>'opening_date')::date);
   IF (p_input->>'opening_date')::date<period.start_date OR (p_input->>'opening_date')::date>=period.end_date OR (payload->>'type' IN('bill','contribution') AND public.budget_money(p_input->'opening_cents')<>0) THEN RAISE EXCEPTION 'budget_invalid_opening';END IF;
  ELSIF line.kind IS DISTINCT FROM (CASE payload->>'type' WHEN 'bill' THEN 'fixed' WHEN 'contribution' THEN 'contribution' ELSE 'reserve' END) THEN RAISE EXCEPTION 'budget_invalid_item';
  END IF;
  SELECT * INTO config FROM public.budget_item_revisions WHERE line_id=lineid ORDER BY version DESC LIMIT 1;
  before_data:=before_data||jsonb_build_object('line_id',lineid,'item',coalesce(config.payload,'null'::jsonb),'new_line',creating);
  schedule_id:=CASE WHEN config.payload->>'cadence'=payload->>'cadence' AND config.payload->>'anchor'=payload->>'anchor' THEN (config.payload->>'schedule_id')::uuid ELSE gen_random_uuid() END;
  payload:=payload||jsonb_build_object('schedule_id',schedule_id);
  INSERT INTO public.budget_item_revisions(tenant_id,plan_id,line_id,period_id,version,payload,actor_id) VALUES(p_tenant,plan.id,lineid,period.id,new_v,payload,p_actor) RETURNING id INTO other;
  SELECT coalesce(a.amount_cents,0) INTO current_amount FROM public.budget_allocations a WHERE a.revision_id=rev.id AND a.line_id=lineid;current_amount:=coalesce(current_amount,0);
  future_amount:=CASE WHEN payload->>'state' IN('draft','paused','purchase-recorded') THEN 0 ELSE amount END;
  IF payload->>'state'='saving' THEN
   SELECT amount*count(*) INTO oldamount FROM public.budget_occurrence_dates((payload->>'anchor')::date,payload->>'cadence',period.start_date,period.end_date);
   SELECT future_amount*count(*) INTO future_amount FROM public.budget_occurrence_dates((payload->>'anchor')::date,payload->>'cadence',period.end_date,CASE WHEN period.frequency='monthly' THEN (period.end_date+interval '1 month')::date ELSE period.end_date+14 END);
   amount:=oldamount;
  END IF;
  -- Pausing preserves the existing current-period reserve; stopping future allocations is explicit.
  IF payload->>'state' IN('paused','purchase-recorded') THEN amount:=current_amount;END IF;
  IF payload->>'state'='draft' THEN amount:=0;END IF;
  -- Presentation/context/target edits must not erase an explicit period-only
  -- addition. Recalculate allocations only when contribution terms change.
  IF config.id IS NOT NULL AND jsonb_build_array(config.payload->'amount_cents',config.payload->'state',config.payload->'cadence',config.payload->'anchor')
    =jsonb_build_array(payload->'amount_cents',payload->'state',payload->'cadence',payload->'anchor') THEN
   amount:=current_amount;
   SELECT a.amount_cents INTO future_amount FROM public.budget_allocations a WHERE a.revision_id=future.id AND a.line_id=lineid;
  END IF;
  SELECT jsonb_agg(jsonb_build_object('line_id',l.id,'amount_cents',CASE WHEN l.id=lineid THEN amount ELSE coalesce(a.amount_cents,0) END)) INTO lines
   FROM public.budget_lines l LEFT JOIN public.budget_allocations a ON a.line_id=l.id AND a.revision_id=rev.id WHERE l.plan_id=plan.id;
  SELECT jsonb_agg(jsonb_build_object('line_id',l.id,'amount_cents',CASE WHEN l.id=lineid THEN future_amount ELSE coalesce(a.amount_cents,0) END)) INTO future_lines
   FROM public.budget_lines l LEFT JOIN public.budget_allocations a ON a.line_id=l.id AND a.revision_id=future.id WHERE l.plan_id=plan.id;
  rid:=public.budget_write_revision(p_tenant,plan.id,period.id,new_v,source_v,rev.income_cents,rev.drawdown_cents,lines,gap);
  tid:=public.budget_write_revision(p_tenant,plan.id,NULL,new_v,source_v,future.income_cents,0,future_lines,gap);
  result:=jsonb_build_object('line_id',lineid,'item_revision',other);
 ELSIF action IN('claim_source','confirm_funding') THEN
  lineid:=nullif(p_input->>'line_id','')::uuid;
  IF lineid IS NOT NULL THEN SELECT * INTO line FROM public.budget_lines WHERE id=lineid AND plan_id=plan.id AND tenant_id=p_tenant;IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;END IF;
  IF action='confirm_funding' THEN
   IF char_length(trim(coalesce(p_input->>'note',''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'budget_invalid_evidence';END IF;
   INSERT INTO public.budget_manual_funding(id,tenant_id,amount_cents,confirmed_date,note,actor_id)
   VALUES((p_input->>'manual_id')::uuid,p_tenant,public.budget_money(p_input->'capacity_cents'),(p_input->>'confirmed_date')::date,p_input->>'note',p_actor) ON CONFLICT(id) DO NOTHING;
   IF NOT EXISTS(SELECT 1 FROM public.budget_manual_funding m WHERE m.id=(p_input->>'manual_id')::uuid AND m.tenant_id=p_tenant AND m.amount_cents=public.budget_money(p_input->'capacity_cents') AND m.confirmed_date=(p_input->>'confirmed_date')::date AND m.note=p_input->>'note') THEN RAISE EXCEPTION 'budget_request_conflict';END IF;
  END IF;
  SELECT * INTO src FROM (
   SELECT a.source_key,a.source_type,a.booking_date,a.capacity,a.fingerprint,a.identity FROM public.budget_activity(p_tenant,plan.id,'0001-01-01','9999-12-31') a
   UNION ALL SELECT * FROM public.budget_funding_sources(p_tenant,plan.id,'0001-01-01','9999-12-31')
  ) s WHERE s.source_key=CASE WHEN action='confirm_funding' THEN 'manual:'||(p_input->>'manual_id') ELSE p_input->>'source_key' END;
  IF NOT FOUND THEN RAISE EXCEPTION 'budget_invalid_source';END IF;
  amount:=public.budget_money(p_input->'amount_cents');IF amount=0 OR src.booking_date>=period.end_date THEN RAISE EXCEPTION 'budget_invalid_evidence';END IF;
  IF p_input->>'purpose' NOT IN('expense','purchase','refund','exclude','funding') OR p_input->>'purpose' IS NULL THEN RAISE EXCEPTION 'budget_invalid_evidence';END IF;
  IF p_input->>'purpose'='funding' THEN
   IF lineid IS NULL OR line.kind NOT IN('reserve','contribution') OR src.source_type NOT IN('bank-observed','user-confirmed') THEN RAISE EXCEPTION 'budget_invalid_funding';END IF;
  ELSE
   IF (p_input->>'purpose'='exclude') IS DISTINCT FROM (lineid IS NULL) THEN RAISE EXCEPTION 'budget_invalid_evidence';END IF;
   IF src.source_type NOT IN('expense','refund') OR (p_input->>'purpose'='refund') IS DISTINCT FROM (src.source_type='refund') THEN RAISE EXCEPTION 'budget_invalid_source';END IF;
   IF lineid IS NOT NULL AND line.kind='contribution' THEN RAISE EXCEPTION 'budget_invalid_source';END IF;
   IF lineid IS NOT NULL AND src.booking_date<line.opening_date THEN RAISE EXCEPTION 'budget_invalid_date';END IF;
  END IF;
  SELECT coalesce(sum(c.amount_cents),0) INTO claimed FROM public.budget_source_claims c WHERE c.tenant_id=p_tenant AND c.source_key=src.source_key AND c.source_fingerprint=src.fingerprint AND NOT EXISTS(SELECT 1 FROM public.budget_claim_reversals r WHERE r.claim_id=c.id);
  IF p_input->>'purpose'='purchase' AND NOT EXISTS(SELECT 1 FROM public.budget_item_revisions r WHERE r.id=(SELECT x.id FROM public.budget_item_revisions x WHERE x.line_id=lineid ORDER BY x.version DESC LIMIT 1) AND r.payload->>'type'='goal') THEN RAISE EXCEPTION 'budget_invalid_purchase';END IF;
  IF claimed+amount>src.capacity THEN RAISE EXCEPTION 'budget_source_capacity';END IF;
  IF p_input->>'purpose'='refund' THEN
   SELECT * INTO parent FROM public.budget_source_claims WHERE tenant_id=p_tenant AND plan_id=plan.id AND id=(p_input->>'related_claim_id')::uuid AND line_id=lineid AND purpose IN('expense','purchase');
   IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.budget_live_claims(p_tenant,plan.id) c WHERE c.id=parent.id AND c.valid) OR src.booking_date<parent.source_date THEN RAISE EXCEPTION 'budget_invalid_refund';END IF;
   SELECT coalesce(sum(c.amount_cents),0) INTO total FROM public.budget_live_claims(p_tenant,plan.id) c WHERE c.related_claim_id=parent.id AND c.valid;
   IF total+amount>parent.amount_cents THEN RAISE EXCEPTION 'budget_source_capacity';END IF;
  END IF;
  IF line.kind='fixed' THEN
   SELECT * INTO config FROM public.budget_item_revisions WHERE line_id=lineid ORDER BY version DESC LIMIT 1;
   IF p_input->>'purpose'='expense' AND config.id IS NOT NULL THEN
    IF p_input->>'occurrence_revision_id' IS DISTINCT FROM config.payload->>'schedule_id' OR NOT EXISTS(SELECT 1 FROM public.budget_occurrence_dates((config.payload->>'anchor')::date,config.payload->>'cadence',period.start_date,period.end_date) d WHERE d=(p_input->>'occurrence_date')::date) THEN RAISE EXCEPTION 'budget_invalid_occurrence';END IF;
   END IF;
  END IF;
  INSERT INTO public.budget_source_claims(tenant_id,plan_id,line_id,purpose,source_key,source_fingerprint,source_date,source_identity,amount_cents,occurrence_date,occurrence_revision_id,related_claim_id,source_revision,actor_id)
  VALUES(p_tenant,plan.id,lineid,p_input->>'purpose',src.source_key,src.fingerprint,src.booking_date,src.identity,amount,nullif(p_input->>'occurrence_date','')::date,nullif(p_input->>'occurrence_revision_id','')::uuid,parent.id,source_v,p_actor) RETURNING id INTO other;
  result:=jsonb_build_object('claim_id',other);before_data:=before_data||jsonb_build_object('claim_id',other);
  IF p_input->>'purpose'='purchase' AND coalesce((p_input->>'complete')::boolean,false) THEN
   SELECT * INTO config FROM public.budget_item_revisions WHERE line_id=lineid ORDER BY version DESC LIMIT 1;
   IF config.payload->>'type' IS DISTINCT FROM 'goal' THEN RAISE EXCEPTION 'budget_invalid_purchase';END IF;
   before_data:=before_data||jsonb_build_object('completed_item',config.payload,'line_id',lineid);
   INSERT INTO public.budget_item_revisions(tenant_id,plan_id,line_id,period_id,version,payload,actor_id)
    VALUES(p_tenant,plan.id,lineid,period.id,new_v,config.payload||jsonb_build_object('state','purchase-recorded'),p_actor);
   SELECT jsonb_agg(jsonb_build_object('line_id',a.line_id,'amount_cents',CASE WHEN a.line_id=lineid THEN 0 ELSE a.amount_cents END)) INTO lines FROM public.budget_allocations a WHERE revision_id=future.id;
   tid:=public.budget_write_revision(p_tenant,plan.id,NULL,new_v,source_v,future.income_cents,0,lines,true);
  END IF;
 ELSIF action='reverse_claim' THEN
  SELECT * INTO claim FROM public.budget_source_claims WHERE id=(p_input->>'claim_id')::uuid AND tenant_id=p_tenant AND plan_id=plan.id;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.budget_claim_reversals WHERE claim_id=claim.id) OR EXISTS(SELECT 1 FROM public.budget_live_claims(p_tenant,plan.id) c WHERE c.related_claim_id=claim.id) THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
  INSERT INTO public.budget_claim_reversals(tenant_id,plan_id,claim_id,actor_id) VALUES(p_tenant,plan.id,claim.id,p_actor);
  before_data:=before_data||jsonb_build_object('claim',to_jsonb(claim));
 ELSIF action='release_reserve' THEN
  lineid:=(p_input->>'from_line_id')::uuid;other:=(p_input->>'to_line_id')::uuid;amount:=public.budget_money(p_input->'amount_cents');
  SELECT * INTO line FROM public.budget_lines WHERE id=lineid AND tenant_id=p_tenant AND plan_id=plan.id AND kind='reserve';
  IF NOT FOUND OR lineid=other OR amount=0 OR NOT EXISTS(SELECT 1 FROM public.budget_lines WHERE id=other AND tenant_id=p_tenant AND plan_id=plan.id AND kind IN('reserve','everyday')) THEN RAISE EXCEPTION 'budget_invalid_release';END IF;
  SELECT (value->>'reserve_cents')::numeric INTO total FROM jsonb_array_elements(public.budget_details(p_tenant,p_actor,plan.id,period.id,source_v,plan.version)->'items') WHERE value->>'line_id'=lineid::text;
  IF amount>total THEN RAISE EXCEPTION 'budget_source_capacity';END IF;
  INSERT INTO public.budget_reserve_moves(tenant_id,plan_id,period_id,from_line_id,to_line_id,amount_cents,effective_date,actor_id)
   VALUES(p_tenant,plan.id,period.id,lineid,other,amount,greatest(period.start_date,line.opening_date,(SELECT opening_date FROM public.budget_lines WHERE id=other)),p_actor) RETURNING id INTO other;
  before_data:=before_data||jsonb_build_object('reserve_move',other);
 ELSIF action='move_allocation' THEN
  lineid:=(p_input->>'from_line_id')::uuid;other:=(p_input->>'to_line_id')::uuid;amount:=public.budget_money(p_input->'amount_cents');
  IF amount=0 OR lineid=other THEN RAISE EXCEPTION 'budget_invalid_move';END IF;
  SELECT * INTO line FROM public.budget_lines WHERE id=lineid AND plan_id=plan.id AND tenant_id=p_tenant;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.budget_lines WHERE id=other AND plan_id=plan.id AND tenant_id=p_tenant) THEN RAISE EXCEPTION 'budget_invalid_move';END IF;
  SELECT amount_cents INTO current_amount FROM public.budget_allocations WHERE revision_id=rev.id AND line_id=lineid;
  -- Only unused new allocation moves here; opening reserve releases need their own disposition flow.
  SELECT coalesce(sum(CASE WHEN c.purpose='refund' THEN -c.amount_cents ELSE c.amount_cents END),0) INTO claimed FROM public.budget_live_claims(p_tenant,plan.id) c WHERE c.valid AND c.line_id=lineid AND c.purpose IN('expense','purchase','refund') AND c.source_date>=period.start_date AND c.source_date<period.end_date;
  IF line.kind='everyday' THEN
   SELECT coalesce(sum(a.capacity-coalesce((SELECT sum(c.amount_cents) FROM public.budget_live_claims(p_tenant,plan.id) c WHERE c.valid AND c.source_key=a.source_key AND c.purpose<>'funding'),0)),0) INTO claimed FROM public.budget_activity(p_tenant,plan.id,period.start_date,period.end_date) a WHERE a.source_type='expense';
  END IF;
  IF amount>current_amount OR amount>greatest(0,current_amount-claimed) THEN RAISE EXCEPTION 'budget_source_capacity';END IF;
  SELECT jsonb_agg(jsonb_build_object('line_id',a.line_id,'amount_cents',CASE a.line_id WHEN lineid THEN a.amount_cents-amount WHEN other THEN a.amount_cents+amount ELSE a.amount_cents END)) INTO lines FROM public.budget_allocations a WHERE revision_id=rev.id;
  rid:=public.budget_write_revision(p_tenant,plan.id,period.id,new_v,source_v,rev.income_cents,rev.drawdown_cents,lines,true);
 ELSIF action='set_limits' THEN
  payload:=p_input->'limits';IF jsonb_typeof(payload) IS DISTINCT FROM 'array' OR jsonb_array_length(payload)>50 THEN RAISE EXCEPTION 'budget_invalid_limits';END IF;
  IF (SELECT count(DISTINCT (x->>'id')::uuid) FROM jsonb_array_elements(payload) x)<>jsonb_array_length(payload) THEN RAISE EXCEPTION 'budget_invalid_limits';END IF;
  total:=0;
  FOR item IN SELECT value FROM jsonb_array_elements(payload) LOOP
   IF NOT EXISTS(SELECT 1 FROM public.taxonomy_categories WHERE id=item->>'category_id') THEN RAISE EXCEPTION 'budget_invalid_category';END IF;
   IF item->>'subcategory_id' IS NOT NULL AND (item->>'custom_subcategory_id' IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.taxonomy_subcategories WHERE id=item->>'subcategory_id' AND category_id=item->>'category_id')) THEN RAISE EXCEPTION 'budget_invalid_category';END IF;
   IF item->>'custom_subcategory_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tenant_subcategories WHERE id=(item->>'custom_subcategory_id')::uuid AND tenant_id=p_tenant AND category_id=item->>'category_id') THEN RAISE EXCEPTION 'budget_invalid_category';END IF;
   IF (SELECT count(*) FROM jsonb_array_elements(payload) x WHERE x->>'category_id'=item->>'category_id' AND ((x->>'subcategory_id' IS NULL AND x->>'custom_subcategory_id' IS NULL) OR (item->>'subcategory_id' IS NULL AND item->>'custom_subcategory_id' IS NULL) OR (x->>'subcategory_id'=item->>'subcategory_id') OR (x->>'custom_subcategory_id'=item->>'custom_subcategory_id')))>1 THEN RAISE EXCEPTION 'budget_invalid_overlap';END IF;
   total:=total+public.budget_money(item->'amount_cents');
  END LOOP;
  SELECT a.amount_cents INTO current_amount FROM public.budget_allocations a JOIN public.budget_lines l ON l.id=a.line_id WHERE a.revision_id=rev.id AND l.kind='everyday';
  IF total>current_amount THEN RAISE EXCEPTION 'budget_invalid_limits';END IF;
  SELECT r.payload INTO candidate FROM public.budget_limit_revisions r WHERE r.period_id=period.id ORDER BY r.version DESC LIMIT 1;
  before_data:=before_data||jsonb_build_object('limits',coalesce(candidate,'[]'));
  INSERT INTO public.budget_limit_revisions(tenant_id,plan_id,period_id,version,payload,actor_id) VALUES(p_tenant,plan.id,period.id,new_v,payload,p_actor);
 ELSIF action='undo' THEN
  compensation:=original.id;before_data:=original.after_state;
  IF original.action='release_reserve' THEN
   INSERT INTO public.budget_reserve_moves(tenant_id,plan_id,period_id,from_line_id,to_line_id,amount_cents,effective_date,actor_id)
    SELECT p_tenant,plan.id,period.id,m.to_line_id,m.from_line_id,m.amount_cents,m.effective_date,p_actor FROM public.budget_reserve_moves m WHERE m.id=(original.before_state->>'reserve_move')::uuid;
  ELSIF original.action IN('claim_source','confirm_funding') THEN
   INSERT INTO public.budget_claim_reversals(tenant_id,plan_id,claim_id,actor_id) VALUES(p_tenant,plan.id,(original.before_state->>'claim_id')::uuid,p_actor);
   IF original.before_state ? 'completed_item' THEN
    INSERT INTO public.budget_item_revisions(tenant_id,plan_id,line_id,period_id,version,payload,actor_id)
     VALUES(p_tenant,plan.id,(original.before_state->>'line_id')::uuid,period.id,new_v,original.before_state->'completed_item',p_actor);
    SELECT * INTO future FROM public.budget_revisions WHERE id=(original.before_state->>'template_revision')::uuid;
    SELECT jsonb_agg(jsonb_build_object('line_id',line_id,'amount_cents',amount_cents)) INTO lines FROM public.budget_allocations WHERE revision_id=future.id;
    tid:=public.budget_write_revision(p_tenant,plan.id,NULL,new_v,source_v,future.income_cents,0,lines,future.accepted_gap);
   END IF;
  ELSIF original.action='reverse_claim' THEN
   payload:=original.before_state->'claim';
   INSERT INTO public.budget_source_claims(tenant_id,plan_id,line_id,purpose,source_key,source_fingerprint,source_date,source_identity,amount_cents,occurrence_date,occurrence_revision_id,related_claim_id,source_revision,actor_id)
   VALUES(p_tenant,plan.id,(payload->>'line_id')::uuid,payload->>'purpose',payload->>'source_key',payload->>'source_fingerprint',(payload->>'source_date')::date,payload->'source_identity',(payload->>'amount_cents')::bigint,(payload->>'occurrence_date')::date,(payload->>'occurrence_revision_id')::uuid,(payload->>'related_claim_id')::uuid,source_v,p_actor);
  ELSIF original.action='set_limits' THEN
   INSERT INTO public.budget_limit_revisions(tenant_id,plan_id,period_id,version,payload,actor_id) VALUES(p_tenant,plan.id,period.id,new_v,original.before_state->'limits',p_actor);
  ELSE
   IF original.action='save_item' THEN
    lineid:=(original.before_state->>'line_id')::uuid;payload:=original.before_state->'item';
    IF payload='null'::jsonb THEN SELECT r.payload||jsonb_build_object('state','paused','amount_cents',0,'voided',coalesce((original.before_state->>'new_line')::boolean,false)) INTO payload FROM public.budget_item_revisions r WHERE line_id=lineid ORDER BY version DESC LIMIT 1;END IF;
    INSERT INTO public.budget_item_revisions(tenant_id,plan_id,line_id,period_id,version,payload,actor_id) VALUES(p_tenant,plan.id,lineid,period.id,new_v,payload,p_actor);
   END IF;
   SELECT * INTO rev FROM public.budget_revisions WHERE id=(original.before_state->>'period_revision')::uuid;
   SELECT jsonb_agg(jsonb_build_object('line_id',l.id,'amount_cents',coalesce(a.amount_cents,0))) INTO lines FROM public.budget_lines l LEFT JOIN public.budget_allocations a ON a.line_id=l.id AND a.revision_id=rev.id WHERE l.plan_id=plan.id;
   rid:=public.budget_write_revision(p_tenant,plan.id,period.id,new_v,source_v,rev.income_cents,rev.drawdown_cents,lines,rev.accepted_gap);
   SELECT * INTO future FROM public.budget_revisions WHERE id=(original.before_state->>'template_revision')::uuid;
   SELECT jsonb_agg(jsonb_build_object('line_id',l.id,'amount_cents',coalesce(a.amount_cents,0))) INTO lines FROM public.budget_lines l LEFT JOIN public.budget_allocations a ON a.line_id=l.id AND a.revision_id=future.id WHERE l.plan_id=plan.id;
   tid:=public.budget_write_revision(p_tenant,plan.id,NULL,new_v,source_v,future.income_cents,0,lines,future.accepted_gap);
  END IF;
 END IF;
 -- Every edit must preserve optional category partitions within the new everyday pool.
 SELECT r.payload INTO candidate FROM public.budget_limit_revisions r WHERE r.period_id=period.id ORDER BY r.version DESC LIMIT 1;
 IF candidate IS NOT NULL THEN
  SELECT coalesce(sum(public.budget_money(x->'amount_cents')),0) INTO total FROM jsonb_array_elements(candidate) x;
  SELECT a.amount_cents INTO current_amount FROM public.budget_allocations a JOIN public.budget_lines l ON l.id=a.line_id WHERE a.revision_id=rid AND l.kind='everyday';
  IF total>current_amount THEN RAISE EXCEPTION 'budget_invalid_limits';END IF;
 END IF;
 UPDATE public.budget_periods SET current_revision_id=rid WHERE id=period.id;
 UPDATE public.budget_plans SET version=new_v,template_revision_id=tid WHERE id=plan.id;
 -- Range-check all derived amounts before committing, not on the next browser read.
 PERFORM public.budget_details(p_tenant,p_actor,plan.id,period.id,source_v,new_v);
 after_data:=jsonb_build_object('plan_id',plan.id,'period_id',period.id,'plan_version',new_v::text,'period_revision',rid,'template_revision',tid);
 receipt:=jsonb_build_object('request_id',p_request,'operation_id',op,'status','committed','source_revision',source_v::text,'method','budget-foundation-v1','result',after_data||result);
 INSERT INTO public.budget_operations(id,tenant_id,actor_id,request_id,payload_hash,action,before_state,after_state,outcome,undo_of) VALUES(op,p_tenant,p_actor,p_request,hash,action,before_data,after_data,receipt,compensation);
 RETURN receipt;
END $$;

DO $$ DECLARE tbl text;f record;BEGIN
 FOREACH tbl IN ARRAY ARRAY['budget_control_events','budget_control_moves'] LOOP
  IF NOT(SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||tbl)::regclass) OR has_table_privilege('anon','public.'||tbl,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_table_privilege('authenticated','public.'||tbl,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'Budget control grant leak';END IF;
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND left(p.proname,7)='budget_' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
