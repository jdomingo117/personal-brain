-- Complete, private projection checkpoints. Preparing a review never commits a
-- financial change. A save still applies intent/history/receipt atomically.
CREATE TABLE public.budget_impact_preparations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,plan_id uuid NOT NULL,period_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,actor_role text NOT NULL,
 kind text NOT NULL CHECK(kind IN('account_scope','rollover','control')),intent jsonb NOT NULL,
 source_revision bigint NOT NULL,plan_version bigint NOT NULL,local_date date NOT NULL,
 method text NOT NULL DEFAULT 'impact-v1',expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour',
 before_proof text,before_facts jsonb,after_proof text,after_facts jsonb,preview_hash text,
 UNIQUE(plan_id,actor_id,kind),
 FOREIGN KEY(tenant_id,plan_id,period_id) REFERENCES public.budget_periods(tenant_id,plan_id,id) ON DELETE CASCADE
);
ALTER TABLE public.budget_impact_preparations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.budget_impact_preparations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.budget_impact_preparations TO service_role;
CREATE POLICY budget_impact_member ON public.budget_impact_preparations FOR SELECT TO authenticated
 USING(public.is_tenant_member(tenant_id) AND actor_id=auth.uid());

-- Incidental hypothetical revision/membership/event IDs are not financial
-- inputs. Retain revision contents, stable line/period/claim identities and all
-- dated rights. Source revision covers the canonical Ledger/coverage/taxonomy
-- adapters; it is checked under the tenant gate before every proof comparison.
CREATE FUNCTION public.budget_revision_semantics(p_revision uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('income',r.income_cents,'drawdown',r.drawdown_cents,'gap',r.accepted_gap,'method',r.method,
 'allocations',(SELECT jsonb_agg(jsonb_build_array(a.line_id,a.amount_cents) ORDER BY a.line_id) FROM public.budget_allocations a WHERE a.revision_id=r.id))
 FROM public.budget_revisions r WHERE r.id=p_revision
$$;
CREATE FUNCTION public.budget_impact_proof(p_tenant uuid,p_plan uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
 SELECT encode(extensions.digest(jsonb_build_object(
 'plan',to_jsonb(b)-ARRAY['version','template_revision_id','created_at','created_by'],
 'today',(now() AT TIME ZONE b.timezone)::date,'template',public.budget_revision_semantics(b.template_revision_id),
 'periods',(SELECT jsonb_agg(jsonb_build_object('period',to_jsonb(p)-ARRAY['current_revision_id','activated_revision_id'],
  'current',public.budget_revision_semantics(p.current_revision_id),'original',public.budget_revision_semantics(p.activated_revision_id)) ORDER BY p.start_date,p.id)
  FROM public.budget_periods p WHERE p.tenant_id=p_tenant AND p.plan_id=p_plan),
 'lines',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.budget_lines l WHERE l.tenant_id=p_tenant AND l.plan_id=p_plan),
 'scope',(SELECT jsonb_agg(to_jsonb(m)-'id' ORDER BY m.role,m.original_account_id,m.start_date,m.end_date) FROM public.budget_account_memberships m WHERE m.tenant_id=p_tenant AND m.plan_id=p_plan),
 'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.line_id,i.version) FROM public.budget_item_revisions i WHERE i.tenant_id=p_tenant AND i.plan_id=p_plan),
 'claims',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.budget_source_claims c WHERE c.tenant_id=p_tenant AND c.plan_id=p_plan),
 'reversals',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.budget_claim_reversals c WHERE c.tenant_id=p_tenant AND c.plan_id=p_plan),
 'funding',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.budget_manual_funding c WHERE c.tenant_id=p_tenant),
 'moves',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.budget_reserve_moves m WHERE m.tenant_id=p_tenant AND m.plan_id=p_plan),
 'limits',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.period_id,l.version) FROM public.budget_limit_revisions l WHERE l.tenant_id=p_tenant AND l.plan_id=p_plan),
 'reviews',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.period_id,r.version) FROM public.budget_period_reviews r WHERE r.tenant_id=p_tenant AND r.plan_id=p_plan),
 'rollover',coalesce((SELECT r.timeline FROM public.budget_rollover_policies r WHERE r.tenant_id=p_tenant AND r.plan_id=p_plan ORDER BY r.version DESC LIMIT 1),'[]'::jsonb),
 'control',public.budget_control_state(p_plan),
 'rights',(SELECT jsonb_agg(jsonb_build_array(m.period_id,m.from_line_id,m.to_line_id,m.amount_cents) ORDER BY m.period_id,m.from_line_id,m.to_line_id) FROM
  (SELECT period_id,from_line_id,to_line_id,sum(amount_cents) amount_cents FROM public.budget_control_moves WHERE tenant_id=p_tenant AND plan_id=p_plan GROUP BY period_id,from_line_id,to_line_id HAVING sum(amount_cents)<>0) m)
 )::text,'sha256'),'hex') FROM public.budget_plans b WHERE b.tenant_id=p_tenant AND b.id=p_plan
