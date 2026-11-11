-- categorize-pending write-back after the 2026-10-04 transaction mutation boundary.
--
-- 20261004010000 revoked INSERT/UPDATE/DELETE on public.transactions from
-- `authenticated`. apply_merchant_categories was SECURITY INVOKER and called
-- through the RLS-scoped Edge client, so every post-sync categorisation pass
-- failed with 42501 and new provider rows stayed Uncategorized.
--
-- Fix, matching edit_transaction_category / bulk_edit_transaction_categories:
-- the RPC is service-role only and categorize-pending calls it through
-- ctx.admin() with the membership-verified ctx.tenantId. Re-granting UPDATE to
-- `authenticated`, or making this SECURITY DEFINER while browsers can still
-- execute it, would reopen a direct browser mutation path.
--
-- Because the service role bypasses RLS, the write is narrowed to exactly the
-- rows categorize-pending is allowed to touch (SYSTEM_INTEGRITY.md,
-- "Categorisation integrity"): same tenant, still Uncategorized, never
-- classified (category_source IS NULL). A row the user corrects — or a rule,
-- bank or seed classification that lands — between the sweep's read and this
-- write is therefore left alone. `category_source='user'` always wins.
CREATE OR REPLACE FUNCTION public.apply_merchant_categories(p_tenant_id uuid,p_assignments jsonb)
RETURNS bigint LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
  WITH a AS (
    SELECT (e->>'txn_id')::uuid txn_id,e->>'category' category,nullif(e->>'subcategory','') subcategory,
      e->>'category_source' category_source,nullif(e->>'category_confidence','')::real category_confidence,
      (e->>'needs_review')::boolean needs_review
    FROM jsonb_array_elements(p_assignments)e
  ),upd AS (
    UPDATE public.transactions t SET category=a.category,subcategory=a.subcategory,category_source=a.category_source,
      category_confidence=a.category_confidence,needs_review=a.needs_review
    FROM a WHERE t.id=a.txn_id AND t.tenant_id=p_tenant_id
      AND t.category='Uncategorized' AND t.category_source IS NULL
    RETURNING 1
  ) SELECT count(*) FROM upd;
$$;

REVOKE ALL ON FUNCTION public.apply_merchant_categories(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_merchant_categories(uuid,jsonb) TO service_role;

DO $$ BEGIN
  IF has_function_privilege('anon','public.apply_merchant_categories(uuid,jsonb)','EXECUTE')
     OR has_function_privilege('authenticated','public.apply_merchant_categories(uuid,jsonb)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.apply_merchant_categories(uuid,jsonb)','EXECUTE')
     OR (SELECT prosecdef FROM pg_proc WHERE oid='public.apply_merchant_categories(uuid,jsonb)'::regprocedure)
     OR has_table_privilege('authenticated','public.transactions','INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon','public.transactions','INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'apply_merchant_categories grants invalid';
  END IF;
END $$;
