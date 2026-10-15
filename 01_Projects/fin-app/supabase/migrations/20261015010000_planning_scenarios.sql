-- Saved scenarios and planned inputs. These are user-declared assumptions,
-- never future ledger rows or persisted forecast output.

CREATE TABLE public.planning_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES public.planning_goals(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  is_baseline boolean NOT NULL DEFAULT false,
  annual_return_bps integer NOT NULL DEFAULT 0 CHECK (annual_return_bps BETWEEN -5000 AND 5000),
  include_recurring boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX planning_one_active_baseline ON public.planning_scenarios(goal_id) WHERE is_baseline AND status = 'active';
CREATE INDEX idx_planning_scenarios_goal ON public.planning_scenarios(tenant_id, goal_id, status, updated_at DESC);
CREATE TRIGGER handle_updated_at_planning_scenarios BEFORE UPDATE ON public.planning_scenarios FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TABLE public.planning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scenario_id uuid NOT NULL REFERENCES public.planning_scenarios(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  amount_cents integer NOT NULL CHECK (amount_cents <> 0),
  cadence text NOT NULL CHECK (cadence IN ('once', 'monthly')),
  start_date date NOT NULL,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((cadence = 'once' AND end_date IS NULL) OR (cadence = 'monthly' AND (end_date IS NULL OR end_date >= start_date)))
);
CREATE INDEX idx_planning_events_scenario ON public.planning_events(tenant_id, scenario_id, start_date);
CREATE TRIGGER handle_updated_at_planning_events BEFORE UPDATE ON public.planning_events FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TABLE public.planning_scenario_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scenario_id uuid REFERENCES public.planning_scenarios(id) ON DELETE SET NULL, event_id uuid REFERENCES public.planning_events(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, action text NOT NULL CHECK (action IN ('scenario_saved','event_saved','event_deleted')),
  before_state jsonb, after_state jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), undone_at timestamptz, undone_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX idx_planning_scenario_events_tenant ON public.planning_scenario_events(tenant_id, created_at DESC);

ALTER TABLE public.planning_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_scenario_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant reads planning scenarios" ON public.planning_scenarios FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant reads planning events" ON public.planning_events FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant reads planning scenario events" ON public.planning_scenario_events FOR SELECT USING (public.is_tenant_member(tenant_id));
GRANT SELECT ON public.planning_scenarios, public.planning_events, public.planning_scenario_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning_scenarios, public.planning_events TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.planning_scenario_events TO service_role;
REVOKE ALL ON public.planning_scenarios, public.planning_events, public.planning_scenario_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.planning_scenarios, public.planning_events, public.planning_scenario_events FROM authenticated;

CREATE FUNCTION public.create_planning_baseline() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.planning_scenarios(tenant_id, goal_id, name, is_baseline) VALUES (NEW.tenant_id, NEW.id, 'Baseline', true);
  RETURN NEW;
END $$;
CREATE TRIGGER create_planning_baseline_after_goal AFTER INSERT ON public.planning_goals FOR EACH ROW EXECUTE PROCEDURE public.create_planning_baseline();
INSERT INTO public.planning_scenarios(tenant_id, goal_id, name, is_baseline)
SELECT tenant_id, id, 'Baseline', true FROM public.planning_goals
WHERE NOT EXISTS (SELECT 1 FROM public.planning_scenarios s WHERE s.goal_id = planning_goals.id);

CREATE FUNCTION public.save_planning_scenario(p_tenant_id uuid, p_actor_id uuid, p_goal_id uuid, p_scenario_id uuid, p_name text, p_annual_return_bps integer, p_include_recurring boolean, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_before jsonb; v_after jsonb; v_event uuid;
BEGIN
  IF length(trim(p_name)) NOT BETWEEN 1 AND 120 OR p_annual_return_bps NOT BETWEEN -5000 AND 5000 OR p_status NOT IN ('active','archived') THEN RAISE EXCEPTION 'invalid planning scenario'; END IF;
  PERFORM 1 FROM public.planning_goals WHERE id=p_goal_id AND tenant_id=p_tenant_id; IF NOT FOUND THEN RAISE EXCEPTION 'goal not found'; END IF;
  IF p_scenario_id IS NOT NULL THEN SELECT id INTO v_id FROM public.planning_scenarios WHERE id=p_scenario_id AND goal_id=p_goal_id AND tenant_id=p_tenant_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'scenario not found'; END IF;
    SELECT jsonb_build_object('id',id,'name',name,'annual_return_bps',annual_return_bps,'include_recurring',include_recurring,'status',status) INTO v_before FROM public.planning_scenarios WHERE id=v_id;
  ELSE v_id:=gen_random_uuid(); END IF;
  v_after:=jsonb_build_object('id',v_id,'name',trim(p_name),'annual_return_bps',p_annual_return_bps,'include_recurring',p_include_recurring,'status',p_status);
  IF v_before IS NOT NULL AND v_before=v_after THEN RETURN jsonb_build_object('changed',false,'scenario_id',v_id); END IF;
  IF v_before IS NULL THEN INSERT INTO public.planning_scenarios(id,tenant_id,goal_id,name,annual_return_bps,include_recurring,status) VALUES(v_id,p_tenant_id,p_goal_id,trim(p_name),p_annual_return_bps,p_include_recurring,p_status);
  ELSE UPDATE public.planning_scenarios SET name=trim(p_name),annual_return_bps=p_annual_return_bps,include_recurring=p_include_recurring,status=p_status WHERE id=v_id; END IF;
  INSERT INTO public.planning_scenario_events(tenant_id,scenario_id,actor_id,action,before_state,after_state) VALUES(p_tenant_id,v_id,p_actor_id,'scenario_saved',v_before,v_after) RETURNING id INTO v_event;
  RETURN jsonb_build_object('changed',true,'scenario_id',v_id,'event_id',v_event);
END $$;

CREATE FUNCTION public.save_planning_event(p_tenant_id uuid,p_actor_id uuid,p_scenario_id uuid,p_event_id uuid,p_name text,p_amount_cents integer,p_cadence text,p_start_date date,p_end_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_before jsonb; v_after jsonb; v_audit uuid;
BEGIN
  IF length(trim(p_name)) NOT BETWEEN 1 AND 120 OR p_amount_cents=0 OR p_cadence NOT IN ('once','monthly') OR (p_cadence='once' AND p_end_date IS NOT NULL) OR (p_end_date IS NOT NULL AND p_end_date<p_start_date) THEN RAISE EXCEPTION 'invalid planning event'; END IF;
  PERFORM 1 FROM public.planning_scenarios WHERE id=p_scenario_id AND tenant_id=p_tenant_id AND status='active'; IF NOT FOUND THEN RAISE EXCEPTION 'scenario not found'; END IF;
  IF p_event_id IS NOT NULL THEN SELECT id INTO v_id FROM public.planning_events WHERE id=p_event_id AND scenario_id=p_scenario_id AND tenant_id=p_tenant_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'event not found'; END IF; SELECT jsonb_build_object('id',id,'name',name,'amount_cents',amount_cents,'cadence',cadence,'start_date',start_date,'end_date',end_date) INTO v_before FROM public.planning_events WHERE id=v_id; ELSE v_id:=gen_random_uuid(); END IF;
  v_after:=jsonb_build_object('id',v_id,'name',trim(p_name),'amount_cents',p_amount_cents,'cadence',p_cadence,'start_date',p_start_date,'end_date',p_end_date);
  IF v_before IS NOT NULL AND v_before=v_after THEN RETURN jsonb_build_object('changed',false,'event_id',v_id); END IF;
  IF v_before IS NULL THEN INSERT INTO public.planning_events(id,tenant_id,scenario_id,name,amount_cents,cadence,start_date,end_date) VALUES(v_id,p_tenant_id,p_scenario_id,trim(p_name),p_amount_cents,p_cadence,p_start_date,p_end_date); ELSE UPDATE public.planning_events SET name=trim(p_name),amount_cents=p_amount_cents,cadence=p_cadence,start_date=p_start_date,end_date=p_end_date WHERE id=v_id; END IF;
  INSERT INTO public.planning_scenario_events(tenant_id,scenario_id,event_id,actor_id,action,before_state,after_state) VALUES(p_tenant_id,p_scenario_id,v_id,p_actor_id,'event_saved',v_before,v_after) RETURNING id INTO v_audit;
  RETURN jsonb_build_object('changed',true,'event_id',v_id,'audit_event_id',v_audit);
END $$;

-- Undo only succeeds while the saved row still precisely matches the audit
-- record. This prevents an older undo from silently overwriting a newer edit.
CREATE FUNCTION public.undo_planning_scenario_event(p_tenant_id uuid, p_event_id uuid, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_audit public.planning_scenario_events%ROWTYPE; v_current jsonb; v_id uuid;
BEGIN
  SELECT * INTO v_audit FROM public.planning_scenario_events
  WHERE id=p_event_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'planning scenario change not found'; END IF;
  IF v_audit.undone_at IS NOT NULL THEN RAISE EXCEPTION 'planning scenario change already undone'; END IF;

  IF v_audit.action='scenario_saved' THEN
    SELECT jsonb_build_object('id',id,'name',name,'annual_return_bps',annual_return_bps,'include_recurring',include_recurring,'status',status)
    INTO v_current FROM public.planning_scenarios WHERE id=v_audit.scenario_id AND tenant_id=p_tenant_id FOR UPDATE;
    IF v_current IS DISTINCT FROM v_audit.after_state THEN RAISE EXCEPTION 'planning scenario changed after this action'; END IF;
    IF v_audit.before_state IS NULL THEN
      DELETE FROM public.planning_scenarios WHERE id=v_audit.scenario_id;
    ELSE
      UPDATE public.planning_scenarios SET name=v_audit.before_state->>'name', annual_return_bps=(v_audit.before_state->>'annual_return_bps')::integer,
        include_recurring=(v_audit.before_state->>'include_recurring')::boolean, status=v_audit.before_state->>'status' WHERE id=v_audit.scenario_id;
    END IF;
  ELSIF v_audit.action='event_saved' THEN
    SELECT jsonb_build_object('id',id,'name',name,'amount_cents',amount_cents,'cadence',cadence,'start_date',start_date,'end_date',end_date)
    INTO v_current FROM public.planning_events WHERE id=v_audit.event_id AND tenant_id=p_tenant_id FOR UPDATE;
    IF v_current IS DISTINCT FROM v_audit.after_state THEN RAISE EXCEPTION 'planning event changed after this action'; END IF;
    IF v_audit.before_state IS NULL THEN
      DELETE FROM public.planning_events WHERE id=v_audit.event_id;
    ELSE
      UPDATE public.planning_events SET name=v_audit.before_state->>'name', amount_cents=(v_audit.before_state->>'amount_cents')::integer,
        cadence=v_audit.before_state->>'cadence', start_date=(v_audit.before_state->>'start_date')::date,
        end_date=NULLIF(v_audit.before_state->>'end_date','')::date WHERE id=v_audit.event_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'planning scenario change cannot be undone';
  END IF;
  UPDATE public.planning_scenario_events SET undone_at=now(), undone_by=p_actor_id WHERE id=p_event_id;
  RETURN jsonb_build_object('undone',true,'event_id',p_event_id);
END $$;

CREATE FUNCTION public.duplicate_planning_scenario(p_tenant_id uuid, p_actor_id uuid, p_source_scenario_id uuid, p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_source public.planning_scenarios%ROWTYPE; v_id uuid := gen_random_uuid(); v_audit uuid;
BEGIN
  IF length(trim(p_name)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'invalid planning scenario'; END IF;
  SELECT * INTO v_source FROM public.planning_scenarios WHERE id=p_source_scenario_id AND tenant_id=p_tenant_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario not found'; END IF;
  INSERT INTO public.planning_scenarios(id,tenant_id,goal_id,name,annual_return_bps,include_recurring,status)
  VALUES(v_id,p_tenant_id,v_source.goal_id,trim(p_name),v_source.annual_return_bps,v_source.include_recurring,'active');
  INSERT INTO public.planning_events(tenant_id,scenario_id,name,amount_cents,cadence,start_date,end_date)
  SELECT tenant_id,v_id,name,amount_cents,cadence,start_date,end_date FROM public.planning_events WHERE scenario_id=v_source.id;
  INSERT INTO public.planning_scenario_events(tenant_id,scenario_id,actor_id,action,before_state,after_state)
  VALUES(p_tenant_id,v_id,p_actor_id,'scenario_saved',NULL,jsonb_build_object('id',v_id,'name',trim(p_name),'annual_return_bps',v_source.annual_return_bps,'include_recurring',v_source.include_recurring,'status','active')) RETURNING id INTO v_audit;
  RETURN jsonb_build_object('changed',true,'scenario_id',v_id,'event_id',v_audit);
END $$;

REVOKE ALL ON FUNCTION public.create_planning_baseline(), public.save_planning_scenario(uuid,uuid,uuid,uuid,text,integer,boolean,text), public.save_planning_event(uuid,uuid,uuid,uuid,text,integer,text,date,date), public.undo_planning_scenario_event(uuid,uuid,uuid), public.duplicate_planning_scenario(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_planning_scenario(uuid,uuid,uuid,uuid,text,integer,boolean,text), public.save_planning_event(uuid,uuid,uuid,uuid,text,integer,text,date,date), public.undo_planning_scenario_event(uuid,uuid,uuid), public.duplicate_planning_scenario(uuid,uuid,uuid,text) TO service_role;
