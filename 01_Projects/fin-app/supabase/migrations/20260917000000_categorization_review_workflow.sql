-- Preview-first categorisation review: apply heterogeneous accepted suggestions
-- atomically while protecting manual work and rejecting stale previews.

CREATE FUNCTION public.apply_categorization_review(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_assignments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operation_id uuid := gen_random_uuid();
  v_requested integer;
  v_visible integer;
  v_updated integer;
BEGIN
  IF jsonb_typeof(p_assignments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'assignments must be an array';
  END IF;
  v_requested := jsonb_array_length(p_assignments);
  IF v_requested < 1 OR v_requested > 500 THEN
    RAISE EXCEPTION 'select between 1 and 500 transactions';
  END IF;

  CREATE TEMP TABLE review_assignments ON COMMIT DROP AS
  SELECT
    (value->>'transaction_id')::uuid AS transaction_id,
    value->>'before_category' AS before_category,
    nullif(value->>'before_subcategory', '') AS before_subcategory,
    nullif(value->>'before_source', '') AS before_source,
    nullif(value->>'before_confidence', '')::real AS before_confidence,
    (value->>'before_needs_review')::boolean AS before_needs_review,
    value->>'category' AS category,
    nullif(value->>'subcategory', '') AS subcategory
  FROM jsonb_array_elements(p_assignments);

  IF v_requested <> (SELECT count(DISTINCT transaction_id) FROM review_assignments) THEN
    RAISE EXCEPTION 'duplicate transaction ids';
  END IF;

  PERFORM 1 FROM public.transactions t
   JOIN review_assignments a ON a.transaction_id = t.id
   WHERE t.tenant_id = p_tenant_id
   ORDER BY t.id FOR UPDATE OF t;

  SELECT count(*) INTO v_visible FROM public.transactions t
   JOIN review_assignments a ON a.transaction_id = t.id
   WHERE t.tenant_id = p_tenant_id;
  IF v_visible <> v_requested THEN RAISE EXCEPTION 'transaction not found'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.transactions t
    JOIN review_assignments a ON a.transaction_id = t.id
    WHERE t.tenant_id = p_tenant_id
      AND (t.category_source IN ('user', 'bank')
        OR (t.kind = 'adjustment' AND t.kind_source = 'system')
        OR EXISTS (
          SELECT 1 FROM public.merchant_rules r
          WHERE r.tenant_id = p_tenant_id AND r.merchant_key = t.merchant_key AND r.source = 'user'
        ))
  ) THEN RAISE EXCEPTION 'protected transaction in categorization review'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.transactions t
    JOIN review_assignments a ON a.transaction_id = t.id
    WHERE t.tenant_id = p_tenant_id
      AND (t.category, t.subcategory, t.category_source, t.category_confidence, t.needs_review)
          IS DISTINCT FROM
          (a.before_category, a.before_subcategory, a.before_source, a.before_confidence, a.before_needs_review)
  ) THEN RAISE EXCEPTION 'transaction changed since preview'; END IF;

  WITH changed AS (
    SELECT t.*, a.category AS target_category, a.subcategory AS target_subcategory
    FROM public.transactions t JOIN review_assignments a ON a.transaction_id = t.id
    WHERE t.tenant_id = p_tenant_id
      AND (t.category, t.subcategory, t.category_source, t.category_confidence, t.needs_review)
          IS DISTINCT FROM
          (a.category, a.subcategory, 'user'::text, 1::real, false)
  ), recorded AS (
    INSERT INTO public.transaction_category_edits (
      tenant_id, transaction_id, actor_id, operation_id, scope,
      before_category, before_subcategory, before_source,
      before_confidence, before_needs_review,
      after_category, after_subcategory, after_source,
      after_confidence, after_needs_review
    )
    SELECT p_tenant_id, id, p_actor_id, v_operation_id, 'selection',
      category, subcategory, category_source, category_confidence, needs_review,
      target_category, target_subcategory, 'user', 1, false
    FROM changed
    RETURNING transaction_id, after_category, after_subcategory
  )
  UPDATE public.transactions t
     SET category = recorded.after_category,
         subcategory = recorded.after_subcategory,
         category_source = 'user',
         category_confidence = 1,
         needs_review = false
    FROM recorded
   WHERE t.tenant_id = p_tenant_id AND t.id = recorded.transaction_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'operation_id', v_operation_id,
    'selected', v_requested,
    'updated', v_updated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_categorization_review(uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_categorization_review(uuid,uuid,jsonb)
  TO service_role;

DO $$
BEGIN
  IF has_function_privilege('authenticated',
    'public.apply_categorization_review(uuid,uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated may execute categorization review RPC';
  END IF;
  IF NOT has_function_privilege('service_role',
    'public.apply_categorization_review(uuid,uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service role cannot execute categorization review RPC';
  END IF;
END
$$;
