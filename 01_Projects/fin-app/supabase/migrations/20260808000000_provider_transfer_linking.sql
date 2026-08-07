-- Phase 2: consume Up's `transferAccount` relationship as a ground-truth
-- transfer signal. Stored raw at sync time (see 20260807000000's
-- provider_transfer_account_id column comment) — this migration is what lets
-- link-transfers actually resolve it, by exposing it to the RPC candidate
-- rows so the Edge Function can join it against account_connections.

-- `transfer_candidates`' column list is changing (two new columns), which
-- Postgres does not allow via a plain CREATE OR REPLACE — the return type
-- itself is different, not just the body.
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
  provider             text,
  provider_transfer_account_id text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    t.id, t.account_id, a.name, a.type, t.date, t.amount,
    t.original_description, t.dedupe_hash, t.occurrence, t.subcategory,
    t.provider, t.provider_transfer_account_id
  FROM public.transactions t
  JOIN public.accounts a ON a.id = t.account_id
  WHERE t.tenant_id = p_tenant_id
    AND t.transfer_candidate
    AND t.date BETWEEN p_from AND p_to
    AND t.amount <> 0
    AND a.type IN ('Liquid', 'Savings', 'Credit Card')
    AND NOT t.pending
    -- Never link the synthetic opening-balance anchor from buildAnchor().
    AND t.subcategory IS DISTINCT FROM 'Reconciliation';
$$;

GRANT EXECUTE ON FUNCTION public.transfer_candidates(uuid, date, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.transfer_candidates(uuid, date, date) FROM anon;

-- ── Assertions ────────────────────────────────────────────────────────────
DO $$
DECLARE
  bad_grants text;
BEGIN
  SELECT string_agg(format('%s:%s', grantee, privilege_type), ', ')
    INTO bad_grants
    FROM information_schema.role_routine_grants
   WHERE routine_name = 'transfer_candidates' AND grantee = 'anon';
  IF bad_grants IS NOT NULL THEN
    RAISE EXCEPTION 'anon can execute transfer_candidates: %', bad_grants;
  END IF;
END $$;
