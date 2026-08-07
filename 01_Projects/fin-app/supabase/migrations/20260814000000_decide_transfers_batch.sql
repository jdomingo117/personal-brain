-- ═══════════════════════════════════════════════════════════════════════
-- Batch confirm/reject/external for the OskoLinker review queue, grouped by
-- account pair in the UI. decide_transfer() already does the correct
-- per-link work (upsert transfer_decisions, update transfer_links.state);
-- looping it from the client N times would work but costs N HTTP
-- round-trips and N rate-limit hits for what the user experiences as one
-- button press. This wraps it in a single transaction instead — one id
-- failing (e.g. a stale link no longer belonging to the tenant) rolls back
-- the whole batch, matching what a user expects from one click.
--
-- Capped at 200 ids so a pathological request can't build an unbounded
-- transaction — same defensive-cap spirit as match.ts's MAX_BUCKET.
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.decide_transfers_batch(
  p_tenant_id uuid,
  p_link_ids  uuid[],
  p_verdict   text,
  p_note      text DEFAULT NULL
)
RETURNS TABLE (decision_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link_id uuid;
BEGIN
  IF array_length(p_link_ids, 1) IS NULL OR array_length(p_link_ids, 1) = 0 THEN
    RAISE EXCEPTION 'p_link_ids must be non-empty';
  END IF;
  IF array_length(p_link_ids, 1) > 200 THEN
    RAISE EXCEPTION 'p_link_ids exceeds the 200-item batch limit';
  END IF;

  FOREACH v_link_id IN ARRAY p_link_ids LOOP
    decision_id := public.decide_transfer(p_tenant_id, v_link_id, p_verdict, p_note);
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decide_transfers_batch(uuid, uuid[], text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.decide_transfers_batch(uuid, uuid[], text, text) FROM anon;

DO $$
DECLARE bad_grants text;
BEGIN
  SELECT string_agg(grantee, ', ')
    INTO bad_grants
    FROM information_schema.role_routine_grants
   WHERE routine_name = 'decide_transfers_batch' AND grantee = 'anon';
  IF bad_grants IS NOT NULL THEN
    RAISE EXCEPTION 'anon can execute decide_transfers_batch: %', bad_grants;
  END IF;
END $$;
