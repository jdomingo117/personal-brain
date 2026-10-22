-- A historical calculation only needs its preceding carry chain, but the
-- navigation inventory must include every saved period of the authorized plan.
-- Keep calculation/review semantics unchanged; do not calculate future actuals.
ALTER FUNCTION public.budget_lifecycle(uuid,uuid,uuid,uuid,bigint,bigint)
 RENAME TO budget_lifecycle_before_navigation;

CREATE FUNCTION public.budget_lifecycle(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
 SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE answer jsonb;periods jsonb;BEGIN
 -- Retains tenant membership, selected-period, source and plan version checks
 -- under the existing tenant source gate before reading any metadata.
 answer:=public.budget_lifecycle_before_navigation(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'start_date',p.start_date,'end_date',p.end_date,
  'state',coalesce(r.state,'not-reviewed')) ORDER BY p.start_date),'[]'::jsonb) INTO periods
 FROM public.budget_periods p
 LEFT JOIN LATERAL (SELECT v.state FROM public.budget_period_reviews v
  WHERE v.tenant_id=p_tenant AND v.plan_id=p_plan AND v.period_id=p.id ORDER BY v.version DESC LIMIT 1) r ON true
 WHERE p.tenant_id=p_tenant AND p.plan_id=p_plan;
 RETURN answer||jsonb_build_object('periods',periods);
END $$;

REVOKE ALL ON FUNCTION public.budget_lifecycle(uuid,uuid,uuid,uuid,bigint,bigint),
 public.budget_lifecycle_before_navigation(uuid,uuid,uuid,uuid,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_lifecycle(uuid,uuid,uuid,uuid,bigint,bigint),
 public.budget_lifecycle_before_navigation(uuid,uuid,uuid,uuid,bigint,bigint) TO service_role;

DO $$ DECLARE f regprocedure;BEGIN
 FOREACH f IN ARRAY ARRAY['public.budget_lifecycle(uuid,uuid,uuid,uuid,bigint,bigint)'::regprocedure,
  'public.budget_lifecycle_before_navigation(uuid,uuid,uuid,uuid,bigint,bigint)'::regprocedure] LOOP
  IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE')
   OR NOT has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'Budget navigation function grant leak';END IF;
 END LOOP;
END $$;
