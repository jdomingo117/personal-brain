-- Complete impact previews used to rederive the same source facts for every
-- prefix of every saved period. Prepare each base once *for this exact current
-- projection*, then reuse it during the established impact composer. Never
-- reuse an older generation for hypothetical scope/policy/control changes.
ALTER FUNCTION public.budget_scope_impact(uuid,uuid,uuid,bigint,bigint) RENAME TO budget_scope_impact_before_history;
CREATE FUNCTION public.budget_scope_impact(p_tenant uuid,p_actor uuid,p_plan uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE p record;role_name text;s jsonb;d jsonb;answer jsonb;latest uuid;
 old_mode text:=coalesce(current_setting('halcyon.history_cache',true),'off');BEGIN
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
 PERFORM set_config('halcyon.history_cache',old_mode,true);
 RETURN answer;
 EXCEPTION WHEN OTHERS THEN PERFORM set_config('halcyon.history_cache',old_mode,true);RAISE;
END $$;
REVOKE ALL ON FUNCTION public.budget_scope_impact(uuid,uuid,uuid,bigint,bigint),public.budget_scope_impact_before_history(uuid,uuid,uuid,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_scope_impact(uuid,uuid,uuid,bigint,bigint),public.budget_scope_impact_before_history(uuid,uuid,uuid,bigint,bigint) TO service_role;
DO $$ DECLARE f regprocedure;BEGIN
 FOREACH f IN ARRAY ARRAY['public.budget_scope_impact(uuid,uuid,uuid,bigint,bigint)'::regprocedure,'public.budget_scope_impact_before_history(uuid,uuid,uuid,bigint,bigint)'::regprocedure] LOOP
  IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE') OR NOT has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'Budget scope cache grant leak';END IF;
 END LOOP;
END $$;
