-- Cross-ledger reconciliation between cash transactions and managed-investment
-- activities. This deliberately does not synthesize transaction rows: the bank
-- ledger and investment ledger retain their own accounting meanings while a
-- durable link controls cash-flow analytics and review UX.

CREATE TABLE public.investment_cash_links (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  transaction_id       uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  activity_id          uuid NOT NULL REFERENCES public.investment_activities(id) ON DELETE CASCADE,
  state                text NOT NULL CHECK (state IN ('auto', 'suggested', 'confirmed')),
  score                real NOT NULL CHECK (score >= 0 AND score <= 1),
  reasons              jsonb NOT NULL DEFAULT '[]'::jsonb,
  ambiguous            boolean NOT NULL DEFAULT false,
  matcher_version      integer NOT NULL,
  transaction_account_id uuid NOT NULL,
  transaction_hash     bytea NOT NULL,
  transaction_occurrence integer NOT NULL CHECK (transaction_occurrence >= 0),
  activity_account_id  uuid NOT NULL,
  activity_hash        text NOT NULL CHECK (activity_hash ~ '^[0-9a-f]{64}$'),
  activity_occurrence  integer NOT NULL CHECK (activity_occurrence >= 0),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_id),
  UNIQUE (activity_id)
);

CREATE TABLE public.investment_cash_decisions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  transaction_account_id uuid NOT NULL,
  transaction_hash     bytea NOT NULL,
  transaction_occurrence integer NOT NULL CHECK (transaction_occurrence >= 0),
  activity_account_id  uuid NOT NULL,
  activity_hash        text NOT NULL CHECK (activity_hash ~ '^[0-9a-f]{64}$'),
  activity_occurrence  integer NOT NULL CHECK (activity_occurrence >= 0),
  verdict              text NOT NULL CHECK (verdict IN ('confirmed', 'rejected')),
  note                 text CHECK (note IS NULL OR length(note) <= 500),
  decided_by           uuid NOT NULL REFERENCES auth.users(id),
  decided_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (
    tenant_id,
    transaction_account_id, transaction_hash, transaction_occurrence,
    activity_account_id, activity_hash, activity_occurrence
  )
);

CREATE INDEX idx_investment_cash_links_tenant_state
  ON public.investment_cash_links (tenant_id, state);
CREATE INDEX idx_investment_cash_decisions_transaction
  ON public.investment_cash_decisions
  (tenant_id, transaction_account_id, transaction_hash, transaction_occurrence, decided_at DESC);
CREATE INDEX idx_investment_cash_decisions_activity
  ON public.investment_cash_decisions
  (tenant_id, activity_account_id, activity_hash, activity_occurrence, decided_at DESC);

CREATE TRIGGER handle_updated_at_investment_cash_links
  BEFORE UPDATE ON public.investment_cash_links
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.investment_cash_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_cash_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read investment cash links" ON public.investment_cash_links
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members read investment cash decisions" ON public.investment_cash_decisions
  FOR SELECT USING (public.is_tenant_member(tenant_id));

GRANT SELECT ON public.investment_cash_links, public.investment_cash_decisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investment_cash_links, public.investment_cash_decisions TO service_role;
REVOKE ALL ON public.investment_cash_links, public.investment_cash_decisions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.investment_cash_links, public.investment_cash_decisions FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON public.investment_cash_links, public.investment_cash_decisions FROM service_role;

