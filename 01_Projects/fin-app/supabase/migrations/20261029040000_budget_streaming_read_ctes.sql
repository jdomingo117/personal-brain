-- Let predicates reach the scoped ledger scans. These CTEs contain no volatile
-- operations: materializing every intermediate row twice is unnecessary.
DO $$ DECLARE f regprocedure;definition text;BEGIN
 f:='public.budget_forecast_facts(uuid,uuid,uuid,uuid,bigint,bigint,jsonb)'::regprocedure;
 definition:=pg_get_functiondef(f);
 IF position('raw AS MATERIALIZED(' IN definition)=0 OR position('effective AS MATERIALIZED(' IN definition)=0 THEN RAISE EXCEPTION 'budget_r06_forecast_cte_shape';END IF;
 definition:=replace(replace(definition,'raw AS MATERIALIZED(','raw AS NOT MATERIALIZED('),'effective AS MATERIALIZED(','effective AS NOT MATERIALIZED(');
 EXECUTE definition;
 f:='public.budget_recurring_evidence(uuid,uuid,uuid,bigint,bigint)'::regprocedure;
 definition:=pg_get_functiondef(f);
 IF position('eligible AS MATERIALIZED (' IN definition)=0 THEN RAISE EXCEPTION 'budget_r06_recurring_cte_shape';END IF;
 EXECUTE replace(definition,'eligible AS MATERIALIZED (','eligible AS NOT MATERIALIZED (');
 f:='public.budget_assisted_setup(uuid,uuid,jsonb)'::regprocedure;
 definition:=pg_get_functiondef(f);
 IF position('reporting AS MATERIALIZED (' IN definition)=0 THEN RAISE EXCEPTION 'budget_r06_assistance_cte_shape';END IF;
 EXECUTE replace(definition,'reporting AS MATERIALIZED (','reporting AS NOT MATERIALIZED (');
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('budget_forecast_facts','budget_recurring_evidence','budget_assisted_setup') AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE') OR NOT has_function_privilege('service_role',p.oid,'EXECUTE'))) THEN RAISE EXCEPTION 'budget_r06_streaming_privileges';END IF;
END $$;
