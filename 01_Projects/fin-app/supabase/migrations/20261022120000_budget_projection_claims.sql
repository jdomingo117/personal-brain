-- Claim evidence is identical for all periods within one exact projection.
-- Derive it once, never reuse it across before/after/committed projections.
CREATE TABLE public.budget_projection_claims (
 tenant_id uuid NOT NULL,plan_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 actor_role text NOT NULL,source_revision bigint NOT NULL,plan_version bigint NOT NULL,
 context_id uuid NOT NULL,claims jsonb NOT NULL CHECK(jsonb_typeof(claims)='array'),
 PRIMARY KEY(plan_id,actor_id),
 FOREIGN KEY(tenant_id,plan_id) REFERENCES public.budget_plans(tenant_id,id) ON DELETE CASCADE
);
ALTER TABLE public.budget_projection_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.budget_projection_claims FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.budget_projection_claims TO service_role;
CREATE POLICY budget_projection_member ON public.budget_projection_claims FOR SELECT TO authenticated
 USING(public.is_tenant_member(tenant_id) AND actor_id=auth.uid());

ALTER FUNCTION public.budget_live_claims(uuid,uuid) RENAME TO budget_live_claims_reference;
CREATE FUNCTION public.budget_live_claims(p_tenant uuid,p_plan uuid)
RETURNS TABLE(id uuid,line_id uuid,purpose text,source_key text,source_date date,amount_cents bigint,occurrence_date date,related_claim_id uuid,valid boolean,provenance text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx uuid:=nullif(current_setting('halcyon.claim_context',true),'')::uuid;facts jsonb;BEGIN
 IF ctx IS NOT NULL THEN
  SELECT c.claims INTO facts FROM public.budget_projection_claims c
  JOIN public.budget_plans p ON p.id=c.plan_id AND p.tenant_id=c.tenant_id AND p.version=c.plan_version
  JOIN public.tenant_members m ON m.tenant_id=c.tenant_id AND m.user_id=c.actor_id AND m.role::text=c.actor_role
  WHERE c.tenant_id=p_tenant AND c.plan_id=p_plan AND c.context_id=ctx AND c.source_revision=public.budget_lock_source(p_tenant);
  IF facts IS NOT NULL THEN
   RETURN QUERY SELECT x.* FROM jsonb_to_recordset(facts) AS x(id uuid,line_id uuid,purpose text,source_key text,source_date date,amount_cents bigint,occurrence_date date,related_claim_id uuid,valid boolean,provenance text);
   RETURN;
  END IF;
 END IF;
 RETURN QUERY SELECT * FROM public.budget_live_claims_reference(p_tenant,p_plan);
END $$;

ALTER FUNCTION public.budget_scope_impact(uuid,uuid,uuid,bigint,bigint) RENAME TO budget_scope_impact_before_claim_cache;
CREATE FUNCTION public.budget_scope_impact(p_tenant uuid,p_actor uuid,p_plan uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE ctx uuid:=gen_random_uuid();old_ctx text:=coalesce(current_setting('halcyon.claim_context',true),'');
 facts jsonb;answer jsonb;role_name text;latest uuid;BEGIN
 SELECT b.id INTO latest FROM public.budget_periods b WHERE b.tenant_id=p_tenant AND b.plan_id=p_plan ORDER BY b.start_date DESC LIMIT 1;
 PERFORM public.budget_history_status(p_tenant,p_actor,p_plan,latest,p_source,p_version);
 SELECT m.role::text INTO role_name FROM public.tenant_members m WHERE m.tenant_id=p_tenant AND m.user_id=p_actor;
 SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') INTO facts FROM public.budget_live_claims_reference(p_tenant,p_plan) c;
 INSERT INTO public.budget_projection_claims(tenant_id,plan_id,actor_id,actor_role,source_revision,plan_version,context_id,claims)
 VALUES(p_tenant,p_plan,p_actor,role_name,p_source,p_version,ctx,facts)
 ON CONFLICT(plan_id,actor_id) DO UPDATE SET actor_role=EXCLUDED.actor_role,source_revision=EXCLUDED.source_revision,
  plan_version=EXCLUDED.plan_version,context_id=EXCLUDED.context_id,claims=EXCLUDED.claims;
 PERFORM set_config('halcyon.claim_context',ctx::text,true);
 answer:=public.budget_scope_impact_before_claim_cache(p_tenant,p_actor,p_plan,p_source,p_version);
 PERFORM set_config('halcyon.claim_context',old_ctx,true);RETURN answer;
 EXCEPTION WHEN OTHERS THEN PERFORM set_config('halcyon.claim_context',old_ctx,true);RAISE;
END $$;

DO $$ DECLARE f regprocedure;BEGIN
 IF NOT(SELECT relrowsecurity FROM pg_class WHERE oid='public.budget_projection_claims'::regclass)
 OR has_table_privilege('anon','public.budget_projection_claims','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 OR has_table_privilege('authenticated','public.budget_projection_claims','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'Budget projection cache grant leak';END IF;
 FOREACH f IN ARRAY ARRAY['public.budget_live_claims(uuid,uuid)'::regprocedure,'public.budget_live_claims_reference(uuid,uuid)'::regprocedure,
 'public.budget_scope_impact(uuid,uuid,uuid,bigint,bigint)'::regprocedure,'public.budget_scope_impact_before_claim_cache(uuid,uuid,uuid,bigint,bigint)'::regprocedure] LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);
  IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE') OR NOT has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'Budget projection function grant leak';END IF;
 END LOOP;
END $$;
