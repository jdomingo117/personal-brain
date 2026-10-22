-- M5 first slice: immutable reviewed evidence and explicit period-end carry intent.
CREATE TABLE public.budget_period_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,plan_id uuid NOT NULL,period_id uuid NOT NULL,
 version bigint NOT NULL,state text NOT NULL CHECK(state IN('reviewed','reopened')),
 carry_mode text NOT NULL CHECK(carry_mode IN('fresh','carry')),payload jsonb NOT NULL,
 source_revision bigint NOT NULL,accepted_incomplete boolean NOT NULL,
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,plan_id,period_id) REFERENCES public.budget_periods(tenant_id,plan_id,id) ON DELETE CASCADE,
 UNIQUE(plan_id,version)
);
CREATE INDEX budget_period_review_history ON public.budget_period_reviews(period_id,version DESC);
ALTER TABLE public.budget_period_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.budget_period_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.budget_period_reviews TO authenticated;
GRANT SELECT,INSERT,DELETE ON public.budget_period_reviews TO service_role;
CREATE POLICY budget_member_read ON public.budget_period_reviews FOR SELECT TO authenticated USING(public.is_tenant_member(tenant_id));
CREATE TRIGGER budget_history_immutable BEFORE UPDATE ON public.budget_period_reviews FOR EACH ROW EXECUTE FUNCTION public.budget_immutable_history();

ALTER FUNCTION public.budget_query(uuid,uuid,jsonb) RENAME TO budget_query_m4;
ALTER FUNCTION public.budget_details(uuid,uuid,uuid,uuid,bigint,bigint) RENAME TO budget_details_m4;

-- Compute the entire chain, not only the selected/newest period. Source changes
-- therefore change derived carry without rewriting any reviewed/activated intent.
CREATE FUNCTION public.budget_lifecycle(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE p record;plan public.budget_plans%ROWTYPE;r public.budget_period_reviews%ROWTYPE;
 d jsonb;s jsonb;original jsonb;facts jsonb;selected jsonb;rows jsonb:='[]';
 opening numeric:=0;closing numeric:=0;raw numeric;mode text;asof date;valid boolean:=true;provisional boolean:=false;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor) THEN RAISE EXCEPTION 'budget_forbidden';END IF;
 IF public.budget_lock_source(p_tenant)<>p_source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=p_plan;
 IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF plan.version<>p_version THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
 asof:=(now() AT TIME ZONE plan.timezone)::date;
 FOR p IN SELECT * FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=p_plan AND start_date<=(SELECT start_date FROM public.budget_periods WHERE id=p_period AND plan_id=p_plan) ORDER BY start_date LOOP
  d:=public.budget_details_m4(p_tenant,p_actor,p_plan,p.id,p_source,p_version);
  s:=public.budget_query_m4(p_tenant,p_actor,jsonb_build_object('action','snapshot','plan_id',p_plan,'period_id',p.id));
  SELECT * INTO r FROM public.budget_period_reviews WHERE period_id=p.id ORDER BY version DESC LIMIT 1;
  mode:=coalesce(r.carry_mode,'fresh');
  valid:=valid AND (s->>'scope_valid')::boolean;
  SELECT (x->>'remaining_cents')::numeric INTO raw FROM jsonb_array_elements(d->'items') x WHERE x->>'kind'='everyday';
  closing:=opening+raw;
  IF abs(closing)>9007199254740991 OR abs(opening)>9007199254740991 THEN RAISE EXCEPTION 'budget_overflow';END IF;
  SELECT jsonb_build_object('income_cents',v.income_cents,'drawdown_cents',v.drawdown_cents,
   'allocations',(SELECT jsonb_agg(jsonb_build_object('line_id',a.line_id,'amount_cents',a.amount_cents) ORDER BY a.line_id) FROM public.budget_allocations a WHERE a.revision_id=v.id))
   INTO original FROM public.budget_revisions v WHERE v.id=p.activated_revision_id;
  facts:=jsonb_build_object('period_id',p.id,'start_date',p.start_date,'end_date',p.end_date,
   'original_plan',original,'latest_plan',jsonb_build_object('income_cents',s->'revision'->'income_cents','drawdown_cents',s->'revision'->'drawdown_cents','allocations',s->'lines'),
   'actuals',s->'actuals','items',d->'items','excluded_cents',d->'excluded_cents','unassigned_credit_cents',d->'unassigned_credit_cents',
   'opening_carry_cents',CASE WHEN valid THEN to_jsonb(opening) ELSE 'null'::jsonb END,
   'closing_everyday_cents',CASE WHEN valid THEN to_jsonb(closing) ELSE 'null'::jsonb END,
   'scope_valid',valid,'coverage_complete',(s->>'coverage_complete')::boolean AND EXISTS(SELECT 1 FROM public.budget_account_memberships m WHERE m.plan_id=p_plan AND m.role='activity' AND m.start_date<p.end_date AND (m.end_date IS NULL OR m.end_date>p.start_date)));
  IF p.id=p_period THEN
   selected:=jsonb_build_object('state',CASE WHEN p.end_date<=asof THEN 'past' WHEN p.start_date>asof THEN 'future' ELSE 'current' END,
    'as_of',asof,'carry_mode',mode,'provisional_carry',provisional OR NOT valid,'chain_valid',valid,
    'facts',facts,'review',CASE WHEN r.id IS NULL THEN 'null'::jsonb ELSE to_jsonb(r)-'version'-'source_revision'||jsonb_build_object('version',r.version::text,'source_revision',r.source_revision::text) END,
    'changed_since_review',r.id IS NOT NULL AND (r.source_revision<>p_source OR r.payload IS DISTINCT FROM facts));
  END IF;
  rows:=rows||jsonb_build_array(jsonb_build_object('id',p.id,'start_date',p.start_date,'end_date',p.end_date,'state',coalesce(r.state,'not-reviewed')));
  provisional:=provisional OR r.id IS NULL OR r.state<>'reviewed' OR r.source_revision<>p_source OR NOT (facts->>'coverage_complete')::boolean;
  opening:=CASE WHEN mode='carry' THEN closing ELSE 0 END;
 END LOOP;
 IF selected IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
 RETURN selected||jsonb_build_object('periods',rows,
 'previous_id',(SELECT id FROM public.budget_periods WHERE plan_id=p_plan AND end_date=(SELECT start_date FROM public.budget_periods WHERE id=p_period)),
 'next_id',(SELECT id FROM public.budget_periods WHERE plan_id=p_plan AND start_date=(SELECT end_date FROM public.budget_periods WHERE id=p_period)),
 'is_latest',NOT EXISTS(SELECT 1 FROM public.budget_periods WHERE plan_id=p_plan AND start_date>(SELECT start_date FROM public.budget_periods WHERE id=p_period)));
