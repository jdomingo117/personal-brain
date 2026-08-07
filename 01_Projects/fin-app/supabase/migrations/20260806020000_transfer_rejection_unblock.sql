-- ═══════════════════════════════════════════════════════════════════════
-- Fix: a rejected link permanently blocked its legs from re-matching.
--
-- The defect: idx_transfer_links_from_leg / _to_leg enforce "a transaction
-- participates in at most one link". replace_transfer_links only deleted
-- 'auto'/'suggested' rows, so a 'rejected' row kept holding those indexes.
-- When the TRUE counterpart was imported later, the correct pair hit
-- ON CONFLICT DO NOTHING and was silently discarded — `created` came back 0
-- with no error anywhere. Rejecting one wrong guess disabled transfer
-- detection for that transaction permanently.
--
-- The semantic distinction the original logic missed:
--   confirmed / external — the user asserted a link EXISTS. It legitimately
--                          occupies the leg. Keep it pinned.
--   rejected             — the user asserted this pair is NOT a link. It must
--                          therefore NOT occupy the leg. Delete the row; the
--                          durable record in transfer_decisions is what stops
--                          it being re-suggested, not the cached link row.
--
-- Deleting rejected rows alone is not sufficient: the matcher would just
-- regenerate the same highest-scoring wrong pair and greedily consume both
-- legs again, so the correct pair still never forms. transfer_match_exclusions
-- below feeds those rejections back into the matcher so it skips them and
-- moves on to the next-best candidate.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Exclusions the matcher must respect ────────────────────────────────
--
-- 'rejected_pair' — resolved from the content-keyed decision back to whatever
--   transaction ids currently hold that content, so a rejection survives the
--   delete-and-reimport cycle exactly like a confirmation does.
-- 'pinned_leg'   — legs already held by a confirmed/external link. Without
--   this the matcher would propose pairs touching them, and those proposals
--   would be silently dropped by the same ON CONFLICT that caused the bug.