-- Atomic replacement of disposable auto/suggested matches inside a padded
-- window. Confirmed links are pinned; durable decisions are separate.
CREATE FUNCTION public.replace_investment_cash_links(
  p_tenant_id uuid,
  p_from date,
  p_to date,
  p_links jsonb,
  p_matcher_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE removed_count integer; inserted_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;

  DELETE FROM public.investment_cash_links l
   USING public.transactions t, public.investment_activities a
   WHERE l.tenant_id = p_tenant_id
     AND l.state IN ('auto', 'suggested')
     AND t.id = l.transaction_id
     AND a.id = l.activity_id
     AND (t.date BETWEEN p_from AND p_to OR a.trade_date BETWEEN p_from AND p_to);
  GET DIAGNOSTICS removed_count = ROW_COUNT;

  INSERT INTO public.investment_cash_links (
    tenant_id, transaction_id, activity_id, state, score, reasons, ambiguous, matcher_version,
    transaction_account_id, transaction_hash, transaction_occurrence,
    activity_account_id, activity_hash, activity_occurrence
  )
  SELECT
    p_tenant_id, t.id, a.id, x.state, x.score, x.reasons, x.ambiguous, p_matcher_version,
    t.account_id, t.dedupe_hash, t.occurrence,
    a.account_id, a.source_hash, a.occurrence
  FROM jsonb_to_recordset(COALESCE(p_links, '[]'::jsonb)) AS x(
    transaction_id uuid, activity_id uuid, state text, score real, reasons jsonb, ambiguous boolean
  )
  JOIN public.transactions t ON t.id = x.transaction_id AND t.tenant_id = p_tenant_id
  JOIN public.investment_activities a ON a.id = x.activity_id AND a.tenant_id = p_tenant_id
  WHERE x.state IN ('auto', 'suggested', 'confirmed')
    AND a.activity_type IN ('purchase', 'redemption')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN jsonb_build_object('created', inserted_count, 'removed', removed_count);
END;
$$;

CREATE FUNCTION public.decide_investment_cash_link(
  p_tenant_id uuid,
  p_link_id uuid,
  p_verdict text,
  p_decided_by uuid,
  p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE link_row public.investment_cash_links%ROWTYPE; decision_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
  IF p_verdict NOT IN ('confirmed', 'rejected') THEN RAISE EXCEPTION 'invalid verdict'; END IF;
  IF length(COALESCE(p_note, '')) > 500 THEN RAISE EXCEPTION 'note too long'; END IF;

  SELECT * INTO link_row FROM public.investment_cash_links
   WHERE id = p_link_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'investment cash link not found'; END IF;

  INSERT INTO public.investment_cash_decisions (
    tenant_id, transaction_account_id, transaction_hash, transaction_occurrence,
    activity_account_id, activity_hash, activity_occurrence,
    verdict, note, decided_by, decided_at
  ) VALUES (
    p_tenant_id, link_row.transaction_account_id, link_row.transaction_hash, link_row.transaction_occurrence,
    link_row.activity_account_id, link_row.activity_hash, link_row.activity_occurrence,
    p_verdict, p_note, p_decided_by, now()
  )
  ON CONFLICT (
    tenant_id,
    transaction_account_id, transaction_hash, transaction_occurrence,
    activity_account_id, activity_hash, activity_occurrence
  ) DO UPDATE SET verdict = EXCLUDED.verdict, note = EXCLUDED.note,
                  decided_by = EXCLUDED.decided_by, decided_at = now()
  RETURNING id INTO decision_id;

  IF p_verdict = 'confirmed' THEN
    UPDATE public.investment_cash_links SET state = 'confirmed' WHERE id = p_link_id;
  ELSE
    DELETE FROM public.investment_cash_links WHERE id = p_link_id;
  END IF;
  RETURN decision_id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_investment_cash_links(uuid, date, date, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_investment_cash_link(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_investment_cash_links(uuid, date, date, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_investment_cash_link(uuid, uuid, text, uuid, text) TO service_role;

-- The newest human decision across either transfer system wins. In the
-- absence of a decision, suggested cross-ledger pairs are excluded from cash
-- flow just like suggested bank-to-bank pairs.
CREATE OR REPLACE VIEW public.transactions_analytic
WITH (security_invoker = true) AS
SELECT
  t.*,
  CASE
    WHEN d.verdict = 'rejected' THEN false
    WHEN d.verdict IN ('confirmed', 'external') THEN true
    ELSE COALESCE(
      t.category = 'Transfer'
      OR l.state IN ('auto', 'suggested', 'confirmed', 'external')
      OR il.state IN ('auto', 'suggested', 'confirmed'),
      false
    )
  END AS is_transfer,
  COALESCE(
    il.state,
    l.state,
    d.verdict,
    CASE WHEN t.transfer_candidate THEN 'unmatched' ELSE 'none' END
  ) AS transfer_state,
  l.id AS transfer_link_id,
  il.id AS investment_cash_link_id
FROM public.transactions t
LEFT JOIN LATERAL (
  SELECT id, state FROM public.transfer_links WHERE from_txn_id = t.id
  UNION ALL
  SELECT id, state FROM public.transfer_links WHERE to_txn_id = t.id
  LIMIT 1
) l ON true
LEFT JOIN public.investment_cash_links il ON il.transaction_id = t.id
LEFT JOIN LATERAL (
  SELECT verdict FROM (
    SELECT dd.verdict, dd.decided_at
      FROM public.transfer_decisions dd
     WHERE dd.tenant_id = t.tenant_id
       AND dd.from_account_id = t.account_id
       AND dd.from_hash = t.dedupe_hash
       AND dd.from_occurrence = t.occurrence
    UNION ALL
    SELECT dd.verdict, dd.decided_at
      FROM public.transfer_decisions dd
     WHERE dd.tenant_id = t.tenant_id
       AND dd.to_account_id = t.account_id
       AND dd.to_hash = t.dedupe_hash
       AND dd.to_occurrence = t.occurrence
    UNION ALL
    SELECT id.verdict, id.decided_at
      FROM public.investment_cash_decisions id
     WHERE id.tenant_id = t.tenant_id
       AND id.transaction_account_id = t.account_id
       AND id.transaction_hash = t.dedupe_hash
       AND id.transaction_occurrence = t.occurrence
  ) decisions
  ORDER BY decided_at DESC
  LIMIT 1
) d ON true;

GRANT SELECT ON public.transactions_analytic TO authenticated;
REVOKE ALL ON public.transactions_analytic FROM anon;

DO $$
DECLARE bad_tables text; bad_views text; anon_grants text; bad_functions text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO bad_tables
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF bad_tables IS NOT NULL THEN RAISE EXCEPTION 'public tables without RLS: %', bad_tables; END IF;

  SELECT string_agg(c.relname, ', ') INTO bad_views
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v'
     AND COALESCE(array_to_string(c.reloptions, ','), '') NOT LIKE '%security_invoker=true%';
  IF bad_views IS NOT NULL THEN RAISE EXCEPTION 'public views without security_invoker: %', bad_views; END IF;

  SELECT string_agg(table_name || ':' || privilege_type, ', ') INTO anon_grants
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee = 'anon';
  IF anon_grants IS NOT NULL THEN RAISE EXCEPTION 'anon grants remain: %', anon_grants; END IF;

  SELECT string_agg(routine_name, ', ') INTO bad_functions
    FROM information_schema.role_routine_grants
   WHERE routine_schema = 'public' AND grantee IN ('anon', 'authenticated')
     AND routine_name IN ('replace_investment_cash_links', 'decide_investment_cash_link');
  IF bad_functions IS NOT NULL THEN RAISE EXCEPTION 'protected investment cash RPC grants remain: %', bad_functions; END IF;
END $$;
