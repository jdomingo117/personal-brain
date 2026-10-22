-- Rebuildable, private read checkpoints. Financial intent/history remains the
-- source of truth. No client grants, no source-row locks and no partial totals
-- are exposed as a workspace. One slot per actor/period bounds old generations.
CREATE TABLE public.budget_history_facts (
 tenant_id uuid NOT NULL,plan_id uuid NOT NULL,period_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 actor_role text NOT NULL,source_revision bigint NOT NULL,plan_version bigint NOT NULL,
 method text NOT NULL CHECK(method='history-v1'),snapshot jsonb NOT NULL,details jsonb NOT NULL,
 prepared_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(period_id,actor_id),
 FOREIGN KEY(tenant_id,plan_id,period_id) REFERENCES public.budget_periods(tenant_id,plan_id,id) ON DELETE CASCADE
);
CREATE INDEX budget_history_generation ON public.budget_history_facts(tenant_id,plan_id,actor_id,source_revision,plan_version);
ALTER TABLE public.budget_history_facts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.budget_history_facts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.budget_history_facts TO service_role;
CREATE POLICY budget_history_member ON public.budget_history_facts FOR SELECT TO authenticated
 USING(public.is_tenant_member(tenant_id) AND actor_id=auth.uid());

CREATE FUNCTION public.budget_history_status(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE role_name text;until_on date;total bigint;done bigint;BEGIN
 IF public.budget_lock_source(p_tenant)<>p_source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 SELECT role::text INTO role_name FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor;
 IF role_name IS NULL THEN RAISE EXCEPTION 'budget_forbidden';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.budget_plans WHERE tenant_id=p_tenant AND id=p_plan AND version=p_version) THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
 SELECT start_date INTO until_on FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=p_plan AND id=p_period;
 IF until_on IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
 SELECT count(*),count(c.period_id) INTO total,done FROM public.budget_periods p
 LEFT JOIN public.budget_history_facts c ON c.period_id=p.id AND c.actor_id=p_actor AND c.actor_role=role_name
  AND c.tenant_id=p_tenant AND c.plan_id=p_plan AND c.source_revision=p_source AND c.plan_version=p_version
  AND c.method='history-v1' AND c.prepared_at>now()-interval '24 hours'
 WHERE p.tenant_id=p_tenant AND p.plan_id=p_plan AND p.start_date<=until_on;
 RETURN jsonb_build_object('plan_id',p_plan,'period_id',p_period,'source_revision',p_source::text,'plan_version',p_version::text,
  'completed',done,'total',total,'ready',done=total);
END $$;

ALTER FUNCTION public.budget_details_m4(uuid,uuid,uuid,uuid,bigint,bigint) RENAME TO budget_details_m4_uncached;
ALTER FUNCTION public.budget_query_m4(uuid,uuid,jsonb) RENAME TO budget_query_m4_uncached;