CREATE OR REPLACE FUNCTION public.transfer_match_exclusions(p_tenant_id uuid)
RETURNS TABLE (kind text, from_txn_id uuid, to_txn_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT 'rejected_pair'::text, ft.id, tt.id
    FROM public.transfer_decisions d
    JOIN public.transactions ft
      ON ft.tenant_id  = p_tenant_id
     AND ft.account_id = d.from_account_id
     AND ft.dedupe_hash = d.from_hash
     AND ft.occurrence  = d.from_occurrence
    LEFT JOIN public.transactions tt
      ON tt.tenant_id  = p_tenant_id
     AND tt.account_id = d.to_account_id
     AND tt.dedupe_hash = d.to_hash
     AND tt.occurrence  = d.to_occurrence
   WHERE d.tenant_id = p_tenant_id
     AND d.verdict = 'rejected'

  UNION ALL

  SELECT 'pinned_leg'::text, l.from_txn_id, l.to_txn_id
    FROM public.transfer_links l
   WHERE l.tenant_id = p_tenant_id
     AND l.state IN ('confirmed', 'external');
$$;

GRANT EXECUTE ON FUNCTION public.transfer_match_exclusions(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.transfer_match_exclusions(uuid) FROM anon;

-- ── replace_transfer_links, corrected ──────────────────────────────────
--
-- Changes from 20260806000000:
--   1. 'rejected' joins 'auto'/'suggested' in the delete set (see above).
--   2. `kept` reports the real number of pinned (confirmed/external) links
--      left untouched in the window — it was hardcoded to 0, which made the
--      return value quietly misleading.
--   3. Rows the unique indexes refuse are now surfaced: `created` is compared
--      against the number submitted, and a shortfall raises a warning rather
--      than vanishing. A silent ON CONFLICT drop is exactly what hid the
--      original defect.

CREATE OR REPLACE FUNCTION public.replace_transfer_links(
  p_tenant_id       uuid,
  p_from            date,
  p_to              date,
  p_links           jsonb,
  p_matcher_version int
)
RETURNS TABLE (created int, kept int, removed int)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_removed   int;
  v_created   int;
  v_kept      int;
  v_submitted int;
BEGIN
  -- 1. Drop everything the algorithm owns, plus rejections. A rejection is
  --    durable in transfer_decisions; the link row is only a cache of it and
  --    must not keep occupying the leg's unique index.
  WITH stale AS (
    SELECT l.id
      FROM public.transfer_links l
      JOIN public.transactions ft ON ft.id = l.from_txn_id
      LEFT JOIN public.transactions tt ON tt.id = l.to_txn_id
     WHERE l.tenant_id = p_tenant_id
       AND l.state IN ('auto', 'suggested', 'rejected')
       AND ft.date BETWEEN p_from AND p_to
       AND (tt.id IS NULL OR tt.date BETWEEN p_from AND p_to)
  )
  DELETE FROM public.transfer_links WHERE id IN (SELECT id FROM stale);
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  -- 2. Count what survives untouched, so the caller can tell "nothing matched"
  --    apart from "everything here is already settled".
  SELECT count(*) INTO v_kept
    FROM public.transfer_links l
    JOIN public.transactions ft ON ft.id = l.from_txn_id
   WHERE l.tenant_id = p_tenant_id
     AND l.state IN ('confirmed', 'external')
     AND ft.date BETWEEN p_from AND p_to;

  SELECT count(*) INTO v_submitted FROM jsonb_array_elements(p_links);

  INSERT INTO public.transfer_links (
    tenant_id, from_txn_id, to_txn_id, state, score, reasons, ambiguous,
    matcher_version, from_account_id, from_hash, from_occurrence,
    to_account_id, to_hash, to_occurrence
  )
  SELECT
    p_tenant_id,
    (elem ->> 'from_txn_id')::uuid,
    NULLIF(elem ->> 'to_txn_id', '')::uuid,
    elem ->> 'state',
    (elem ->> 'score')::real,
    coalesce(elem -> 'reasons', '[]'::jsonb),
    coalesce((elem ->> 'ambiguous')::boolean, false),
    p_matcher_version,
    (elem ->> 'from_account_id')::uuid,
    decode(elem ->> 'from_hash', 'hex'),
    (elem ->> 'from_occurrence')::int,
    NULLIF(elem ->> 'to_account_id', '')::uuid,
    CASE WHEN elem ->> 'to_hash' IS NULL THEN NULL ELSE decode(elem ->> 'to_hash', 'hex') END,
    NULLIF(elem ->> 'to_occurrence', '')::int
  FROM jsonb_array_elements(p_links) elem
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_created = ROW_COUNT;

  IF v_created < v_submitted THEN
    RAISE WARNING 'replace_transfer_links: % of % proposed links were refused by the one-link-per-leg indexes (tenant %)',
      v_submitted - v_created, v_submitted, p_tenant_id;
  END IF;

  -- 3. Re-apply durable decisions to whatever now exists in-window.
  UPDATE public.transfer_links l
     SET state = d.verdict
    FROM public.transfer_decisions d
   WHERE l.tenant_id = p_tenant_id
     AND d.tenant_id = p_tenant_id
     AND l.from_account_id = d.from_account_id
     AND l.from_hash       = d.from_hash
     AND l.from_occurrence = d.from_occurrence
     AND l.to_account_id IS NOT DISTINCT FROM d.to_account_id
     AND l.to_hash       IS NOT DISTINCT FROM d.to_hash
     AND l.to_occurrence IS NOT DISTINCT FROM d.to_occurrence
     AND l.state <> d.verdict;

  RETURN QUERY SELECT v_created, v_kept, v_removed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_transfer_links(uuid, date, date, jsonb, int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.replace_transfer_links(uuid, date, date, jsonb, int) FROM anon;
