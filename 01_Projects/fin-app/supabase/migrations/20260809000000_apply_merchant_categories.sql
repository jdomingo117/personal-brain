-- Bulk category write-back for categorize-pending.
--
-- The CSV path applies categories client-side to staged rows before they are
-- ever committed, so it never needed this. The provider path categorises rows
-- that are ALREADY in the ledger, which means one UPDATE per transaction —
-- thousands of PostgREST round trips without this. Law 2: the set operation
-- belongs in SQL.

CREATE OR REPLACE FUNCTION public.apply_merchant_categories(
  p_tenant_id   uuid,
  p_assignments jsonb
)
RETURNS bigint
LANGUAGE sql
SECURITY INVOKER  -- RLS still applies; the tenant filter below is belt-and-braces
SET search_path = public, pg_temp
AS $$
  WITH a AS (
    SELECT
      (e->>'txn_id')::uuid            AS txn_id,
      e->>'category'                  AS category,
      nullif(e->>'subcategory', '')   AS subcategory,
      e->>'category_source'           AS category_source,
      (e->>'needs_review')::boolean   AS needs_review
    FROM jsonb_array_elements(p_assignments) e
  ),
  upd AS (
    UPDATE public.transactions t
       SET category        = a.category,
           subcategory     = a.subcategory,
           category_source = a.category_source,
           needs_review    = a.needs_review
      FROM a
     WHERE t.id = a.txn_id
       AND t.tenant_id = p_tenant_id
       -- A human correction outranks everything, permanently. The sweep only
       -- selects category_source IS NULL rows, but this is the durable guard
       -- that survives a future caller forgetting that filter.
       AND t.category_source IS DISTINCT FROM 'user'
    RETURNING 1
  )
  SELECT count(*) FROM upd;
$$;

GRANT EXECUTE ON FUNCTION public.apply_merchant_categories(uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_merchant_categories(uuid, jsonb) FROM anon;

-- ── Assertions ────────────────────────────────────────────────────────────
DO $$
DECLARE
  bad_grants text;
BEGIN
  SELECT string_agg(format('%s:%s', grantee, privilege_type), ', ')
    INTO bad_grants
    FROM information_schema.role_routine_grants
   WHERE routine_name = 'apply_merchant_categories' AND grantee = 'anon';
  IF bad_grants IS NOT NULL THEN
    RAISE EXCEPTION 'anon can execute apply_merchant_categories: %', bad_grants;
  END IF;
END $$;
