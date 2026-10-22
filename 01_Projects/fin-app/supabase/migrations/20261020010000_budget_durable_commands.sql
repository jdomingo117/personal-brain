-- Service-only Budget boundary. Browser intent is revalidated and recomputed here.
CREATE FUNCTION public.budget_assert_owner(p_tenant uuid,p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM 1 FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor AND role='owner' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='budget_forbidden';END IF;
END $$;
CREATE FUNCTION public.budget_lock_source(p_tenant uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v bigint; BEGIN
  INSERT INTO public.budget_source_versions(tenant_id) VALUES(p_tenant) ON CONFLICT DO NOTHING;
  SELECT revision INTO v FROM public.budget_source_versions WHERE tenant_id=p_tenant FOR UPDATE;
  RETURN v;
END $$;
CREATE FUNCTION public.budget_money(p_value jsonb) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE v numeric; BEGIN
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'budget_invalid_money';END IF;
  v:=p_value::text::numeric;
  IF v<>trunc(v) OR v<0 OR v>9007199254740991 THEN RAISE EXCEPTION 'budget_invalid_money';END IF;
  RETURN v::bigint;
END $$;
CREATE FUNCTION public.budget_validate_setup(p_tenant uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item jsonb; ids uuid[]; distinct_count int; total numeric:=0; opening_total numeric:=0; resources numeric; start_on date; end_on date; anchor_on date;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>262144 THEN RAISE EXCEPTION 'budget_invalid_setup';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN('currency','timezone','frequency','start_date','anchor','account_ids','destination_account_ids','income_cents','opening_drawdown_cents','lines')) THEN RAISE EXCEPTION 'budget_invalid_setup';END IF;
  IF p_payload->>'currency' IS DISTINCT FROM 'AUD' OR p_payload->>'frequency' NOT IN('monthly','fortnightly')
    OR p_payload->>'frequency' IS NULL THEN RAISE EXCEPTION 'budget_invalid_scope';END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_payload->>'timezone') THEN RAISE EXCEPTION 'budget_invalid_timezone';END IF;
  IF coalesce(p_payload->>'start_date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'budget_invalid_date';END IF;
  start_on:=(p_payload->>'start_date')::date;
  IF start_on<'0001-01-01' OR start_on>'9999-12-31' THEN RAISE EXCEPTION 'budget_invalid_date';END IF;
  IF p_payload->>'frequency'='monthly' THEN
    start_on:=date_trunc('month',start_on)::date;end_on:=(start_on+interval '1 month')::date;anchor_on:=start_on;
  ELSE
    IF coalesce(p_payload->>'anchor','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'budget_invalid_date';END IF;
    anchor_on:=(p_payload->>'anchor')::date;
    start_on:=anchor_on+(floor((start_on-anchor_on)::numeric/14)::int*14);end_on:=start_on+14;
  END IF;
  IF start_on<'0001-01-01' OR end_on>'9999-12-31' THEN RAISE EXCEPTION 'budget_invalid_date';END IF;
  IF jsonb_typeof(p_payload->'account_ids') IS DISTINCT FROM 'array' OR jsonb_typeof(p_payload->'destination_account_ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'budget_invalid_scope';END IF;
  FOR item IN SELECT p_payload->'account_ids' UNION ALL SELECT p_payload->'destination_account_ids' LOOP
    SELECT coalesce(array_agg(value::uuid),ARRAY[]::uuid[]),count(DISTINCT value::uuid) INTO ids,distinct_count FROM jsonb_array_elements_text(item);
    IF cardinality(ids)<>distinct_count THEN RAISE EXCEPTION 'budget_invalid_scope';END IF;
    IF EXISTS(SELECT 1 FROM unnest(ids) AS requested(id) LEFT JOIN public.accounts a ON a.id=requested.id AND a.tenant_id=p_tenant AND a.currency='AUD' WHERE a.id IS NULL) THEN RAISE EXCEPTION 'budget_account_unavailable';END IF;
  END LOOP;
  IF jsonb_typeof(p_payload->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'lines')<1 THEN RAISE EXCEPTION 'budget_invalid_lines';END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_payload->'lines') l WHERE l->>'kind'='everyday')<>1 THEN RAISE EXCEPTION 'budget_invalid_lines';END IF;
  IF (SELECT count(DISTINCT (l->>'id')::uuid) FROM jsonb_array_elements(p_payload->'lines') l)<>jsonb_array_length(p_payload->'lines') THEN RAISE EXCEPTION 'budget_invalid_lines';END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'lines') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'budget_invalid_lines';END IF;
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN('id','kind','name','allocation_cents','opening_cents')) THEN RAISE EXCEPTION 'budget_invalid_lines';END IF;
    IF item->>'kind' NOT IN('fixed','reserve','everyday','contribution') OR item->>'kind' IS NULL
      OR char_length(trim(coalesce(item->>'name',''))) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'budget_invalid_lines';END IF;
    total:=total+public.budget_money(item->'allocation_cents');
    opening_total:=opening_total+public.budget_money(item->'opening_cents');
    IF item->>'kind'<>'reserve' AND public.budget_money(item->'opening_cents')<>0 THEN RAISE EXCEPTION 'budget_invalid_opening';END IF;
  END LOOP;
  resources:=public.budget_money(p_payload->'income_cents')::numeric+public.budget_money(p_payload->'opening_drawdown_cents');
  IF total>9007199254740991 OR resources>9007199254740991 OR opening_total>9007199254740991 THEN RAISE EXCEPTION 'budget_overflow';END IF;
  RETURN jsonb_build_object('start_date',start_on,'end_date',end_on,'anchor',anchor_on,'resources_cents',resources,'allocated_cents',total,'unallocated_cents',resources-total,'opening_reserve_cents',opening_total);
