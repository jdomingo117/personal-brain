-- Durable planning inputs. Goals describe an account-scoped target only; they
-- never write a future transaction, account balance, or cached forecast.

CREATE TABLE public.planning_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  metric text NOT NULL CHECK (metric IN ('cash', 'net_worth')),
  target_cents integer NOT NULL CHECK (target_cents > 0),
  target_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_planning_goals_tenant_status ON public.planning_goals (tenant_id, status, updated_at DESC);

CREATE TRIGGER handle_updated_at_planning_goals
  BEFORE UPDATE ON public.planning_goals
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TABLE public.planning_goal_accounts (
  goal_id uuid NOT NULL REFERENCES public.planning_goals(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  PRIMARY KEY (goal_id, account_id)
);

CREATE INDEX idx_planning_goal_accounts_account ON public.planning_goal_accounts (account_id);

CREATE TABLE public.planning_goal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  goal_id uuid REFERENCES public.planning_goals(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'paused', 'archived', 'restored')),
  before_state jsonb,
  after_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  undone_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_planning_goal_events_tenant_created ON public.planning_goal_events (tenant_id, created_at DESC);

ALTER TABLE public.planning_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_goal_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_goal_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read planning goals" ON public.planning_goals FOR SELECT
  USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members read planning goal accounts" ON public.planning_goal_accounts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.planning_goals g WHERE g.id = goal_id AND public.is_tenant_member(g.tenant_id)));
CREATE POLICY "tenant members read planning goal events" ON public.planning_goal_events FOR SELECT
  USING (public.is_tenant_member(tenant_id));

GRANT SELECT ON public.planning_goals, public.planning_goal_accounts, public.planning_goal_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning_goals, public.planning_goal_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.planning_goal_events TO service_role;
REVOKE ALL ON public.planning_goals, public.planning_goal_accounts, public.planning_goal_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.planning_goals, public.planning_goal_accounts, public.planning_goal_events FROM authenticated;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.planning_goals, public.planning_goal_accounts, public.planning_goal_events FROM service_role;

CREATE FUNCTION public.planning_goal_state(p_goal_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', g.id, 'name', g.name, 'metric', g.metric, 'target_cents', g.target_cents,
    'target_date', g.target_date, 'status', g.status,
    'account_ids', COALESCE((SELECT jsonb_agg(account_id ORDER BY account_id)
      FROM public.planning_goal_accounts WHERE goal_id = g.id), '[]'::jsonb)
  ) FROM public.planning_goals g WHERE g.id = p_goal_id
$$;

