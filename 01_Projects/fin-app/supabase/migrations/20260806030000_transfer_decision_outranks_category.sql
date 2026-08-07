-- ═══════════════════════════════════════════════════════════════════════
-- The user's verdict must outrank the category guess in analytics.
--
-- Two defects in the original transactions_analytic:
--
-- 1. `category = 'Transfer'` alone forced is_transfer true, so a user
--    clicking "Not a transfer" changed nothing: a bank-supplied or
--    AI-supplied category silently overruled an explicit human correction.
--    The repo already holds the opposite principle for merchant_rules —
--    "a human correction must outrank a model guess permanently, or the next
--    import silently reverts the fix and the user stops trusting the
--    feature" (20260804010000). The same rule has to apply here.
--
-- 2. The view read only transfer_links, which is a disposable cache.
--    20260806020000 made rescans delete rejected links (so a rejected leg
--    stops occupying its unique index), which means a rejection's effect on
--    analytics would have survived only until the next rescan. The durable
--    record is transfer_decisions, so that is what analytics must consult.
--
-- Precedence, strongest first:
--   durable decision  ->  cached link state  ->  category heuristic
-- ═══════════════════════════════════════════════════════════════════════

-- The decision lookup below probes by the leg's content key from both sides.
-- The existing unique index covers the from-side (its leading columns); the
-- to-side needs its own, or that branch degrades to a sequential scan on
-- every analytics read.
CREATE INDEX IF NOT EXISTS idx_transfer_decisions_to_leg
  ON public.transfer_decisions (tenant_id, to_account_id, to_hash, to_occurrence);

CREATE OR REPLACE VIEW public.transactions_analytic
WITH (security_invoker = true) AS
SELECT
  t.*,
  CASE
    -- An explicit human verdict wins outright, in both directions.
    WHEN d.verdict = 'rejected'               THEN false
    WHEN d.verdict IN ('confirmed', 'external') THEN true
    -- Otherwise fall back to the algorithm's cached link, then to the
    -- category heuristic (which still covers the synthetic reconciliation
    -- anchor and bank-labelled transfers nobody has reviewed yet).
    ELSE coalesce(
      t.category = 'Transfer' OR l.state IN ('auto', 'confirmed', 'external'),
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
-- Both laterals use UNION ALL rather than an OR across two columns: an OR
-- defeats the indexes and forces a nested loop per row, which is exactly the
-- Law 3 trap. Each branch below stays an index lookup.
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