END $$;

CREATE FUNCTION public.budget_write_revision(p_tenant uuid,p_plan uuid,p_period uuid,p_version bigint,p_source bigint,
 p_income bigint,p_drawdown bigint,p_lines jsonb,p_gap boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid:=gen_random_uuid(); total numeric; resources numeric;
BEGIN
  IF p_income<0 OR p_drawdown<0 OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'budget_invalid_revision';END IF;
  IF (SELECT count(*) FROM public.budget_lines WHERE tenant_id=p_tenant AND plan_id=p_plan)<>jsonb_array_length(p_lines)
    OR (SELECT count(DISTINCT (l->>'line_id')::uuid) FROM jsonb_array_elements(p_lines) l)<>jsonb_array_length(p_lines)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) l WHERE NOT EXISTS(SELECT 1 FROM public.budget_lines b WHERE b.id=(l->>'line_id')::uuid AND b.tenant_id=p_tenant AND b.plan_id=p_plan)) THEN RAISE EXCEPTION 'budget_invalid_lines';END IF;
  SELECT sum(public.budget_money(l->'amount_cents')) INTO total FROM jsonb_array_elements(p_lines) l;
  resources:=p_income::numeric+p_drawdown;
  IF total>9007199254740991 OR resources>9007199254740991 THEN RAISE EXCEPTION 'budget_overflow';END IF;
  IF total>resources AND NOT p_gap THEN RAISE EXCEPTION 'budget_gap_confirmation_required';END IF;
  INSERT INTO public.budget_revisions(id,tenant_id,plan_id,period_id,version,purpose,income_cents,drawdown_cents,source_revision,accepted_gap)
  VALUES(rid,p_tenant,p_plan,p_period,p_version,CASE WHEN p_period IS NULL THEN 'template' ELSE 'period' END,p_income,p_drawdown,p_source,p_gap);
  INSERT INTO public.budget_allocations(tenant_id,plan_id,revision_id,line_id,amount_cents)
    SELECT p_tenant,p_plan,rid,(l.value->>'line_id')::uuid,public.budget_money(l.value->'amount_cents')
    FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS l(value,position) ORDER BY l.position;
  RETURN rid;
END $$;