CREATE FUNCTION public.save_planning_goal(
  p_tenant_id uuid, p_actor_id uuid, p_goal_id uuid, p_name text, p_metric text,
  p_target_cents integer, p_target_date date, p_status text, p_account_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_before jsonb; v_after jsonb; v_event_id uuid; v_action text;
BEGIN
  IF length(trim(p_name)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'invalid goal name'; END IF;
  IF p_metric NOT IN ('cash', 'net_worth') THEN RAISE EXCEPTION 'invalid goal metric'; END IF;
  IF p_target_cents IS NULL OR p_target_cents <= 0 THEN RAISE EXCEPTION 'target must be positive'; END IF;
  IF p_status NOT IN ('active', 'paused', 'archived') THEN RAISE EXCEPTION 'invalid goal status'; END IF;
  IF cardinality(p_account_ids) IS NULL OR cardinality(p_account_ids) < 1 OR cardinality(p_account_ids) > 100 THEN RAISE EXCEPTION 'select at least one account'; END IF;
  IF (SELECT count(DISTINCT id) FROM unnest(p_account_ids) id) <> cardinality(p_account_ids) THEN RAISE EXCEPTION 'duplicate accounts'; END IF;
  IF (SELECT count(*) FROM public.accounts WHERE tenant_id = p_tenant_id AND id = ANY(p_account_ids)) <> cardinality(p_account_ids) THEN RAISE EXCEPTION 'account not found'; END IF;

  IF p_goal_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.planning_goals WHERE id = p_goal_id AND tenant_id = p_tenant_id FOR UPDATE;
    IF v_id IS NULL THEN RAISE EXCEPTION 'goal not found'; END IF;
    v_before := public.planning_goal_state(v_id);
  ELSE v_id := gen_random_uuid(); END IF;

  v_after := jsonb_build_object('id', v_id, 'name', trim(p_name), 'metric', p_metric,
    'target_cents', p_target_cents, 'target_date', p_target_date, 'status', p_status,
    'account_ids', to_jsonb(ARRAY(SELECT id FROM unnest(p_account_ids) id ORDER BY id)));
  IF v_before IS NOT NULL AND v_before = v_after THEN
    RETURN jsonb_build_object('changed', false, 'event_id', null, 'goal_id', v_id);
  END IF;

  IF v_before IS NULL THEN
    INSERT INTO public.planning_goals (id, tenant_id, created_by, name, metric, target_cents, target_date, status)
    VALUES (v_id, p_tenant_id, p_actor_id, trim(p_name), p_metric, p_target_cents, p_target_date, p_status);
  ELSE
    UPDATE public.planning_goals SET name = trim(p_name), metric = p_metric, target_cents = p_target_cents,
      target_date = p_target_date, status = p_status WHERE id = v_id AND tenant_id = p_tenant_id;
    DELETE FROM public.planning_goal_accounts WHERE goal_id = v_id;
  END IF;
  INSERT INTO public.planning_goal_accounts (goal_id, account_id)
    SELECT v_id, id FROM unnest(p_account_ids) id;

  v_action := CASE WHEN v_before IS NULL THEN 'created' WHEN p_status = 'paused' THEN 'paused'
    WHEN p_status = 'archived' THEN 'archived' WHEN v_before->>'status' IN ('paused', 'archived') THEN 'restored' ELSE 'updated' END;
  INSERT INTO public.planning_goal_events (tenant_id, goal_id, actor_id, action, before_state, after_state)
  VALUES (p_tenant_id, v_id, p_actor_id, v_action, v_before, v_after) RETURNING id INTO v_event_id;
  RETURN jsonb_build_object('changed', true, 'event_id', v_event_id, 'goal_id', v_id, 'status', p_status);
END $$;

CREATE FUNCTION public.undo_planning_goal_event(p_tenant_id uuid, p_event_id uuid, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_event public.planning_goal_events%ROWTYPE; v_current jsonb; v_before jsonb; v_id uuid;
BEGIN
  SELECT * INTO v_event FROM public.planning_goal_events WHERE id = p_event_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'planning change not found'; END IF;
  IF v_event.undone_at IS NOT NULL THEN RAISE EXCEPTION 'planning change already undone'; END IF;
  IF v_event.goal_id IS NOT NULL THEN
    PERFORM 1 FROM public.planning_goals WHERE id = v_event.goal_id AND tenant_id = p_tenant_id FOR UPDATE;
    v_current := public.planning_goal_state(v_event.goal_id);
  END IF;
  IF v_current IS DISTINCT FROM v_event.after_state THEN RAISE EXCEPTION 'planning goal changed after this action'; END IF;
  v_before := v_event.before_state;
  IF v_before IS NULL THEN
    DELETE FROM public.planning_goals WHERE id = v_event.goal_id AND tenant_id = p_tenant_id;
  ELSE
    v_id := (v_before->>'id')::uuid;
    UPDATE public.planning_goals SET name = v_before->>'name', metric = v_before->>'metric',
      target_cents = (v_before->>'target_cents')::integer, target_date = nullif(v_before->>'target_date', '')::date,
      status = v_before->>'status' WHERE id = v_id AND tenant_id = p_tenant_id;
    DELETE FROM public.planning_goal_accounts WHERE goal_id = v_id;
    INSERT INTO public.planning_goal_accounts (goal_id, account_id)
      SELECT v_id, value::uuid FROM jsonb_array_elements_text(v_before->'account_ids');
  END IF;
  UPDATE public.planning_goal_events SET undone_at = now(), undone_by = p_actor_id WHERE id = p_event_id;
  RETURN jsonb_build_object('event_id', p_event_id, 'undone', true);
END $$;

REVOKE ALL ON FUNCTION public.planning_goal_state(uuid), public.save_planning_goal(uuid,uuid,uuid,text,text,integer,date,text,uuid[]), public.undo_planning_goal_event(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_planning_goal(uuid,uuid,uuid,text,text,integer,date,text,uuid[]), public.undo_planning_goal_event(uuid,uuid,uuid) TO service_role;

DO $$
DECLARE leaked text;
BEGIN
  SELECT string_agg(format('%s:%s/%s', grantee, table_name, privilege_type), ', ' ORDER BY table_name) INTO leaked
  FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name IN ('planning_goals','planning_goal_accounts','planning_goal_events')
    AND (grantee = 'anon' OR (grantee = 'authenticated' AND privilege_type <> 'SELECT') OR (grantee = 'service_role' AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER')));
  IF leaked IS NOT NULL THEN RAISE EXCEPTION 'unexpected planning grants: %', leaked; END IF;
  IF has_function_privilege('authenticated', 'public.save_planning_goal(uuid,uuid,uuid,text,text,integer,date,text,uuid[])', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.undo_planning_goal_event(uuid,uuid,uuid)', 'EXECUTE') THEN RAISE EXCEPTION 'authenticated may execute planning RPC'; END IF;
END $$;
