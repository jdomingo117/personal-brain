-- Durable user intent over the read-only recurring detector.
--
-- A detected series is a live projection from transactions, not a database
-- entity. This table deliberately stores only a user's overlay, keyed by the
-- durable merchant/account identity. It never changes statement history and
-- it never claims to cancel a merchant subscription or direct debit.

CREATE TABLE public.recurring_series_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  merchant_key text NOT NULL CHECK (length(trim(merchant_key)) BETWEEN 1 AND 200),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'stopped', 'dismissed')),
  cadence_override text CHECK (cadence_override IN ('Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'Annual')),
  expected_amount_override integer CHECK (expected_amount_override IS NULL OR expected_amount_override > 0),
  next_expected_override date,
  reminder_days_before smallint CHECK (reminder_days_before IS NULL OR reminder_days_before BETWEEN 0 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, account_id, merchant_key)
);

CREATE INDEX idx_recurring_series_overrides_tenant_state
  ON public.recurring_series_overrides (tenant_id, state);

CREATE TRIGGER handle_updated_at_recurring_series_overrides
  BEFORE UPDATE ON public.recurring_series_overrides
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TABLE public.recurring_series_override_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  override_id uuid REFERENCES public.recurring_series_overrides(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('saved', 'stopped', 'resumed', 'dismissed')),
  before_state jsonb,
  after_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  undone_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_recurring_series_override_events_tenant
  ON public.recurring_series_override_events (tenant_id, created_at DESC);

ALTER TABLE public.recurring_series_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_series_override_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read recurring series overrides"
  ON public.recurring_series_overrides FOR SELECT
  USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members read recurring series override events"
  ON public.recurring_series_override_events FOR SELECT
  USING (public.is_tenant_member(tenant_id));

GRANT SELECT ON public.recurring_series_overrides, public.recurring_series_override_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_series_overrides TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.recurring_series_override_events TO service_role;
REVOKE ALL ON public.recurring_series_overrides, public.recurring_series_override_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.recurring_series_overrides, public.recurring_series_override_events FROM authenticated;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.recurring_series_overrides, public.recurring_series_override_events FROM service_role;

CREATE FUNCTION public.save_recurring_series_override(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_account_id uuid,
  p_merchant_key text,
  p_state text,
  p_cadence_override text,
  p_expected_amount_override integer,
  p_next_expected_override date,
  p_reminder_days_before smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_event_id uuid;
  v_action text;
BEGIN
  IF p_state NOT IN ('active', 'stopped', 'dismissed') THEN
    RAISE EXCEPTION 'invalid recurring series state';
  END IF;
  IF p_cadence_override IS NOT NULL
     AND p_cadence_override NOT IN ('Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'Annual') THEN
    RAISE EXCEPTION 'invalid recurring cadence';
  END IF;
  IF p_expected_amount_override IS NOT NULL AND p_expected_amount_override <= 0 THEN
    RAISE EXCEPTION 'expected amount must be positive';
  END IF;
  IF p_reminder_days_before IS NOT NULL
     AND p_reminder_days_before NOT BETWEEN 0 AND 60 THEN
    RAISE EXCEPTION 'reminder must be between 0 and 60 days';
  END IF;
  IF length(trim(p_merchant_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid merchant key';
  END IF;

  -- The account is tenant-scoped independently of any browser-provided series.
  PERFORM 1 FROM public.accounts
   WHERE id = p_account_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'account not found'; END IF;

  SELECT id INTO v_id
    FROM public.recurring_series_overrides
   WHERE tenant_id = p_tenant_id AND account_id = p_account_id
     AND merchant_key = trim(p_merchant_key)
   FOR UPDATE;

  IF v_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', id, 'state', state, 'cadence_override', cadence_override,
      'expected_amount_override', expected_amount_override,
      'next_expected_override', next_expected_override,
      'reminder_days_before', reminder_days_before
    ) INTO v_before
    FROM public.recurring_series_overrides WHERE id = v_id;
  END IF;

  v_after := jsonb_build_object(
    'id', v_id, 'state', p_state, 'cadence_override', p_cadence_override,
    'expected_amount_override', p_expected_amount_override,
    'next_expected_override', p_next_expected_override,
    'reminder_days_before', p_reminder_days_before
  );

  IF v_before IS NOT NULL
     AND (v_before - 'id') = (v_after - 'id') THEN
    RETURN jsonb_build_object('changed', false, 'event_id', null, 'override_id', v_id);
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.recurring_series_overrides (
      tenant_id, account_id, merchant_key, state, cadence_override,
      expected_amount_override, next_expected_override, reminder_days_before
    ) VALUES (
      p_tenant_id, p_account_id, trim(p_merchant_key), p_state, p_cadence_override,
      p_expected_amount_override, p_next_expected_override, p_reminder_days_before
    ) RETURNING id INTO v_id;
    v_after := jsonb_set(v_after, '{id}', to_jsonb(v_id));
  ELSE
    UPDATE public.recurring_series_overrides SET
      state = p_state, cadence_override = p_cadence_override,
      expected_amount_override = p_expected_amount_override,
      next_expected_override = p_next_expected_override,
      reminder_days_before = p_reminder_days_before
    WHERE id = v_id AND tenant_id = p_tenant_id;
    v_after := jsonb_set(v_after, '{id}', to_jsonb(v_id));
  END IF;

  v_action := CASE
    WHEN p_state = 'stopped' THEN 'stopped'
    WHEN p_state = 'dismissed' THEN 'dismissed'
    WHEN v_before IS NOT NULL AND v_before->>'state' IN ('stopped', 'dismissed') AND p_state = 'active' THEN 'resumed'
    ELSE 'saved'
  END;
  INSERT INTO public.recurring_series_override_events (
    tenant_id, override_id, actor_id, action, before_state, after_state
  ) VALUES (p_tenant_id, v_id, p_actor_id, v_action, v_before, v_after)
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object('changed', true, 'event_id', v_event_id, 'override_id', v_id, 'state', p_state);
END;
$$;

CREATE FUNCTION public.undo_recurring_series_override_event(
  p_tenant_id uuid,
  p_event_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.recurring_series_override_events%ROWTYPE;
  v_current jsonb;
  v_before jsonb;
BEGIN
  SELECT * INTO v_event FROM public.recurring_series_override_events
   WHERE id = p_event_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recurring series change not found'; END IF;
  IF v_event.undone_at IS NOT NULL THEN RAISE EXCEPTION 'recurring series change already undone'; END IF;

  IF v_event.override_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', id, 'state', state, 'cadence_override', cadence_override,
      'expected_amount_override', expected_amount_override,
      'next_expected_override', next_expected_override,
      'reminder_days_before', reminder_days_before
    ) INTO v_current
    FROM public.recurring_series_overrides
    WHERE id = v_event.override_id AND tenant_id = p_tenant_id FOR UPDATE;
  END IF;
  IF v_current IS DISTINCT FROM v_event.after_state THEN
    RAISE EXCEPTION 'recurring series changed after this action';
  END IF;

  v_before := v_event.before_state;
  IF v_before IS NULL THEN
    DELETE FROM public.recurring_series_overrides
     WHERE id = v_event.override_id AND tenant_id = p_tenant_id;
  ELSE
    UPDATE public.recurring_series_overrides SET
      state = v_before->>'state',
      cadence_override = nullif(v_before->>'cadence_override', ''),
      expected_amount_override = nullif(v_before->>'expected_amount_override', '')::integer,
      next_expected_override = nullif(v_before->>'next_expected_override', '')::date,
      reminder_days_before = nullif(v_before->>'reminder_days_before', '')::smallint
    WHERE id = v_event.override_id AND tenant_id = p_tenant_id;
  END IF;
  UPDATE public.recurring_series_override_events
     SET undone_at = now(), undone_by = p_actor_id
   WHERE id = p_event_id AND tenant_id = p_tenant_id;
  RETURN jsonb_build_object('event_id', p_event_id, 'undone', true);
END;
$$;

REVOKE ALL ON FUNCTION public.save_recurring_series_override(uuid,uuid,uuid,text,text,text,integer,date,smallint),
  public.undo_recurring_series_override_event(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_recurring_series_override(uuid,uuid,uuid,text,text,text,integer,date,smallint),
  public.undo_recurring_series_override_event(uuid,uuid,uuid)
  TO service_role;

DO $$
DECLARE leaked text;
BEGIN
  SELECT string_agg(format('%s:%s/%s', grantee, table_name, privilege_type), ', ' ORDER BY table_name)
    INTO leaked
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name IN ('recurring_series_overrides', 'recurring_series_override_events')
     AND (grantee = 'anon'
       OR (grantee = 'authenticated' AND privilege_type <> 'SELECT')
       OR (grantee = 'service_role' AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')));
  IF leaked IS NOT NULL THEN RAISE EXCEPTION 'unexpected recurring write-back grants: %', leaked; END IF;
  IF has_function_privilege('authenticated',
    'public.save_recurring_series_override(uuid,uuid,uuid,text,text,text,integer,date,smallint)', 'EXECUTE')
    OR has_function_privilege('authenticated',
    'public.undo_recurring_series_override_event(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated may execute recurring write-back RPC';
  END IF;
END
$$;
