-- A rebaseline versions assumptions; it never rewrites the old baseline or ledger.
CREATE TABLE public.planning_rebaseline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES public.planning_goals(id) ON DELETE CASCADE,
  prior_scenario_id uuid REFERENCES public.planning_scenarios(id) ON DELETE SET NULL,
  new_scenario_id uuid REFERENCES public.planning_scenarios(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, effective_month date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), undone_at timestamptz, undone_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.planning_rebaseline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant reads planning rebaseline events" ON public.planning_rebaseline_events FOR SELECT USING (public.is_tenant_member(tenant_id));
GRANT SELECT ON public.planning_rebaseline_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.planning_rebaseline_events TO service_role;
REVOKE ALL ON public.planning_rebaseline_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.planning_rebaseline_events FROM authenticated;

CREATE FUNCTION public.rebaseline_planning_scenario(p_tenant_id uuid,p_actor_id uuid,p_scenario_id uuid,p_effective_month date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.planning_scenarios%ROWTYPE; n uuid:=gen_random_uuid(); e uuid;
BEGIN
  SELECT * INTO s FROM public.planning_scenarios WHERE id=p_scenario_id AND tenant_id=p_tenant_id AND is_baseline AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active baseline not found'; END IF;
  UPDATE public.planning_scenarios SET status='archived' WHERE id=s.id;
  INSERT INTO public.planning_scenarios(id,tenant_id,goal_id,name,is_baseline,annual_return_bps,include_recurring,status)
  VALUES(n,p_tenant_id,s.goal_id,'Baseline · '||to_char(p_effective_month,'Mon YYYY'),true,s.annual_return_bps,s.include_recurring,'active');
  INSERT INTO public.planning_events(tenant_id,scenario_id,name,amount_cents,cadence,start_date,end_date)
  SELECT tenant_id,n,name,amount_cents,cadence,start_date,end_date FROM public.planning_events WHERE scenario_id=s.id AND (end_date IS NULL OR end_date>=p_effective_month);
  INSERT INTO public.planning_rebaseline_events(tenant_id,goal_id,prior_scenario_id,new_scenario_id,actor_id,effective_month) VALUES(p_tenant_id,s.goal_id,s.id,n,p_actor_id,p_effective_month) RETURNING id INTO e;
  RETURN jsonb_build_object('changed',true,'scenario_id',n,'event_id',e);
END $$;
CREATE FUNCTION public.undo_planning_rebaseline(p_tenant_id uuid,p_event_id uuid,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.planning_rebaseline_events%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.planning_rebaseline_events WHERE id=p_event_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'rebaseline not found'; END IF; IF e.undone_at IS NOT NULL THEN RAISE EXCEPTION 'rebaseline already undone'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.planning_scenarios WHERE id=e.new_scenario_id AND tenant_id=p_tenant_id AND is_baseline AND status='active') THEN RAISE EXCEPTION 'baseline changed after this action'; END IF;
  UPDATE public.planning_scenarios SET status='active' WHERE id=e.prior_scenario_id;
  DELETE FROM public.planning_scenarios WHERE id=e.new_scenario_id;
  UPDATE public.planning_rebaseline_events SET undone_at=now(),undone_by=p_actor_id WHERE id=e.id;
  RETURN jsonb_build_object('undone',true,'event_id',e.id);
END $$;
REVOKE ALL ON FUNCTION public.rebaseline_planning_scenario(uuid,uuid,uuid,date),public.undo_planning_rebaseline(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rebaseline_planning_scenario(uuid,uuid,uuid,date),public.undo_planning_rebaseline(uuid,uuid,uuid) TO service_role;
