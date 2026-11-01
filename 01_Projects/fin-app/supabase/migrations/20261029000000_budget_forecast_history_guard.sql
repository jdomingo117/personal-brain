-- Preserve R01 forecasting behind M5's complete-history admission and private
-- cache context. Migration 96 replaced the wrapper instead of its composer.
CREATE OR REPLACE FUNCTION public.budget_workspace_details_uncached(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE d jsonb;BEGIN
 d:=public.budget_details(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 d:=d||jsonb_build_object('forecast',public.budget_forecast_facts(p_tenant,p_actor,p_plan,p_period,p_source,p_version,d));
 RETURN d||jsonb_build_object('attention',public.budget_attention_facts(p_tenant,p_actor,p_plan,p_period,p_source,p_version,d));
END $$;

CREATE OR REPLACE FUNCTION public.budget_workspace_details(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE status jsonb;answer jsonb;old_mode text:=coalesce(current_setting('halcyon.history_cache',true),'off');BEGIN
 status:=public.budget_history_status(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 IF (status->>'total')::bigint>12 AND NOT (status->>'ready')::boolean THEN RAISE EXCEPTION 'budget_history_required';END IF;
 PERFORM set_config('halcyon.history_cache','on',true);
 answer:=public.budget_workspace_details_uncached(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 PERFORM set_config('halcyon.history_cache',old_mode,true);
 RETURN answer;
 EXCEPTION WHEN OTHERS THEN PERFORM set_config('halcyon.history_cache',old_mode,true);RAISE;
END $$;

REVOKE ALL ON FUNCTION public.budget_workspace_details(uuid,uuid,uuid,uuid,bigint,bigint),public.budget_workspace_details_uncached(uuid,uuid,uuid,uuid,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_workspace_details(uuid,uuid,uuid,uuid,bigint,bigint),public.budget_workspace_details_uncached(uuid,uuid,uuid,uuid,bigint,bigint) TO service_role;
DO $$ DECLARE signature text;BEGIN
 FOREACH signature IN ARRAY ARRAY['public.budget_workspace_details(uuid,uuid,uuid,uuid,bigint,bigint)','public.budget_workspace_details_uncached(uuid,uuid,uuid,uuid,bigint,bigint)'] LOOP
  IF has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE') OR NOT has_function_privilege('service_role',signature,'EXECUTE') THEN RAISE EXCEPTION 'budget_history_forecast_privilege_assertion';END IF;
 END LOOP;
END $$;
