-- ═══════════════════════════════════════════════════════════════════════
-- A 'suggested' transfer pair (score 0.55-0.8, sitting in the OskoLinker
-- review queue) currently still counts as ordinary income/expense in every
-- KPI until a human confirms it — the review queue is meant to catch
-- ambiguous cases, not to leave them polluting totals in the meantime.
--
-- Precedence is unchanged: durable decision -> cached link state -> category
-- heuristic. Only the middle tier's IN-list gains 'suggested' alongside
-- 'auto'/'confirmed'/'external'. A rejection still flips a leg back to
-- ordinary spend/income, correctly, since rejecting means "this was never a
-- transfer" — that path is untouched.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.transactions_analytic
WITH (security_invoker = true) AS
SELECT
  t.*,
  CASE
    WHEN d.verdict = 'rejected'               THEN false
    WHEN d.verdict IN ('confirmed', 'external') THEN true
    ELSE coalesce(
      t.category = 'Transfer' OR l.state IN ('auto', 'suggested', 'confirmed', 'external'),
      false
    )
  END AS is_transfer,
  coalesce(
    l.state,
    d.verdict,
    CASE WHEN t.transfer_candidate THEN 'unmatched' ELSE 'none' END
  ) AS transfer_state,
  l.id AS transfer_link_id
FROM public.transactions t
LEFT JOIN LATERAL (
  SELECT id, state FROM public.transfer_links WHERE from_txn_id = t.id
  UNION ALL
  SELECT id, state FROM public.transfer_links WHERE to_txn_id   = t.id
  LIMIT 1
) l ON true
LEFT JOIN LATERAL (
  SELECT verdict FROM (
    SELECT dd.verdict, dd.decided_at
      FROM public.transfer_decisions dd
     WHERE dd.tenant_id       = t.tenant_id
       AND dd.from_account_id = t.account_id
       AND dd.from_hash       = t.dedupe_hash
       AND dd.from_occurrence = t.occurrence
    UNION ALL
    SELECT dd.verdict, dd.decided_at
      FROM public.transfer_decisions dd
     WHERE dd.tenant_id     = t.tenant_id
       AND dd.to_account_id = t.account_id
       AND dd.to_hash       = t.dedupe_hash
       AND dd.to_occurrence = t.occurrence
  ) either_leg
  ORDER BY decided_at DESC
  LIMIT 1
) d ON true;

GRANT SELECT ON public.transactions_analytic TO authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.transactions_analytic
  FROM anon, authenticated, service_role;
REVOKE ALL ON public.transactions_analytic FROM anon;

DO $$
DECLARE leaky_views text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO leaky_views
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v'
     AND NOT coalesce(
           (SELECT option_value::boolean
              FROM pg_options_to_table(c.reloptions) o
             WHERE o.option_name = 'security_invoker'),
           false);
  IF leaky_views IS NOT NULL THEN
    RAISE EXCEPTION 'Views in public without security_invoker=true: %', leaky_views;
  END IF;
END $$;
