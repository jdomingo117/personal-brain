-- Exact-projection prefix reuse. Contexts never cross an impact invocation;
-- all hypothetical writes roll back with their existing preview subtransaction.
-- Private derived slots remain bounded by actor/period, with no client grants.
ALTER TABLE public.budget_history_facts ADD COLUMN chain_context uuid,ADD COLUMN pool_state jsonb,ADD COLUMN partition_state jsonb;
ALTER FUNCTION public.budget_lifecycle_pool(uuid,uuid,uuid,uuid,bigint,bigint) RENAME TO budget_lifecycle_pool_reference;
ALTER FUNCTION public.budget_partition_chain(uuid,uuid,uuid,uuid,bigint,bigint) RENAME TO budget_partition_chain_reference;
CREATE FUNCTION public.budget_lifecycle_pool(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE p record;plan public.budget_plans%ROWTYPE;r public.budget_period_reviews%ROWTYPE;
 d jsonb;s jsonb;original jsonb;facts jsonb;selected jsonb;rows jsonb:='[]';
 opening numeric:=0;closing numeric:=0;raw numeric;mode text;asof date;valid boolean:=true;provisional boolean:=false;
 ctx uuid:=nullif(current_setting('halcyon.chain_context',true),'')::uuid;seed jsonb;seed_date date;role_name text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor) THEN RAISE EXCEPTION 'budget_forbidden';END IF;
 IF public.budget_lock_source(p_tenant)<>p_source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=p_plan;
 IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF plan.version<>p_version THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
 asof:=(now() AT TIME ZONE plan.timezone)::date;
 -- A context is only a request-local optimization, never authorization.
 PERFORM public.budget_history_status(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 SELECT role::text INTO role_name FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor;
 IF current_setting('halcyon.history_cache',true)<>'on' THEN ctx:=NULL;END IF;

 IF ctx IS NOT NULL THEN
  SELECT c.pool_state,b.start_date INTO seed,seed_date FROM public.budget_history_facts c
  JOIN public.budget_periods b ON b.id=c.period_id AND b.plan_id=c.plan_id AND b.tenant_id=c.tenant_id
  WHERE c.tenant_id=p_tenant AND c.plan_id=p_plan AND c.actor_id=p_actor AND c.actor_role=role_name
   AND c.source_revision=p_source AND c.plan_version=p_version AND c.method='history-v1'
   AND c.prepared_at>now()-interval '24 hours' AND c.chain_context=ctx AND c.pool_state IS NOT NULL
   AND b.start_date<=(SELECT start_date FROM public.budget_periods WHERE id=p_period AND plan_id=p_plan)
  ORDER BY b.start_date DESC LIMIT 1;
 END IF;

 IF seed IS NOT NULL THEN
  opening:=(seed->>'opening_next')::numeric;valid:=(seed->>'valid')::boolean;
  provisional:=(seed->>'provisional_next')::boolean;selected:=seed->'result';
 END IF;
 FOR p IN SELECT * FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=p_plan AND (seed_date IS NULL OR start_date>seed_date) AND start_date<=(SELECT start_date FROM public.budget_periods WHERE id=p_period AND plan_id=p_plan) ORDER BY start_date LOOP
  d:=public.budget_details_m4(p_tenant,p_actor,p_plan,p.id,p_source,p_version);
  s:=public.budget_query_m4(p_tenant,p_actor,jsonb_build_object('action','snapshot','plan_id',p_plan,'period_id',p.id));
  SELECT * INTO r FROM public.budget_period_reviews WHERE period_id=p.id ORDER BY version DESC LIMIT 1;
  mode:=coalesce(r.carry_mode,'fresh');
  valid:=valid AND (s->>'scope_valid')::boolean;
  SELECT (x->>'remaining_cents')::numeric INTO raw FROM jsonb_array_elements(d->'items') x WHERE x->>'kind'='everyday';
  closing:=opening+raw;
  IF abs(closing)>9007199254740991 OR abs(opening)>9007199254740991 THEN RAISE EXCEPTION 'budget_overflow';END IF;
  SELECT jsonb_build_object('income_cents',v.income_cents,'drawdown_cents',v.drawdown_cents,
   'allocations',(SELECT jsonb_agg(jsonb_build_object('line_id',a.line_id,'amount_cents',a.amount_cents) ORDER BY a.line_id) FROM public.budget_allocations a WHERE a.revision_id=v.id))
   INTO original FROM public.budget_revisions v WHERE v.id=p.activated_revision_id;
  facts:=jsonb_build_object('period_id',p.id,'start_date',p.start_date,'end_date',p.end_date,
   'original_plan',original,'latest_plan',jsonb_build_object('income_cents',s->'revision'->'income_cents','drawdown_cents',s->'revision'->'drawdown_cents','allocations',s->'lines'),
   'actuals',s->'actuals','items',d->'items','excluded_cents',d->'excluded_cents','unassigned_credit_cents',d->'unassigned_credit_cents',
   'opening_carry_cents',CASE WHEN valid THEN to_jsonb(opening) ELSE 'null'::jsonb END,
   'closing_everyday_cents',CASE WHEN valid THEN to_jsonb(closing) ELSE 'null'::jsonb END,
   'scope_valid',valid,'coverage_complete',(s->>'coverage_complete')::boolean AND EXISTS(SELECT 1 FROM public.budget_account_memberships m WHERE m.plan_id=p_plan AND m.role='activity' AND m.start_date<p.end_date AND (m.end_date IS NULL OR m.end_date>p.start_date)));
   selected:=jsonb_build_object('state',CASE WHEN p.end_date<=asof THEN 'past' WHEN p.start_date>asof THEN 'future' ELSE 'current' END,
    'as_of',asof,'carry_mode',mode,'provisional_carry',provisional OR NOT valid,'chain_valid',valid,
    'facts',facts,'review',CASE WHEN r.id IS NULL THEN 'null'::jsonb ELSE to_jsonb(r)-'version'-'source_revision'||jsonb_build_object('version',r.version::text,'source_revision',r.source_revision::text) END,
    'changed_since_review',r.id IS NOT NULL AND (r.source_revision<>p_source OR r.payload IS DISTINCT FROM facts));
  provisional:=provisional OR r.id IS NULL OR r.state<>'reviewed' OR r.source_revision<>p_source OR NOT (facts->>'coverage_complete')::boolean;
  opening:=CASE WHEN mode='carry' THEN closing ELSE 0 END;
  IF ctx IS NOT NULL THEN
   UPDATE public.budget_history_facts c SET chain_context=ctx,pool_state=jsonb_build_object('opening_next',opening,'valid',valid,'provisional_next',provisional,'result',selected),
    partition_state=CASE WHEN c.chain_context=ctx THEN c.partition_state ELSE NULL END
   WHERE c.tenant_id=p_tenant AND c.plan_id=p_plan AND c.period_id=p.id AND c.actor_id=p_actor
    AND c.actor_role=role_name AND c.source_revision=p_source AND c.plan_version=p_version AND c.method='history-v1';
  END IF;

 END LOOP;
 IF selected IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'start_date',b.start_date,'end_date',b.end_date,'state',coalesce(review_row.state,'not-reviewed')) ORDER BY b.start_date),'[]') INTO rows
 FROM public.budget_periods b LEFT JOIN LATERAL (SELECT state FROM public.budget_period_reviews WHERE period_id=b.id ORDER BY version DESC LIMIT 1) review_row ON true
 WHERE b.tenant_id=p_tenant AND b.plan_id=p_plan AND b.start_date<=(SELECT start_date FROM public.budget_periods WHERE id=p_period AND plan_id=p_plan);
 RETURN selected||jsonb_build_object('periods',rows,
 'previous_id',(SELECT id FROM public.budget_periods WHERE plan_id=p_plan AND end_date=(SELECT start_date FROM public.budget_periods WHERE id=p_period)),
 'next_id',(SELECT id FROM public.budget_periods WHERE plan_id=p_plan AND start_date=(SELECT end_date FROM public.budget_periods WHERE id=p_period)),
 'is_latest',NOT EXISTS(SELECT 1 FROM public.budget_periods WHERE plan_id=p_plan AND start_date>(SELECT start_date FROM public.budget_periods WHERE id=p_period)));
