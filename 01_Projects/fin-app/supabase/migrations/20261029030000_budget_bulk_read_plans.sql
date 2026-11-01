-- R06 nested plans still performed tens of thousands of allocation probes.
-- These are complete bulk reads, not detail lookups. Prefer set joins with real
-- tenant/date parameters. The settings are function-local and restored on exit;
-- no global/server setting, data, budget limit or timeout is changed.
DO $$ DECLARE name text;f regprocedure;BEGIN
 FOREACH name IN ARRAY ARRAY['budget_query_m4_uncached','budget_activity','budget_activity_amounts','budget_assisted_setup','budget_recurring_evidence','budget_forecast_facts'] LOOP
  SELECT p.oid::regprocedure INTO f FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=name;
  IF f IS NULL THEN RAISE EXCEPTION 'budget_r06_bulk_function_missing';END IF;
  EXECUTE format('ALTER FUNCTION %s SET plan_cache_mode TO ''force_custom_plan''',f);
  EXECUTE format('ALTER FUNCTION %s SET enable_nestloop TO ''off''',f);
  -- Mandatory legacy fallback lateral plans carry high planner costs. Avoid
  -- cost-triggered JIT compilation of a branch that normally never executes.
  EXECUTE format('ALTER FUNCTION %s SET jit TO ''off''',f);
  IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE') OR NOT has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'budget_r06_bulk_privileges';END IF;
 END LOOP;
END $$;
