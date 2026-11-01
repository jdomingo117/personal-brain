-- R06: after indexed/set-based/streaming reads, a million-row complete read
-- still costs seconds. Extend M5's existing private rebuildable checkpoints;
-- do not cache financial intent or attention decisions, or add a worker/job.
ALTER TABLE public.budget_history_facts
 ADD COLUMN forecast_read jsonb,ADD COLUMN forecast_basis text,ADD COLUMN forecast_role text,ADD COLUMN forecast_read_at timestamptz,
 ADD COLUMN recurring_read jsonb,ADD COLUMN recurring_basis text,ADD COLUMN recurring_role text,
 ADD COLUMN recurring_source bigint,ADD COLUMN recurring_version bigint,ADD COLUMN recurring_read_at timestamptz;

CREATE FUNCTION public.budget_prepare_selected_read(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE role_name text;s jsonb;d jsonb;BEGIN
 PERFORM public.budget_history_status(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 SELECT role::text INTO role_name FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor;
 IF EXISTS(SELECT 1 FROM public.budget_history_facts WHERE tenant_id=p_tenant AND plan_id=p_plan AND period_id=p_period AND actor_id=p_actor AND actor_role=role_name
  AND source_revision=p_source AND plan_version=p_version AND method='history-v1' AND prepared_at>now()-interval '24 hours') THEN RETURN;END IF;
 -- Exactly the same base kernels and slot contract as explicit M5 preparation.
 -- The >12-period complete-history guard remains before this helper is called.
 s:=public.budget_query_m4_uncached(p_tenant,p_actor,jsonb_build_object('action','snapshot','plan_id',p_plan,'period_id',p_period));
 d:=public.budget_details_m4_uncached(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 INSERT INTO public.budget_history_facts(tenant_id,plan_id,period_id,actor_id,actor_role,source_revision,plan_version,method,snapshot,details)
 VALUES(p_tenant,p_plan,p_period,p_actor,role_name,p_source,p_version,'history-v1',s,d)
 ON CONFLICT(period_id,actor_id) DO UPDATE SET actor_role=EXCLUDED.actor_role,source_revision=EXCLUDED.source_revision,plan_version=EXCLUDED.plan_version,
 method=EXCLUDED.method,snapshot=EXCLUDED.snapshot,details=EXCLUDED.details,prepared_at=now(),forecast_read=NULL,forecast_basis=NULL,forecast_role=NULL,forecast_read_at=NULL,
 recurring_read=NULL,recurring_basis=NULL,recurring_role=NULL,recurring_source=NULL,recurring_version=NULL,recurring_read_at=NULL;
END $$;
DO $$ DECLARE f regprocedure;definition text;anchor text;BEGIN
 f:='public.budget_workspace_details(uuid,uuid,uuid,uuid,bigint,bigint)'::regprocedure;
 definition:=pg_get_functiondef(f);
 anchor:=' PERFORM set_config(''halcyon.history_cache'',''on'',true);';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'budget_r06_checkpoint_workspace_shape';END IF;
 EXECUTE replace(definition,anchor,' PERFORM public.budget_prepare_selected_read(p_tenant,p_actor,p_plan,p_period,p_source,p_version);'||E'\n'||anchor);
END $$;

ALTER FUNCTION public.budget_forecast_facts(uuid,uuid,uuid,uuid,bigint,bigint,jsonb) RENAME TO budget_forecast_facts_r06_uncached;
CREATE FUNCTION public.budget_forecast_facts(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint,p_details jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE role_name text;zone text;local_date date;memo jsonb;basis text;answer jsonb;reuse boolean;BEGIN
 SELECT role::text INTO role_name FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor;
 IF role_name IS NULL THEN RAISE EXCEPTION 'budget_forbidden';END IF;
 IF public.budget_lock_source(p_tenant)<>p_source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 SELECT p.timezone INTO zone FROM public.budget_periods p JOIN public.budget_plans b ON b.id=p.plan_id WHERE p.tenant_id=p_tenant AND p.plan_id=p_plan AND p.id=p_period;
 IF zone IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.budget_plans WHERE id=p_plan AND tenant_id=p_tenant AND version=p_version) THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
 local_date:=(now() AT TIME ZONE zone)::date;
 memo:=nullif(current_setting('halcyon.workspace_memo',true),'')::jsonb;
 reuse:=coalesce(memo->>'tenant'=p_tenant::text AND memo->>'actor'=p_actor::text AND memo->>'plan'=p_plan::text AND memo->>'period'=p_period::text
  AND memo->>'source'=p_source::text AND memo->>'version'=p_version::text AND memo->>'role'=role_name,false);
 -- Bind the complete input facts too, so rollback-only/hypothetical same-version
 -- inputs never borrow a forecast for the actual plan. Code tag changes with rules.
 SELECT encode(extensions.digest('forecast-read-r06-v1:'||p_details::text||':'||coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]')::text,'sha256'),'hex') INTO basis FROM public.budget_account_memberships m WHERE m.tenant_id=p_tenant AND m.plan_id=p_plan;
 IF reuse THEN
  SELECT forecast_read INTO answer FROM public.budget_history_facts WHERE tenant_id=p_tenant AND plan_id=p_plan AND period_id=p_period AND actor_id=p_actor AND actor_role=role_name
   AND source_revision=p_source AND plan_version=p_version AND method='history-v1' AND prepared_at>now()-interval '24 hours'
   AND forecast_basis=basis AND forecast_role=role_name AND forecast_read_at>now()-interval '24 hours'
   AND forecast_read->>'method'='budget-forecast-v1' AND forecast_read->>'as_of'=local_date::text
   AND forecast_read->>'source_revision'=p_source::text AND forecast_read->>'plan_version'=p_version::text AND forecast_read->>'period_id'=p_period::text;
  IF answer IS NOT NULL THEN RETURN answer;END IF;
 END IF;
 answer:=public.budget_forecast_facts_r06_uncached(p_tenant,p_actor,p_plan,p_period,p_source,p_version,p_details);
 IF reuse THEN UPDATE public.budget_history_facts SET forecast_read=answer,forecast_basis=basis,forecast_role=role_name,forecast_read_at=now()
  WHERE tenant_id=p_tenant AND plan_id=p_plan AND period_id=p_period AND actor_id=p_actor AND actor_role=role_name AND source_revision=p_source AND plan_version=p_version AND method='history-v1';END IF;
 RETURN answer;
END $$;

ALTER FUNCTION public.budget_recurring_evidence(uuid,uuid,uuid,bigint,bigint) RENAME TO budget_recurring_evidence_r06_uncached;
CREATE FUNCTION public.budget_recurring_evidence(p_tenant uuid,p_actor uuid,p_plan uuid,p_source bigint,p_version bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE role_name text;zone text;local_date date;basis text;answer jsonb;slot uuid;BEGIN
 SELECT role::text INTO role_name FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor;
 IF role_name IS NULL THEN RAISE EXCEPTION 'budget_forbidden';END IF;
 IF public.budget_lock_source(p_tenant)<>p_source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 SELECT timezone INTO zone FROM public.budget_plans WHERE id=p_plan AND tenant_id=p_tenant;
 IF zone IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.budget_plans WHERE id=p_plan AND tenant_id=p_tenant AND version=p_version) THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
 local_date:=(now() AT TIME ZONE zone)::date;
 SELECT encode(extensions.digest('recurring-read-r06-v1:'||coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]')::text,'sha256'),'hex') INTO basis
 FROM public.budget_account_memberships m WHERE m.tenant_id=p_tenant AND m.plan_id=p_plan;
 SELECT recurring_read INTO answer FROM public.budget_history_facts WHERE tenant_id=p_tenant AND plan_id=p_plan AND actor_id=p_actor AND actor_role=role_name
  AND source_revision=p_source AND plan_version=p_version AND method='history-v1' AND prepared_at>now()-interval '24 hours'
  AND recurring_basis=basis AND recurring_role=role_name AND recurring_source=p_source AND recurring_version=p_version AND recurring_read_at>now()-interval '24 hours'
  AND recurring_read->>'as_of'=local_date::text ORDER BY prepared_at DESC LIMIT 1;
 IF answer IS NOT NULL THEN RETURN answer;END IF;
 answer:=public.budget_recurring_evidence_r06_uncached(p_tenant,p_actor,p_plan,p_source,p_version);
 SELECT c.period_id INTO slot FROM public.budget_history_facts c JOIN public.budget_periods p ON p.id=c.period_id WHERE c.tenant_id=p_tenant AND c.plan_id=p_plan AND c.actor_id=p_actor AND c.actor_role=role_name
  AND c.source_revision=p_source AND c.plan_version=p_version AND c.method='history-v1' AND c.prepared_at>now()-interval '24 hours' ORDER BY p.start_date DESC LIMIT 1;
 IF slot IS NOT NULL THEN UPDATE public.budget_history_facts SET recurring_read=answer,recurring_basis=basis,recurring_role=role_name,recurring_source=p_source,recurring_version=p_version,recurring_read_at=now()
  WHERE tenant_id=p_tenant AND plan_id=p_plan AND period_id=slot AND actor_id=p_actor AND actor_role=role_name AND source_revision=p_source AND plan_version=p_version AND method='history-v1';END IF;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.budget_prepare_selected_read(uuid,uuid,uuid,uuid,bigint,bigint),public.budget_forecast_facts(uuid,uuid,uuid,uuid,bigint,bigint,jsonb),public.budget_recurring_evidence(uuid,uuid,uuid,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_prepare_selected_read(uuid,uuid,uuid,uuid,bigint,bigint),public.budget_forecast_facts(uuid,uuid,uuid,uuid,bigint,bigint,jsonb),public.budget_recurring_evidence(uuid,uuid,uuid,bigint,bigint) TO service_role;
DO $$ DECLARE signature text;BEGIN
 IF NOT(SELECT relrowsecurity FROM pg_class WHERE oid='public.budget_history_facts'::regclass)
 OR has_table_privilege('anon','public.budget_history_facts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 OR has_table_privilege('authenticated','public.budget_history_facts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'budget_r06_checkpoint_table_privileges';END IF;
 FOREACH signature IN ARRAY ARRAY['public.budget_prepare_selected_read(uuid,uuid,uuid,uuid,bigint,bigint)','public.budget_forecast_facts(uuid,uuid,uuid,uuid,bigint,bigint,jsonb)','public.budget_recurring_evidence(uuid,uuid,uuid,bigint,bigint)','public.budget_forecast_facts_r06_uncached(uuid,uuid,uuid,uuid,bigint,bigint,jsonb)','public.budget_recurring_evidence_r06_uncached(uuid,uuid,uuid,bigint,bigint)'] LOOP
  IF has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE') OR NOT has_function_privilege('service_role',signature,'EXECUTE') THEN RAISE EXCEPTION 'budget_r06_checkpoint_function_privileges';END IF;
 END LOOP;
END $$;