-- Opt-in is scoped to the workspace composer only. Mutation/preview paths use
-- the uncached calculation, including same-version rollback-only hypothetical
-- account/policy/control projections. A GUC is not an authorization boundary:
-- membership, actor role and live versions are rechecked before every hit.
CREATE FUNCTION public.budget_details_m4(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE answer jsonb;role_name text;BEGIN
 IF current_setting('halcyon.history_cache',true)='on' THEN
  IF public.budget_lock_source(p_tenant)<>p_source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
  SELECT role::text INTO role_name FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor;
  IF role_name IS NULL THEN RAISE EXCEPTION 'budget_forbidden';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.budget_plans WHERE id=p_plan AND tenant_id=p_tenant AND version=p_version) THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
  SELECT details INTO answer FROM public.budget_history_facts WHERE tenant_id=p_tenant AND plan_id=p_plan AND period_id=p_period
   AND actor_id=p_actor AND actor_role=role_name AND source_revision=p_source AND plan_version=p_version AND method='history-v1' AND prepared_at>now()-interval '24 hours';
  IF answer IS NOT NULL THEN
   -- Undo availability is live operational state, never checkpoint authority.
   answer:=answer||jsonb_build_object('undo_operation_id',CASE WHEN role_name='owner' THEN
    (SELECT o.id FROM public.budget_operations o WHERE o.tenant_id=p_tenant AND o.after_state->>'plan_id'=p_plan::text
     AND o.after_state->>'plan_version'=p_version::text AND o.outcome->>'source_revision'=p_source::text AND o.action<>'undo'
     AND NOT EXISTS(SELECT 1 FROM public.budget_operations u WHERE u.undo_of=o.id) LIMIT 1) ELSE NULL END);
   -- Planning goal names/status are presentation references, not source-gated
   -- financial inputs. Fetch them live rather than cache their directory.
   answer:=answer||jsonb_build_object('planning_goals',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') FROM public.planning_goals WHERE tenant_id=p_tenant AND status<>'archived'));
   RETURN answer;
  END IF;
 END IF;
 RETURN public.budget_details_m4_uncached(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
END $$;

CREATE FUNCTION public.budget_query_m4(p_tenant uuid,p_actor uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE answer jsonb;source bigint;plan public.budget_plans%ROWTYPE;pid uuid;role_name text;BEGIN
 IF current_setting('halcyon.history_cache',true)='on' AND p_input->>'action'='snapshot' AND p_input->>'plan_id' IS NOT NULL AND p_input->>'period_id' IS NOT NULL THEN
  source:=public.budget_lock_source(p_tenant);
  SELECT role::text INTO role_name FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor;
  IF role_name IS NULL THEN RAISE EXCEPTION 'budget_forbidden';END IF;
  SELECT * INTO plan FROM public.budget_plans WHERE id=(p_input->>'plan_id')::uuid AND tenant_id=p_tenant;
  IF plan.id IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
  SELECT snapshot INTO answer FROM public.budget_history_facts WHERE tenant_id=p_tenant AND plan_id=plan.id AND period_id=(p_input->>'period_id')::uuid
   AND actor_id=p_actor AND actor_role=role_name AND source_revision=source AND plan_version=plan.version AND method='history-v1' AND prepared_at>now()-interval '24 hours';
  IF answer IS NOT NULL THEN RETURN answer||jsonb_build_object('generated_at',now());END IF;
 END IF;
 RETURN public.budget_query_m4_uncached(p_tenant,p_actor,p_input);
END $$;

-- Each successful call checkpoints at most eight complete periods and yields
-- after ~1.5 seconds of completed work. A failed/timed-out batch rolls back;
-- previously committed batches survive reloads/retries. No caller cursor or
-- caller-supplied financial facts are trusted.
CREATE FUNCTION public.budget_prepare_history(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE status jsonb;p record;s jsonb;d jsonb;role_name text;started timestamptz:=clock_timestamp();BEGIN
 status:=public.budget_history_status(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 SELECT role::text INTO role_name FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor;
 FOR p IN SELECT b.* FROM public.budget_periods b WHERE b.tenant_id=p_tenant AND b.plan_id=p_plan
  AND b.start_date<=(SELECT start_date FROM public.budget_periods WHERE id=p_period AND tenant_id=p_tenant AND plan_id=p_plan)
  AND NOT EXISTS(SELECT 1 FROM public.budget_history_facts c WHERE c.period_id=b.id AND c.actor_id=p_actor AND c.actor_role=role_name
   AND c.source_revision=p_source AND c.plan_version=p_version AND c.method='history-v1' AND c.prepared_at>now()-interval '24 hours')
  ORDER BY b.start_date LIMIT 8 LOOP
  s:=public.budget_query_m4_uncached(p_tenant,p_actor,jsonb_build_object('action','snapshot','plan_id',p_plan,'period_id',p.id));
  d:=public.budget_details_m4_uncached(p_tenant,p_actor,p_plan,p.id,p_source,p_version);
  INSERT INTO public.budget_history_facts(tenant_id,plan_id,period_id,actor_id,actor_role,source_revision,plan_version,method,snapshot,details)
   VALUES(p_tenant,p_plan,p.id,p_actor,role_name,p_source,p_version,'history-v1',s,d)
   ON CONFLICT(period_id,actor_id) DO UPDATE SET actor_role=EXCLUDED.actor_role,source_revision=EXCLUDED.source_revision,
    plan_version=EXCLUDED.plan_version,method=EXCLUDED.method,snapshot=EXCLUDED.snapshot,details=EXCLUDED.details,prepared_at=now();
  EXIT WHEN clock_timestamp()-started>interval '1500 milliseconds';
 END LOOP;
 RETURN public.budget_history_status(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
END $$;

ALTER FUNCTION public.budget_workspace_details(uuid,uuid,uuid,uuid,bigint,bigint) RENAME TO budget_workspace_details_uncached;
CREATE FUNCTION public.budget_workspace_details(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint)
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

DO $$ DECLARE f record;BEGIN
 IF NOT(SELECT relrowsecurity FROM pg_class WHERE oid='public.budget_history_facts'::regclass)
 OR has_table_privilege('anon','public.budget_history_facts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 OR has_table_privilege('authenticated','public.budget_history_facts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'Budget history cache grant leak';END IF;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND left(p.proname,7)='budget_' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
