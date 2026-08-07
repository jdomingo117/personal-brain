-- ═══════════════════════════════════════════════════════════════════════
-- transactions.provider_posted_at (a timestamptz, added 20260807000000) is
-- already populated for every Up-sourced row — sync-provider never actually
-- discarded the time component, it just never reached the matcher, because
-- transfer_candidates() didn't select it. Wiring it through lets match.ts
-- use it as an ambiguity tie-breaker (scoreTime) between two same-day,
-- same-amount candidates. Still null for CSV/manual rows, so this only ever
-- activates when at least one leg is Up-sourced.
--
-- DROP + CREATE, not CREATE OR REPLACE: Postgres does not allow changing a
-- function's return columns in place (the same constraint 20260807000000
-- already hit for transactions_analytic's column list).
-- ═══════════════════════════════════════════════════════════════════════

DROP FUNCTION public.transfer_candidates(uuid, date, date);

CREATE FUNCTION public.transfer_candidates(
  p_tenant_id uuid,
  p_from      date,
  p_to        date
)
RETURNS TABLE (
  txn_id               uuid,
  account_id           uuid,
  account_name         text,
  account_type         public.account_type,
  txn_date             date,
  amount               int,
  original_description text,
  dedupe_hash          bytea,
  occurrence           int,
  subcategory          text,
  provider_posted_at   timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    t.id, t.account_id, a.name, a.type, t.date, t.amount,
    t.original_description, t.dedupe_hash, t.occurrence, t.subcategory,
    t.provider_posted_at
  FROM public.transactions t
  JOIN public.accounts a ON a.id = t.account_id
  WHERE t.tenant_id = p_tenant_id
    AND t.transfer_candidate
    AND t.date BETWEEN p_from AND p_to
    AND t.amount <> 0
    AND a.type IN ('Liquid', 'Savings', 'Credit Card')
    AND t.subcategory IS DISTINCT FROM 'Reconciliation'
    AND NOT t.pending;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_candidates(uuid, date, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.transfer_candidates(uuid, date, date) FROM anon;

DO $$
DECLARE bad_grants text;
BEGIN
  SELECT string_agg(grantee, ', ')
    INTO bad_grants
    FROM information_schema.role_routine_grants
   WHERE routine_name = 'transfer_candidates' AND grantee = 'anon';
  IF bad_grants IS NOT NULL THEN
    RAISE EXCEPTION 'anon can execute transfer_candidates: %', bad_grants;
  END IF;
END $$;