END $$;

CREATE FUNCTION public.budget_details(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET statement_timeout='8s' AS $$
DECLARE d jsonb;l jsonb;opening numeric;BEGIN
 d:=public.budget_details_m4(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 l:=public.budget_lifecycle(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 opening:=(l->'facts'->>'opening_carry_cents')::numeric;
 SELECT jsonb_set(d,'{items}',jsonb_agg(CASE WHEN NOT (l->>'chain_valid')::boolean THEN x||jsonb_build_object('opening_carry_cents',NULL,'remaining_cents',NULL,'reserve_cents',NULL) WHEN x->>'kind'='everyday' THEN x||jsonb_build_object('opening_carry_cents',opening,'remaining_cents',l->'facts'->'closing_everyday_cents') ELSE x END)) INTO d FROM jsonb_array_elements(d->'items') x;
 -- This slice explicitly carries the pool remainder into Other, never into
 -- both the parent and children. Per-category policies are a later M5 gate.
 d:=d||jsonb_build_object('other_opening_carry_cents',opening,'other_flexible_remaining_cents',CASE WHEN opening IS NULL THEN NULL ELSE opening+(d->>'other_flexible_cents')::numeric-(d->>'other_flexible_used_cents')::numeric END,'lifecycle',l);
 IF EXISTS(SELECT 1 FROM jsonb_path_query(d,'$.** ? (@.type() == "number")') n WHERE abs(n::text::numeric)>9007199254740991) THEN RAISE EXCEPTION 'budget_overflow';END IF;
 IF EXISTS(SELECT 1 FROM public.budget_operations o WHERE o.id=(d->>'undo_operation_id')::uuid AND o.action='open_next_period') THEN d:=d||jsonb_build_object('undo_operation_id',NULL);END IF;
 RETURN d;
END $$;

CREATE FUNCTION public.budget_query(p_tenant uuid,p_actor uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE id uuid;BEGIN
 IF p_input->>'action'='snapshot' AND p_input->>'period_id' IS NULL THEN
  -- Prefer today's saved period, then the latest past period. Never jump to a
  -- future period merely because it was persisted or viewed most recently.
  SELECT b.id INTO id FROM public.budget_periods b JOIN public.budget_plans p ON p.id=b.plan_id
  WHERE p.tenant_id=p_tenant AND (CASE WHEN p_input->>'plan_id' IS NULL THEN p.state='active' ELSE p.id=(p_input->>'plan_id')::uuid END)
  ORDER BY CASE WHEN b.start_date<=(now() AT TIME ZONE p.timezone)::date AND b.end_date>(now() AT TIME ZONE p.timezone)::date THEN 0 WHEN b.end_date<=(now() AT TIME ZONE p.timezone)::date THEN 1 ELSE 2 END,
   b.start_date DESC LIMIT 1;
  IF id IS NOT NULL THEN p_input:=p_input||jsonb_build_object('period_id',id);END IF;
 END IF;
 RETURN public.budget_query_m4(p_tenant,p_actor,p_input);
END $$;

DO $$ DECLARE f record;BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.budget_period_reviews'::regclass)
 OR has_table_privilege('anon','public.budget_period_reviews','SELECT') OR has_table_privilege('authenticated','public.budget_period_reviews','INSERT') THEN RAISE EXCEPTION 'Budget review grant leak';END IF;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND left(p.proname,7)='budget_' LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
