-- ═══════════════════════════════════════════════════════════════════════
-- Batch reject/external for the OskoLinker unmatched-leg queue, grouped by
-- merchant in the UI. Mirrors decide_transfers_batch() (20260814000000)
-- exactly, just wrapping decide_transfer_leg() instead of decide_transfer()
-- — same one-transaction thin loop, same 200-item cap. p_verdict inherits
-- decide_transfer_leg's own restriction to 'rejected'/'external' for free
-- (a lone leg has no counterpart to "confirm").
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.decide_transfer_legs_batch(
  p_tenant_id uuid,
  p_txn_ids   uuid[],
  p_verdict   text,
  p_note      text DEFAULT NULL
)
RETURNS TABLE (decision_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_txn_id uuid;
BEGIN
  IF array_length(p_txn_ids, 1) IS NULL OR array_length(p_txn_ids, 1) = 0 THEN
    RAISE EXCEPTION 'p_txn_ids must be non-empty';
  END IF;
  IF array_length(p_txn_ids, 1) > 200 THEN
    RAISE EXCEPTION 'p_txn_ids exceeds the 200-item batch limit';
  END IF;

  FOREACH v_txn_id IN ARRAY p_txn_ids LOOP
    decision_id := public.decide_transfer_leg(p_tenant_id, v_txn_id, p_verdict, p_note);
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decide_transfer_legs_batch(uuid, uuid[], text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.decide_transfer_legs_batch(uuid, uuid[], text, text) FROM anon;

DO $$
DECLARE bad_grants text;
BEGIN
  SELECT string_agg(grantee, ', ')
    INTO bad_grants
    FROM information_schema.role_routine_grants
   WHERE routine_name = 'decide_transfer_legs_batch' AND grantee = 'anon';
  IF bad_grants IS NOT NULL THEN
    RAISE EXCEPTION 'anon can execute decide_transfer_legs_batch: %', bad_grants;
  END IF;
END $$;