END $$;

CREATE FUNCTION public.budget_partition_chain(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET statement_timeout='8s' AS $$
DECLARE p record;d jsonb;s jsonb;r record;policy jsonb;previous jsonb:='{}';held jsonb:='{}';incoming jsonb;nextheld jsonb;closing jsonb;parts jsonb;flows jsonb;
 x jsonb;rule jsonb;k text;target text;amount numeric;priorheld numeric;raw numeric;total numeric;opening numeric;released numeric;mode text;valid boolean:=true;previous_mode text:='fresh';enabled boolean:=false;answer jsonb;
 ctx uuid:=nullif(current_setting('halcyon.chain_context',true),'')::uuid;seed jsonb;seed_date date;role_name text;
BEGIN
 -- A context is only a request-local optimization, never authorization.
 PERFORM public.budget_history_status(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 SELECT role::text INTO role_name FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor;
 IF current_setting('halcyon.history_cache',true)<>'on' THEN ctx:=NULL;END IF;

 IF ctx IS NOT NULL THEN
  SELECT c.partition_state,b.start_date INTO seed,seed_date FROM public.budget_history_facts c
  JOIN public.budget_periods b ON b.id=c.period_id AND b.plan_id=c.plan_id AND b.tenant_id=c.tenant_id
  WHERE c.tenant_id=p_tenant AND c.plan_id=p_plan AND c.actor_id=p_actor AND c.actor_role=role_name
   AND c.source_revision=p_source AND c.plan_version=p_version AND c.method='history-v1'
   AND c.prepared_at>now()-interval '24 hours' AND c.chain_context=ctx AND c.partition_state IS NOT NULL
   AND b.start_date<=(SELECT start_date FROM public.budget_periods WHERE id=p_period AND plan_id=p_plan)
  ORDER BY b.start_date DESC LIMIT 1;
 END IF;

 IF seed IS NOT NULL THEN
  previous:=seed->'previous';held:=seed->'held';previous_mode:=seed->>'previous_mode';valid:=(seed->>'valid')::boolean;
  answer:=seed->'result';
 END IF;
 -- Base details independently verifies membership, source and plan revisions.
 FOR p IN SELECT * FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=p_plan AND (seed_date IS NULL OR start_date>seed_date) AND start_date<=(SELECT start_date FROM public.budget_periods WHERE id=p_period AND plan_id=p_plan) ORDER BY start_date LOOP
  d:=public.budget_details_m4(p_tenant,p_actor,p_plan,p.id,p_source,p_version);
  s:=public.budget_query_m4(p_tenant,p_actor,jsonb_build_object('action','snapshot','plan_id',p_plan,'period_id',p.id));
  valid:=valid AND (s->>'scope_valid')::boolean;
  policy:=public.budget_rollover_at(p_plan,p.start_date);enabled:=policy IS NOT NULL;
  incoming:='{}';nextheld:='{}';flows:='[]';released:=0;
  IF enabled THEN
   FOR k IN SELECT key FROM jsonb_each(previous||held) LOOP
    SELECT value INTO rule FROM jsonb_array_elements(policy->'rules') WHERE value->>'id'=k;
    IF rule IS NULL THEN RAISE EXCEPTION 'budget_invalid_rollover_mapping';END IF;
    amount:=coalesce((previous->>k)::numeric,0)+coalesce((held->>k)::numeric,0);
    mode:=rule->>'mode';target:=CASE WHEN mode='carry' THEN k ELSE rule->>'target' END;
    IF mode='retain' THEN
     -- A late correction may turn a previously positive remainder negative.
     -- Keep savings nonnegative; the signed shortfall reduces Other instead.
     priorheld:=coalesce((held->>k)::numeric,0);raw:=coalesce((previous->>k)::numeric,0);
     nextheld:=jsonb_set(nextheld,ARRAY[k],to_jsonb(priorheld+greatest(raw,0)));
     IF raw<0 THEN incoming:=jsonb_set(incoming,ARRAY['other'],to_jsonb(coalesce((incoming->>'other')::numeric,0)+raw));target:='other';END IF;
    ELSIF mode='release' THEN released:=released+amount;
    ELSE
     IF target<>'other' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d->'limits') l WHERE l->>'id'=target) THEN RAISE EXCEPTION 'budget_invalid_rollover_target';END IF;
     incoming:=jsonb_set(incoming,ARRAY[target],to_jsonb(coalesce((incoming->>target)::numeric,0)+amount));
    END IF;
    flows:=flows||jsonb_build_array(jsonb_build_object('id',k,'mode',mode,'target',target,'amount_cents',CASE WHEN valid THEN to_jsonb(amount) ELSE 'null'::jsonb END,
     'period_balance_cents',CASE WHEN valid THEN to_jsonb(coalesce((previous->>k)::numeric,0)) ELSE 'null'::jsonb END,
     'previous_protected_cents',CASE WHEN valid THEN to_jsonb(coalesce((held->>k)::numeric,0)) ELSE 'null'::jsonb END,
     'protected_cents',CASE WHEN valid AND mode='retain' THEN nextheld->k ELSE 'null'::jsonb END,
     'shortfall_cents',CASE WHEN valid AND mode='retain' THEN to_jsonb(least(coalesce((previous->>k)::numeric,0),0)) ELSE 'null'::jsonb END));
   END LOOP;
  ELSIF previous_mode='carry' THEN
   SELECT coalesce(sum(value::text::numeric),0) INTO amount FROM jsonb_each(previous);
   incoming:=jsonb_build_object('other',amount);
  END IF;
  held:=nextheld;closing:='{}';parts:='[]';opening:=0;total:=0;
  FOR x IN SELECT value FROM jsonb_array_elements(d->'limits') UNION ALL SELECT jsonb_build_object('id','other','amount_cents',d->'other_flexible_cents','used_cents',d->'other_flexible_used_cents') LOOP
   k:=x->>'id';amount:=coalesce((incoming->>k)::numeric,0);raw:=(x->>'amount_cents')::numeric-(x->>'used_cents')::numeric;
   closing:=jsonb_set(closing,ARRAY[k],to_jsonb(amount+raw));opening:=opening+amount;total:=total+amount+raw;
   parts:=parts||jsonb_build_array(x||jsonb_build_object('opening_carry_cents',CASE WHEN valid THEN to_jsonb(amount) ELSE 'null'::jsonb END,'remaining_cents',CASE WHEN valid THEN to_jsonb(amount+raw) ELSE 'null'::jsonb END));
  END LOOP;
  SELECT carry_mode INTO previous_mode FROM public.budget_period_reviews WHERE period_id=p.id ORDER BY version DESC LIMIT 1;previous_mode:=coalesce(previous_mode,'fresh');
  IF EXISTS(SELECT 1 FROM jsonb_path_query(jsonb_build_object('closing',closing,'protected',held,'opening',incoming,'flows',flows,'released',released,'opening_total',opening,'closing_total',total,'held_total',(SELECT coalesce(sum(value::text::numeric),0) FROM jsonb_each(held))),'$.** ? (@.type() == "number")') n WHERE abs(n::text::numeric)>9007199254740991) THEN RAISE EXCEPTION 'budget_overflow';END IF;
  previous:=closing;
 SELECT coalesce(sum(value::text::numeric),0) INTO priorheld FROM jsonb_each(held);
 answer:=jsonb_build_object('enabled',enabled,'policy',policy,'parts',parts,'protected',CASE WHEN valid THEN held ELSE 'null'::jsonb END,
  'protected_cents',CASE WHEN valid THEN to_jsonb(priorheld) ELSE 'null'::jsonb END,'released_variance_cents',CASE WHEN valid THEN to_jsonb(released) ELSE 'null'::jsonb END,
  'flows',flows,'opening_carry_cents',CASE WHEN valid THEN to_jsonb(opening) ELSE 'null'::jsonb END,'closing_cents',CASE WHEN valid THEN to_jsonb(total) ELSE 'null'::jsonb END);

  IF ctx IS NOT NULL THEN
   UPDATE public.budget_history_facts c SET chain_context=ctx,partition_state=jsonb_build_object('previous',previous,'held',held,'previous_mode',previous_mode,'valid',valid,'result',answer),
    pool_state=CASE WHEN c.chain_context=ctx THEN c.pool_state ELSE NULL END
   WHERE c.tenant_id=p_tenant AND c.plan_id=p_plan AND c.period_id=p.id AND c.actor_id=p_actor
    AND c.actor_role=role_name AND c.source_revision=p_source AND c.plan_version=p_version AND c.method='history-v1';
  END IF;

 END LOOP;
 IF answer IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
 RETURN answer;
