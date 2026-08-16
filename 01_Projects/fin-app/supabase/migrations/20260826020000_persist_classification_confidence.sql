-- Make the Phase 5 review threshold effective for both provider and CSV paths.
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
    FROM a WHERE t.id=a.txn_id AND t.tenant_id=p_tenant_id AND t.category_source IS DISTINCT FROM 'user' RETURNING 1
  ) SELECT count(*) FROM upd;
$$;

DO $$ DECLARE def text;
BEGIN
  SELECT pg_get_functiondef('public.import_transactions_atomic(uuid,uuid,jsonb,uuid,integer,text,integer,integer)'::regprocedure) INTO def;
  def:=replace(def,'category_source, needs_review, dedupe_hash, occurrence,','category_source, category_confidence, needs_review, dedupe_hash, occurrence,');
  def:=replace(def,'x.category_source, COALESCE(x.needs_review, false),','x.category_source, x.category_confidence, COALESCE(x.needs_review, false),');
  def:=replace(def,'category_source text,'||chr(10)||'      needs_review boolean,','category_source text,'||chr(10)||'      category_confidence real,'||chr(10)||'      needs_review boolean,');
  IF def NOT LIKE '%x.category_confidence%' THEN RAISE EXCEPTION 'could not patch import confidence';END IF;
  EXECUTE def;
END $$;

REVOKE EXECUTE ON FUNCTION public.apply_merchant_categories(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_merchant_categories(uuid,jsonb) TO authenticated,service_role;
