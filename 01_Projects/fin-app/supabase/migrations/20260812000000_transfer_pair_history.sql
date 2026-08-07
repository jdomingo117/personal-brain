-- ═══════════════════════════════════════════════════════════════════════
-- Feeds the recurring-pair cadence bonus in match.ts/transferMatch.ts:
-- once an account pair has an established, human-confirmed transfer
-- pattern (e.g. a fortnightly savings sweep), later instances of that same
-- pattern should need less manual confirmation. Only 'auto'/'confirmed'
-- links count as history — never 'suggested'/'unmatched', which are
-- unconfirmed guesses and must not be allowed to reinforce themselves.
--
-- Keyed by the unordered account pair (least/greatest) so a sweep that
-- occasionally reverses direction is still recognised as one relationship,
-- not two. Aggregation of the raw (date, amount) observations stays here in
-- SQL (Law 2); the gap-median/conformance/CV maths that turns them into a
-- cadence happens in TS (lib/transfers/pairCadence.ts), mirroring how
-- lib/recurring.ts already does that over a small per-key result set.
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.transfer_pair_history(p_tenant_id uuid)
RETURNS TABLE (
  pair_key     text,
  txn_date     date,
  amount_cents int
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    least(l.from_account_id, l.to_account_id)::text
      || ':' || greatest(l.from_account_id, l.to_account_id)::text AS pair_key,
    t.date,
    abs(t.amount) AS amount_cents
  FROM public.transfer_links l
  JOIN public.transactions t ON t.id = l.from_txn_id
  WHERE l.tenant_id = p_tenant_id
    AND l.state IN ('auto', 'confirmed')
    AND l.to_account_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_pair_history(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.transfer_pair_history(uuid) FROM anon;

DO $$
DECLARE bad_grants text;
BEGIN
  SELECT string_agg(grantee, ', ')
    INTO bad_grants
    FROM information_schema.role_routine_grants
   WHERE routine_name = 'transfer_pair_history' AND grantee = 'anon';
  IF bad_grants IS NOT NULL THEN
    RAISE EXCEPTION 'anon can execute transfer_pair_history: %', bad_grants;
  END IF;
END $$;