$$;
CREATE FUNCTION public.budget_impact_intent(p_input jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT p_input-ARRAY['action','request_id','preview_hash','accept_impact','accept_incomplete','accept_carry']
$$;

ALTER FUNCTION public.budget_scope_impact(uuid,uuid,uuid,bigint,bigint) RENAME TO budget_scope_impact_unprepared;
CREATE FUNCTION public.budget_scope_impact(p_tenant uuid,p_actor uuid,p_plan uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE job public.budget_impact_preparations%ROWTYPE;jid uuid:=nullif(current_setting('halcyon.impact_job',true),'')::uuid;
 mode text:=current_setting('halcyon.impact_mode',true);side text;proof text;facts jsonb;latest uuid;BEGIN
 IF jid IS NULL THEN RETURN public.budget_scope_impact_unprepared(p_tenant,p_actor,p_plan,p_source,p_version);END IF;
 SELECT p.id INTO latest FROM public.budget_periods p WHERE p.tenant_id=p_tenant AND p.plan_id=p_plan ORDER BY p.start_date DESC LIMIT 1;
 PERFORM public.budget_history_status(p_tenant,p_actor,p_plan,latest,p_source,p_version);
 PERFORM public.budget_assert_owner(p_tenant,p_actor);
 SELECT j.* INTO job FROM public.budget_impact_preparations j JOIN public.tenant_members m ON m.tenant_id=j.tenant_id AND m.user_id=j.actor_id AND m.role::text=j.actor_role
 WHERE j.id=jid AND j.tenant_id=p_tenant AND j.plan_id=p_plan AND j.actor_id=p_actor AND j.source_revision=p_source
  AND j.method='impact-v1' AND j.expires_at>now() AND j.local_date=(SELECT (now() AT TIME ZONE b.timezone)::date FROM public.budget_plans b WHERE b.id=p_plan);
 IF job.id IS NULL THEN RAISE EXCEPTION 'budget_stale_preview';END IF;
 IF mode='commit' THEN
  side:=coalesce(nullif(current_setting('halcyon.impact_direction',true),''),'after');
  IF p_version<>job.plan_version+(CASE WHEN side='before' THEN 2 ELSE 1 END) THEN RAISE EXCEPTION 'budget_stale_preview';END IF;
 ELSE
  IF p_version<>job.plan_version THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
  side:=CASE WHEN coalesce(nullif(current_setting('halcyon.impact_side',true),''),'0')='0' THEN 'before' ELSE 'after' END;
  PERFORM set_config('halcyon.impact_side','1',true);
 END IF;
 proof:=public.budget_impact_proof(p_tenant,p_plan);
 IF side='before' AND job.before_facts IS NOT NULL AND job.before_proof=proof THEN RETURN job.before_facts;END IF;
 IF side='after' AND job.after_facts IS NOT NULL AND job.after_proof=proof THEN RETURN job.after_facts;END IF;
 IF mode<>'prepare' THEN RAISE EXCEPTION 'budget_stale_preview';END IF;
 IF (side='before' AND job.before_facts IS NOT NULL) OR (side='after' AND job.after_facts IS NOT NULL) THEN RAISE EXCEPTION 'budget_stale_preview';END IF;
 IF side IS DISTINCT FROM current_setting('halcyon.impact_target',true) THEN RETURN '[]'::jsonb;END IF;
 facts:=public.budget_scope_impact_unprepared(p_tenant,p_actor,p_plan,p_source,p_version);
 -- PL/pgSQL result survives the existing rollback-only hypothetical block;
 -- the caller persists only this completed, server-derived projection.
 RETURN jsonb_build_array(jsonb_build_object('__capture',jsonb_build_object('side',side,'proof',proof,'facts',facts)));
END $$;

ALTER FUNCTION public.budget_preview_account_scope(uuid,uuid,jsonb) RENAME TO budget_preview_account_scope_unprepared;
ALTER FUNCTION public.budget_preview_rollover(uuid,uuid,jsonb) RENAME TO budget_preview_rollover_unprepared;
ALTER FUNCTION public.budget_preview_control(uuid,uuid,jsonb) RENAME TO budget_preview_control_unprepared;

-- One call computes at most ONE complete before/after chain. Partial review
-- money never leaves this boundary. Repeating the same intent resumes it.
CREATE FUNCTION public.budget_review_impact(p_tenant uuid,p_actor uuid,p_kind text,p_input jsonb,p_step boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE job public.budget_impact_preparations%ROWTYPE;plan public.budget_plans%ROWTYPE;intent jsonb:=public.budget_impact_intent(p_input);
 answer jsonb;capture jsonb;entry jsonb;target text;role_name text;done int;
 old_job text:=coalesce(current_setting('halcyon.impact_job',true),'');old_mode text:=coalesce(current_setting('halcyon.impact_mode',true),'');
 old_side text:=coalesce(current_setting('halcyon.impact_side',true),'');old_target text:=coalesce(current_setting('halcyon.impact_target',true),'');
 old_cache text:=coalesce(current_setting('halcyon.history_cache',true),'off');BEGIN
 PERFORM public.budget_assert_owner(p_tenant,p_actor);
 IF public.budget_lock_source(p_tenant) IS DISTINCT FROM (p_input->>'expected_source')::bigint THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 IF p_input->>'expected_method' IS DISTINCT FROM 'budget-foundation-v1' THEN RAISE EXCEPTION 'budget_stale_method';END IF;
 IF p_kind NOT IN('account_scope','rollover','control') THEN RAISE EXCEPTION 'budget_invalid_action';END IF;
 SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=(p_input->>'plan_id')::uuid AND state='active';
 IF plan.id IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF plan.version IS DISTINCT FROM (p_input->>'expected_plan')::bigint THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=plan.id AND id=(p_input->>'period_id')::uuid) THEN RAISE EXCEPTION 'budget_not_found';END IF;
 SELECT role::text INTO role_name FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor;
 SELECT * INTO job FROM public.budget_impact_preparations j WHERE j.plan_id=plan.id AND j.actor_id=p_actor AND j.kind=p_kind;
 IF job.id IS NOT NULL AND (job.intent IS DISTINCT FROM intent OR job.actor_role<>role_name OR job.local_date<>(now() AT TIME ZONE plan.timezone)::date OR job.method<>'impact-v1' OR job.expires_at<=now()) THEN
  IF NOT p_step THEN RAISE EXCEPTION 'budget_stale_preview';END IF;
  DELETE FROM public.budget_impact_preparations WHERE id=job.id;job.id:=NULL;
 END IF;
 IF job.id IS NULL THEN
  IF NOT p_step THEN RAISE EXCEPTION 'budget_impact_required';END IF;
  INSERT INTO public.budget_impact_preparations(tenant_id,plan_id,period_id,actor_id,actor_role,kind,intent,source_revision,plan_version,local_date)
  VALUES(p_tenant,plan.id,(p_input->>'period_id')::uuid,p_actor,role_name,p_kind,intent,(p_input->>'expected_source')::bigint,plan.version,(now() AT TIME ZONE plan.timezone)::date) RETURNING * INTO job;
 END IF;
 IF NOT p_step AND (job.before_facts IS NULL OR job.after_facts IS NULL) THEN RAISE EXCEPTION 'budget_impact_required';END IF;
 target:=CASE WHEN job.before_facts IS NULL THEN 'before' WHEN job.after_facts IS NULL THEN 'after' END;
 PERFORM set_config('halcyon.impact_job',job.id::text,true);PERFORM set_config('halcyon.impact_side','0',true);
 PERFORM set_config('halcyon.impact_target',coalesce(target,''),true);PERFORM set_config('halcyon.impact_mode',CASE WHEN target IS NULL THEN 'review' ELSE 'prepare' END,true);
 -- Archive capacity/disposition validation reads the unchanged saved state
 -- before either scope projection. Reuse only its guarded complete base facts.
 -- The unprepared scope kernel still disables reuse while building each fresh
 -- hypothetical projection, then uses its own isolated prefix context.
 IF p_kind='control' THEN PERFORM set_config('halcyon.history_cache','on',true);END IF;
 CASE p_kind
  WHEN 'account_scope' THEN answer:=public.budget_preview_account_scope_unprepared(p_tenant,p_actor,p_input);
  WHEN 'rollover' THEN answer:=public.budget_preview_rollover_unprepared(p_tenant,p_actor,p_input);
  WHEN 'control' THEN answer:=public.budget_preview_control_unprepared(p_tenant,p_actor,p_input);
 END CASE;
 PERFORM set_config('halcyon.impact_job',old_job,true);PERFORM set_config('halcyon.impact_mode',old_mode,true);
 PERFORM set_config('halcyon.impact_side',old_side,true);PERFORM set_config('halcyon.impact_target',old_target,true);
 PERFORM set_config('halcyon.history_cache',old_cache,true);
 IF target IS NULL THEN
  UPDATE public.budget_impact_preparations SET preview_hash=answer->>'preview_hash' WHERE id=job.id;
  RETURN answer;
 END IF;
 capture:=coalesce(answer->'before'->0->'__capture',answer->'after'->0->'__capture');
 IF capture IS NULL OR capture->>'side'<>target OR jsonb_typeof(capture->'facts')<>'array' THEN RAISE EXCEPTION 'budget_invalid_impact_checkpoint';END IF;
 IF target='before' THEN UPDATE public.budget_impact_preparations SET before_facts=capture->'facts',before_proof=capture->>'proof' WHERE id=job.id;
 ELSE UPDATE public.budget_impact_preparations SET after_facts=capture->'facts',after_proof=capture->>'proof' WHERE id=job.id;END IF;
 SELECT (before_facts IS NOT NULL)::int+(after_facts IS NOT NULL)::int INTO done FROM public.budget_impact_preparations WHERE id=job.id;
 RETURN jsonb_build_object('state','preparing_impact','completed',done,'total',2,'plan_id',plan.id,'period_id',job.period_id,'source_revision',job.source_revision::text,'plan_version',job.plan_version::text);
 EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('halcyon.impact_job',old_job,true);PERFORM set_config('halcyon.impact_mode',old_mode,true);
  PERFORM set_config('halcyon.impact_side',old_side,true);PERFORM set_config('halcyon.impact_target',old_target,true);
  PERFORM set_config('halcyon.history_cache',old_cache,true);RAISE;
END $$;

CREATE FUNCTION public.budget_preview_account_scope(p_tenant uuid,p_actor uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF nullif(current_setting('halcyon.impact_job',true),'') IS NOT NULL OR (SELECT count(*) FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=(p_input->>'plan_id')::uuid)>12 THEN RETURN public.budget_review_impact(p_tenant,p_actor,'account_scope',p_input,false);END IF;
 RETURN public.budget_preview_account_scope_unprepared(p_tenant,p_actor,p_input);
END $$;
CREATE FUNCTION public.budget_preview_rollover(p_tenant uuid,p_actor uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF nullif(current_setting('halcyon.impact_job',true),'') IS NOT NULL OR (SELECT count(*) FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=(p_input->>'plan_id')::uuid)>12 THEN RETURN public.budget_review_impact(p_tenant,p_actor,'rollover',p_input,false);END IF;
 RETURN public.budget_preview_rollover_unprepared(p_tenant,p_actor,p_input);
END $$;
CREATE FUNCTION public.budget_preview_control(p_tenant uuid,p_actor uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF nullif(current_setting('halcyon.impact_job',true),'') IS NOT NULL OR (SELECT count(*) FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=(p_input->>'plan_id')::uuid)>12 THEN RETURN public.budget_review_impact(p_tenant,p_actor,'control',p_input,false);END IF;
 RETURN public.budget_preview_control_unprepared(p_tenant,p_actor,p_input);
END $$;

CREATE FUNCTION public.budget_begin_impact(p_tenant uuid,p_actor uuid,p_kind text,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$ BEGIN
 IF (SELECT count(*) FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=(p_input->>'plan_id')::uuid)>12 THEN RETURN public.budget_review_impact(p_tenant,p_actor,p_kind,p_input,true);END IF;
 CASE p_kind
  WHEN 'account_scope' THEN RETURN public.budget_preview_account_scope(p_tenant,p_actor,p_input);
  WHEN 'rollover' THEN RETURN public.budget_preview_rollover(p_tenant,p_actor,p_input);
  WHEN 'control' THEN RETURN public.budget_preview_control(p_tenant,p_actor,p_input);
  ELSE RAISE EXCEPTION 'budget_invalid_action';
 END CASE;
END $$;

ALTER FUNCTION public.budget_command(uuid,uuid,uuid,jsonb,boolean) RENAME TO budget_command_before_impact;
CREATE FUNCTION public.budget_command(p_tenant uuid,p_actor uuid,p_request uuid,p_input jsonb,p_enabled boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE job public.budget_impact_preparations%ROWTYPE;original public.budget_operations%ROWTYPE;intent_kind text;answer jsonb;
 old_job text:=coalesce(current_setting('halcyon.impact_job',true),'');old_mode text:=coalesce(current_setting('halcyon.impact_mode',true),'');old_direction text:=coalesce(current_setting('halcyon.impact_direction',true),'');BEGIN
 PERFORM set_config('halcyon.impact_job','',true);PERFORM set_config('halcyon.impact_mode','',true);
 -- The established owner/idempotency boundary still replays before disabled,
 -- stale, expired or missing preparation checks.
 IF NOT EXISTS(SELECT 1 FROM public.budget_operations WHERE tenant_id=p_tenant AND request_id=p_request) THEN
  PERFORM public.budget_lock_source(p_tenant);PERFORM public.budget_assert_owner(p_tenant,p_actor);
  intent_kind:=CASE p_input->>'action' WHEN 'set_account_scope' THEN 'account_scope' WHEN 'set_rollover' THEN 'rollover' WHEN 'set_control' THEN 'control' END;
  IF intent_kind IS NOT NULL THEN
   SELECT * INTO job FROM public.budget_impact_preparations j WHERE j.tenant_id=p_tenant AND j.actor_id=p_actor AND j.plan_id=(p_input->>'plan_id')::uuid AND j.kind=intent_kind
    AND j.intent=public.budget_impact_intent(p_input) AND j.preview_hash=p_input->>'preview_hash' AND j.before_facts IS NOT NULL AND j.after_facts IS NOT NULL;
   PERFORM set_config('halcyon.impact_direction','after',true);
  ELSIF p_input->>'action'='undo' THEN
   SELECT * INTO original FROM public.budget_operations WHERE tenant_id=p_tenant AND id=(p_input->>'operation_id')::uuid;
   SELECT * INTO job FROM public.budget_impact_preparations j WHERE j.tenant_id=p_tenant AND j.actor_id=p_actor AND j.plan_id=(original.after_state->>'plan_id')::uuid
    AND j.plan_version+1=(original.after_state->>'plan_version')::bigint AND j.preview_hash=original.before_state->'preview'->>'preview_hash';
   PERFORM set_config('halcyon.impact_direction','before',true);
  END IF;
  IF job.id IS NOT NULL AND job.method='impact-v1' AND job.expires_at>now() AND job.local_date=(SELECT (now() AT TIME ZONE b.timezone)::date FROM public.budget_plans b WHERE b.id=job.plan_id) THEN
   PERFORM set_config('halcyon.impact_job',job.id::text,true);PERFORM set_config('halcyon.impact_mode','commit',true);
  END IF;
 END IF;
 answer:=public.budget_command_before_impact(p_tenant,p_actor,p_request,p_input,p_enabled);
 PERFORM set_config('halcyon.impact_job',old_job,true);PERFORM set_config('halcyon.impact_mode',old_mode,true);PERFORM set_config('halcyon.impact_direction',old_direction,true);RETURN answer;
 EXCEPTION WHEN OTHERS THEN PERFORM set_config('halcyon.impact_job',old_job,true);PERFORM set_config('halcyon.impact_mode',old_mode,true);PERFORM set_config('halcyon.impact_direction',old_direction,true);RAISE;
END $$;

DO $$ DECLARE f record;BEGIN
 IF NOT(SELECT relrowsecurity FROM pg_class WHERE oid='public.budget_impact_preparations'::regclass)
 OR has_table_privilege('anon','public.budget_impact_preparations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 OR has_table_privilege('authenticated','public.budget_impact_preparations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'Budget impact preparation grant leak';END IF;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND left(p.proname,7)='budget_' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
