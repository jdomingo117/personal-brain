-- PostgreSQL expands `t.*` when a view is created. Adding
-- transactions.category_confidence therefore does not make it appear in the
-- existing analytic view automatically; rebuild the view so DataContext can
-- expose confidence to the ledger.

DROP VIEW public.transactions_analytic;

CREATE VIEW public.transactions_analytic
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
DECLARE bad_views text; anon_grants text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO bad_views
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v'
     AND coalesce(c.reloptions, ARRAY[]::text[]) @> ARRAY['security_invoker=true'] = false;
  IF bad_views IS NOT NULL THEN RAISE EXCEPTION 'views without security_invoker: %', bad_views; END IF;

  SELECT string_agg(format('%s:%s/%s', grantee, table_name, privilege_type), ', ')
    INTO anon_grants FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee = 'anon';
  IF anon_grants IS NOT NULL THEN RAISE EXCEPTION 'anon grants: %', anon_grants; END IF;
END $$;
