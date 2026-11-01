-- The profile derived the same selected-period M4 facts four times in one
-- workspace statement. Reuse only within that locked statement, not across
-- requests. No persisted cache, job, financial data or API change is added.
ALTER FUNCTION public.budget_details_m4(uuid,uuid,uuid,uuid,bigint,bigint) RENAME TO budget_details_m4_r06_unmemoized;
CREATE FUNCTION public.budget_details_m4(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET statement_timeout='8s' AS $$
DECLARE memo jsonb;answer jsonb;reuse boolean;BEGIN
 memo:=nullif(current_setting('halcyon.workspace_memo',true),'')::jsonb;
 reuse:=coalesce(memo->>'tenant'=p_tenant::text AND memo->>'actor'=p_actor::text AND memo->>'plan'=p_plan::text AND memo->>'period'=p_period::text
  AND memo->>'source'=p_source::text AND memo->>'version'=p_version::text
  AND memo->>'role'=(SELECT role::text FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor)
  AND p_source=public.budget_lock_source(p_tenant) AND p_version=(SELECT version FROM public.budget_plans WHERE tenant_id=p_tenant AND id=p_plan),false);
 IF reuse AND memo->'details' IS NOT NULL THEN RETURN memo->'details';END IF;
 answer:=public.budget_details_m4_r06_unmemoized(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 IF reuse THEN memo:=nullif(current_setting('halcyon.workspace_memo',true),'')::jsonb;PERFORM set_config('halcyon.workspace_memo',jsonb_set(memo,'{details}',answer)::text,true);END IF;
 RETURN answer;
END $$;

ALTER FUNCTION public.budget_query_m4(uuid,uuid,jsonb) RENAME TO budget_query_m4_r06_unmemoized;
CREATE FUNCTION public.budget_query_m4(p_tenant uuid,p_actor uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET statement_timeout='8s' AS $$
DECLARE memo jsonb;answer jsonb;reuse boolean;BEGIN
 memo:=nullif(current_setting('halcyon.workspace_memo',true),'')::jsonb;
 reuse:=coalesce(p_input->>'action'='snapshot' AND memo->>'tenant'=p_tenant::text AND memo->>'actor'=p_actor::text
  AND p_input->>'plan_id'=memo->>'plan' AND p_input->>'period_id'=memo->>'period'
  AND memo->>'role'=(SELECT role::text FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor)
  AND memo->>'source'=public.budget_lock_source(p_tenant)::text AND memo->>'version'=(SELECT version::text FROM public.budget_plans WHERE tenant_id=p_tenant AND id=(memo->>'plan')::uuid),false);
 IF reuse AND memo->'snapshot' IS NOT NULL THEN RETURN memo->'snapshot';END IF;
 answer:=public.budget_query_m4_r06_unmemoized(p_tenant,p_actor,p_input);
 IF reuse AND answer->'plan'->>'id'=memo->>'plan' AND answer->'period'->>'id'=memo->>'period' THEN
  memo:=nullif(current_setting('halcyon.workspace_memo',true),'')::jsonb;PERFORM set_config('halcyon.workspace_memo',jsonb_set(memo,'{snapshot}',answer)::text,true);
 END IF;
 RETURN answer;
END $$;

DO $$ DECLARE f regprocedure;definition text;anchor text;BEGIN
 f:='public.budget_workspace_details(uuid,uuid,uuid,uuid,bigint,bigint)'::regprocedure;
 definition:=pg_get_functiondef(f);
 IF position('DECLARE status jsonb;' IN definition)=0 THEN RAISE EXCEPTION 'budget_r06_workspace_shape';END IF;
 definition:=replace(definition,'DECLARE status jsonb;',E'DECLARE old_memo text:=coalesce(current_setting(''halcyon.workspace_memo'',true),'''');status jsonb;');
 anchor:=' answer:=public.budget_workspace_details_uncached';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'budget_r06_workspace_composer_shape';END IF;
 definition:=replace(definition,anchor,E' PERFORM set_config(''halcyon.workspace_memo'',jsonb_build_object(''tenant'',p_tenant::text,''actor'',p_actor::text,''plan'',p_plan::text,''period'',p_period::text,''source'',p_source::text,''version'',p_version::text,''role'',(SELECT role::text FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor))::text,true);\n'||anchor);
 definition:=replace(definition,' RETURN answer;',E' PERFORM set_config(''halcyon.workspace_memo'',old_memo,true);\n RETURN answer;');
 definition:=replace(definition,'EXCEPTION WHEN OTHERS THEN',E'EXCEPTION WHEN OTHERS THEN PERFORM set_config(''halcyon.workspace_memo'',old_memo,true);');
 EXECUTE definition;
END $$;
REVOKE ALL ON FUNCTION public.budget_details_m4(uuid,uuid,uuid,uuid,bigint,bigint),public.budget_query_m4(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_details_m4(uuid,uuid,uuid,uuid,bigint,bigint),public.budget_query_m4(uuid,uuid,jsonb) TO service_role;
DO $$ DECLARE signature text;BEGIN
 FOREACH signature IN ARRAY ARRAY['public.budget_details_m4(uuid,uuid,uuid,uuid,bigint,bigint)','public.budget_query_m4(uuid,uuid,jsonb)','public.budget_details_m4_r06_unmemoized(uuid,uuid,uuid,uuid,bigint,bigint)','public.budget_query_m4_r06_unmemoized(uuid,uuid,jsonb)'] LOOP
  IF has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE') OR NOT has_function_privilege('service_role',signature,'EXECUTE') THEN RAISE EXCEPTION 'budget_r06_reuse_privileges';END IF;
 END LOOP;
END $$;