CREATE FUNCTION public.budget_command(p_tenant uuid,p_actor uuid,p_request uuid,p_input jsonb,p_enabled boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
SET lock_timeout='2s' SET statement_timeout='5s' AS $$
DECLARE source_v bigint; hash text; previous public.budget_operations%ROWTYPE; original public.budget_operations%ROWTYPE;
  draft public.budget_drafts%ROWTYPE; draft_value public.budget_draft_revisions%ROWTYPE;
  plan public.budget_plans%ROWTYPE; period public.budget_periods%ROWTYPE; old_revision public.budget_revisions%ROWTYPE;
  payload jsonb; facts jsonb; lines jsonb; before_data jsonb:='{}'; after_data jsonb:='{}'; result jsonb;
  op uuid:=gen_random_uuid(); pid uuid; period_id uuid; rid uuid; tid uuid; scope text; new_version bigint; compensation uuid;
  expected_source bigint; expected_plan bigint; expected_draft bigint; gap boolean;
BEGIN
  -- Gate first, then membership/plan/operation locks. Subsequent statements get post-wait RC snapshots.
  source_v:=public.budget_lock_source(p_tenant);
  PERFORM public.budget_assert_owner(p_tenant,p_actor);
  IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>262144 THEN RAISE EXCEPTION 'budget_invalid_command';END IF;
  hash:=encode(extensions.digest(p_input::text,'sha256'),'hex');
  SELECT * INTO previous FROM public.budget_operations WHERE tenant_id=p_tenant AND request_id=p_request;
  IF FOUND THEN
    IF previous.payload_hash<>hash THEN RAISE EXCEPTION 'budget_request_conflict';END IF;
    RETURN previous.outcome;
  END IF;
  IF p_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'budget_disabled';END IF;
  IF coalesce(char_length(p_input->>'expected_method'),0) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'budget_invalid_method';END IF;
  IF p_input->>'action'<>'save_draft' AND p_input->>'expected_method'<>'budget-foundation-v1' THEN RAISE EXCEPTION 'budget_stale_method';END IF;
  expected_source:=(p_input->>'expected_source')::bigint;
  IF expected_source IS NULL OR expected_source<0 THEN RAISE EXCEPTION 'budget_invalid_version';END IF;
  IF p_input->>'action'='save_draft' THEN
    INSERT INTO public.budget_drafts(tenant_id) VALUES(p_tenant) ON CONFLICT DO NOTHING;
    SELECT * INTO draft FROM public.budget_drafts WHERE tenant_id=p_tenant FOR UPDATE;
    expected_draft:=(p_input->>'expected_draft')::bigint;
    IF expected_draft IS NULL OR draft.version<>expected_draft THEN RAISE EXCEPTION 'budget_stale_draft';END IF;
    payload:=p_input->'payload';
    IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'budget_invalid_draft';END IF;
    before_data:=jsonb_build_object('draft_version',draft.version::text);
    new_version:=draft.version+1;
    INSERT INTO public.budget_draft_revisions(tenant_id,draft_id,version,payload,source_revision,method,actor_id)
      VALUES(p_tenant,draft.id,new_version,payload,expected_source,p_input->>'expected_method',p_actor);
    UPDATE public.budget_drafts SET version=new_version WHERE id=draft.id;
    after_data:=jsonb_build_object('draft_version',new_version::text);
    result:=jsonb_build_object('draft_id',draft.id,'draft_version',new_version::text,'source_revision',source_v::text,'stale',expected_source<>source_v OR p_input->>'expected_method'<>'budget-foundation-v1');
  ELSIF p_input->>'action'='activate' THEN
    IF source_v<>expected_source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
    SELECT * INTO draft FROM public.budget_drafts WHERE tenant_id=p_tenant FOR UPDATE;
    IF NOT FOUND OR draft.version IS DISTINCT FROM (p_input->>'expected_draft')::bigint THEN RAISE EXCEPTION 'budget_stale_draft';END IF;
    SELECT * INTO draft_value FROM public.budget_draft_revisions WHERE draft_id=draft.id AND version=draft.version;
    IF draft_value.source_revision<>source_v THEN RAISE EXCEPTION 'budget_stale_source';END IF;
    IF draft_value.method<>'budget-foundation-v1' THEN RAISE EXCEPTION 'budget_stale_method';END IF;
    payload:=draft_value.payload;facts:=public.budget_validate_setup(p_tenant,payload);
    IF EXISTS(SELECT 1 FROM public.budget_plans WHERE tenant_id=p_tenant AND state='active') THEN RAISE EXCEPTION 'budget_active_conflict';END IF;
    gap:=coalesce((p_input->>'accept_gap')::boolean,false);
    pid:=gen_random_uuid();period_id:=gen_random_uuid();
    INSERT INTO public.budget_plans(id,tenant_id,currency,timezone,frequency,anchor,state,version,created_by)
      VALUES(pid,p_tenant,'AUD',payload->>'timezone',payload->>'frequency',(facts->>'anchor')::date,'active',1,p_actor);
    INSERT INTO public.budget_periods(id,tenant_id,plan_id,start_date,end_date,timezone,frequency)
      VALUES(period_id,p_tenant,pid,(facts->>'start_date')::date,(facts->>'end_date')::date,payload->>'timezone',payload->>'frequency');
    INSERT INTO public.budget_lines(id,tenant_id,plan_id,kind,name,opening_cents,opening_date)
      SELECT (l->>'id')::uuid,p_tenant,pid,l->>'kind',l->>'name',public.budget_money(l->'opening_cents'),(facts->>'start_date')::date FROM jsonb_array_elements(payload->'lines') l;
    INSERT INTO public.budget_account_memberships(tenant_id,plan_id,account_id,original_account_id,role,start_date)
      SELECT p_tenant,pid,a::uuid,a::uuid,'activity',(facts->>'start_date')::date FROM jsonb_array_elements_text(payload->'account_ids') a
      UNION ALL SELECT p_tenant,pid,a::uuid,a::uuid,'destination',(facts->>'start_date')::date FROM jsonb_array_elements_text(payload->'destination_account_ids') a;
    SELECT jsonb_agg(jsonb_build_object('line_id',l->>'id','amount_cents',l->'allocation_cents')) INTO lines FROM jsonb_array_elements(payload->'lines') l;
    rid:=public.budget_write_revision(p_tenant,pid,period_id,1,source_v,public.budget_money(payload->'income_cents'),public.budget_money(payload->'opening_drawdown_cents'),lines,gap);
    -- Existing cash is a dated first-period input, not recurring income in every future period.
    tid:=public.budget_write_revision(p_tenant,pid,NULL,1,source_v,public.budget_money(payload->'income_cents'),0,lines,gap);
    UPDATE public.budget_periods SET activated_revision_id=rid,current_revision_id=rid WHERE id=period_id;
    UPDATE public.budget_plans SET template_revision_id=tid WHERE id=pid;
    after_data:=jsonb_build_object('plan_id',pid,'plan_version','1','period_id',period_id,'period_revision',rid,'template_revision',tid,'draft_version',draft.version::text);
    result:=after_data||facts||jsonb_build_object('future_unallocated_cents',(facts->>'unallocated_cents')::numeric-public.budget_money(payload->'opening_drawdown_cents'));
  ELSIF p_input->>'action'='revise' THEN
    IF source_v<>expected_source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
    SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=(p_input->>'plan_id')::uuid AND state='active' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
    expected_plan:=(p_input->>'expected_plan')::bigint;
    IF expected_plan IS NULL OR plan.version<>expected_plan THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
    SELECT * INTO period FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=plan.id AND id=(p_input->>'period_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
    scope:=p_input->>'scope';
    IF scope IS NULL OR scope NOT IN('period','period-and-future') THEN RAISE EXCEPTION 'budget_invalid_scope';END IF;
    before_data:=jsonb_build_object('plan_id',plan.id,'period_id',period.id,'period_revision',period.current_revision_id,'template_revision',plan.template_revision_id);
    new_version:=plan.version+1;gap:=coalesce((p_input->>'accept_gap')::boolean,false);
    rid:=public.budget_write_revision(p_tenant,plan.id,period.id,new_version,source_v,public.budget_money(p_input->'income_cents'),public.budget_money(p_input->'opening_drawdown_cents'),p_input->'lines',gap);
    tid:=plan.template_revision_id;
    IF scope='period-and-future' THEN tid:=public.budget_write_revision(p_tenant,plan.id,NULL,new_version,source_v,public.budget_money(p_input->'income_cents'),0,p_input->'lines',gap);END IF;
    UPDATE public.budget_periods SET current_revision_id=rid WHERE id=period.id;
    UPDATE public.budget_plans SET version=new_version,template_revision_id=tid WHERE id=plan.id;
    after_data:=jsonb_build_object('plan_id',plan.id,'period_id',period.id,'plan_version',new_version::text,'period_revision',rid,'template_revision',tid);
    result:=after_data;
  ELSIF p_input->>'action'='undo' THEN
    SELECT * INTO original FROM public.budget_operations WHERE tenant_id=p_tenant AND id=(p_input->>'operation_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
    IF original.action='undo' OR EXISTS(SELECT 1 FROM public.budget_operations WHERE undo_of=original.id) THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
    compensation:=original.id;
    before_data:=original.after_state;
    IF original.action='save_draft' THEN
      SELECT * INTO draft FROM public.budget_drafts WHERE tenant_id=p_tenant FOR UPDATE;
      IF draft.version IS DISTINCT FROM (original.after_state->>'draft_version')::bigint THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
      IF EXISTS(SELECT 1 FROM public.budget_operations WHERE tenant_id=p_tenant AND action='activate' AND after_state->>'draft_version'=draft.version::text) THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
      SELECT * INTO draft_value FROM public.budget_draft_revisions WHERE draft_id=draft.id AND version=(original.before_state->>'draft_version')::bigint;
      new_version:=draft.version+1;
      INSERT INTO public.budget_draft_revisions(tenant_id,draft_id,version,payload,source_revision,method,actor_id)
        VALUES(p_tenant,draft.id,new_version,coalesce(draft_value.payload,'{}'::jsonb),coalesce(draft_value.source_revision,source_v),coalesce(draft_value.method,'budget-foundation-v1'),p_actor);
      UPDATE public.budget_drafts SET version=new_version WHERE id=draft.id;
      after_data:=jsonb_build_object('draft_version',new_version::text);
    ELSE
      IF source_v<>expected_source OR source_v<>(original.outcome->>'source_revision')::bigint THEN RAISE EXCEPTION 'budget_stale_source';END IF;
      SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=(original.after_state->>'plan_id')::uuid AND state='active' FOR UPDATE;
      IF NOT FOUND OR plan.version IS DISTINCT FROM (original.after_state->>'plan_version')::bigint THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
      new_version:=plan.version+1;
      IF original.action='activate' THEN
        UPDATE public.budget_plans SET state='archived',version=new_version WHERE id=plan.id;
        after_data:=jsonb_build_object('plan_id',plan.id,'plan_version',new_version::text,'state','archived');
      ELSE
        SELECT * INTO period FROM public.budget_periods WHERE id=(original.before_state->>'period_id')::uuid AND tenant_id=p_tenant AND plan_id=plan.id;
        SELECT * INTO old_revision FROM public.budget_revisions WHERE id=(original.before_state->>'period_revision')::uuid AND tenant_id=p_tenant AND plan_id=plan.id;
        SELECT jsonb_agg(jsonb_build_object('line_id',line_id,'amount_cents',amount_cents)) INTO lines FROM public.budget_allocations WHERE revision_id=old_revision.id;
        rid:=public.budget_write_revision(p_tenant,plan.id,period.id,new_version,source_v,old_revision.income_cents,old_revision.drawdown_cents,lines,old_revision.accepted_gap);
        tid:=plan.template_revision_id;
        IF original.before_state->>'template_revision' IS DISTINCT FROM original.after_state->>'template_revision' THEN
          SELECT * INTO old_revision FROM public.budget_revisions WHERE id=(original.before_state->>'template_revision')::uuid AND tenant_id=p_tenant AND plan_id=plan.id;
          SELECT jsonb_agg(jsonb_build_object('line_id',line_id,'amount_cents',amount_cents)) INTO lines FROM public.budget_allocations WHERE revision_id=old_revision.id;
          tid:=public.budget_write_revision(p_tenant,plan.id,NULL,new_version,source_v,old_revision.income_cents,old_revision.drawdown_cents,lines,old_revision.accepted_gap);
        END IF;
        UPDATE public.budget_periods SET current_revision_id=rid WHERE id=period.id;
        UPDATE public.budget_plans SET template_revision_id=tid,version=new_version WHERE id=plan.id;
        after_data:=jsonb_build_object('plan_id',plan.id,'period_id',period.id,'plan_version',new_version::text,'period_revision',rid,'template_revision',tid);
      END IF;
    END IF;
    result:=after_data;
  ELSE RAISE EXCEPTION 'budget_invalid_action';
  END IF;
  result:=jsonb_build_object('request_id',p_request,'operation_id',op,'status','committed','source_revision',source_v::text,'method','budget-foundation-v1','result',result);
  INSERT INTO public.budget_operations(id,tenant_id,actor_id,request_id,payload_hash,action,before_state,after_state,outcome,undo_of)
    VALUES(op,p_tenant,p_actor,p_request,hash,p_input->>'action',before_data,after_data,result,compensation);
  RETURN result;
END $$;

DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'budget_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
    IF has_function_privilege('anon',f.signature,'EXECUTE') OR has_function_privilege('authenticated',f.signature,'EXECUTE') THEN RAISE EXCEPTION 'Budget function grant leak: %',f.signature;END IF;
  END LOOP;
END $$;