END $$;

CREATE OR REPLACE FUNCTION public.budget_scope_impact(p_tenant uuid,p_actor uuid,p_plan uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE p record;role_name text;s jsonb;d jsonb;answer jsonb;latest uuid;
 old_mode text:=coalesce(current_setting('halcyon.history_cache',true),'off');
 old_ctx text:=coalesce(current_setting('halcyon.chain_context',true),'');BEGIN
 PERFORM set_config('halcyon.chain_context',gen_random_uuid()::text,true);
 SELECT id INTO latest FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=p_plan ORDER BY start_date DESC LIMIT 1;
 PERFORM public.budget_history_status(p_tenant,p_actor,p_plan,latest,p_source,p_version);
 SELECT role::text INTO role_name FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor;
 PERFORM set_config('halcyon.history_cache','off',true);
 FOR p IN SELECT id FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=p_plan ORDER BY start_date LOOP
  s:=public.budget_query_m4_uncached(p_tenant,p_actor,jsonb_build_object('action','snapshot','plan_id',p_plan,'period_id',p.id));
  d:=public.budget_details_m4_uncached(p_tenant,p_actor,p_plan,p.id,p_source,p_version);
  INSERT INTO public.budget_history_facts(tenant_id,plan_id,period_id,actor_id,actor_role,source_revision,plan_version,method,snapshot,details)
   VALUES(p_tenant,p_plan,p.id,p_actor,role_name,p_source,p_version,'history-v1',s,d)
   ON CONFLICT(period_id,actor_id) DO UPDATE SET actor_role=EXCLUDED.actor_role,source_revision=EXCLUDED.source_revision,
    plan_version=EXCLUDED.plan_version,method=EXCLUDED.method,snapshot=EXCLUDED.snapshot,details=EXCLUDED.details,prepared_at=now();
 END LOOP;
 PERFORM set_config('halcyon.history_cache','on',true);
 answer:=public.budget_scope_impact_before_history(p_tenant,p_actor,p_plan,p_source,p_version);
 PERFORM set_config('halcyon.chain_context',old_ctx,true);PERFORM set_config('halcyon.history_cache',old_mode,true);
 RETURN answer;
 EXCEPTION WHEN OTHERS THEN PERFORM set_config('halcyon.chain_context',old_ctx,true);PERFORM set_config('halcyon.history_cache',old_mode,true);RAISE;
END $$;

DO $$ DECLARE n text;f regprocedure;BEGIN
 IF NOT(SELECT relrowsecurity FROM pg_class WHERE oid='public.budget_history_facts'::regclass)
 OR has_table_privilege('anon','public.budget_history_facts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 OR has_table_privilege('authenticated','public.budget_history_facts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'Budget chain cache grant leak';END IF;
 FOREACH n IN ARRAY ARRAY['budget_lifecycle_pool','budget_lifecycle_pool_reference','budget_partition_chain','budget_partition_chain_reference'] LOOP
  f:=('public.'||n||'(uuid,uuid,uuid,uuid,bigint,bigint)')::regprocedure;
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);
  IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE') OR NOT has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'Budget chain function grant leak';END IF;
 END LOOP;
END $$;
