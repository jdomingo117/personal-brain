-- Phase 2: durable merchant identity, atomic bulk corrections, and durable
-- user rules. All mutation RPCs are service-role-only and are called through
-- taxonomy-validating Edge Functions.

ALTER TABLE public.transactions ADD COLUMN merchant_key text;

UPDATE public.transactions
   SET merchant_key = lower(regexp_replace(trim(merchant), '\s+', ' ', 'g'));

ALTER TABLE public.transactions
  ALTER COLUMN merchant_key SET NOT NULL,
  ADD CONSTRAINT transactions_merchant_key_not_blank CHECK (length(trim(merchant_key)) > 0);

CREATE INDEX idx_transactions_merchant_key
  ON public.transactions (tenant_id, merchant_key, date DESC);

CREATE FUNCTION public.set_transaction_merchant_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.merchant_key IS NULL OR trim(NEW.merchant_key) = '' THEN
    NEW.merchant_key := lower(regexp_replace(trim(NEW.merchant), '\s+', ' ', 'g'));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_set_merchant_key
  BEFORE INSERT OR UPDATE OF merchant, merchant_key ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_transaction_merchant_key();

ALTER TABLE public.transaction_category_edits
  ADD COLUMN operation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN scope text NOT NULL DEFAULT 'transaction'
    CHECK (scope IN ('transaction', 'selection', 'merchant_rule'));

CREATE INDEX idx_transaction_category_edits_operation
  ON public.transaction_category_edits (tenant_id, operation_id, created_at);

CREATE FUNCTION public.bulk_edit_transaction_categories(
  p_tenant_id uuid,
  p_transaction_ids uuid[],
  p_actor_id uuid,
  p_category text,
  p_subcategory text
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
  v_requested := cardinality(p_transaction_ids);
  IF v_requested IS NULL OR v_requested < 1 OR v_requested > 500 THEN
    RAISE EXCEPTION 'select between 1 and 500 transactions';
  END IF;
  IF v_requested <> (SELECT count(DISTINCT id) FROM unnest(p_transaction_ids) id) THEN
    RAISE EXCEPTION 'duplicate transaction ids';
  END IF;

  PERFORM 1 FROM public.transactions
   WHERE tenant_id = p_tenant_id AND id = ANY(p_transaction_ids)
   ORDER BY id FOR UPDATE;

  SELECT count(*) INTO v_visible FROM public.transactions
   WHERE tenant_id = p_tenant_id AND id = ANY(p_transaction_ids);
  IF v_visible <> v_requested THEN RAISE EXCEPTION 'transaction not found'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.transactions
     WHERE tenant_id = p_tenant_id AND id = ANY(p_transaction_ids)
       AND category = 'Transfer' AND subcategory = 'Reconciliation'
  ) THEN
    RAISE EXCEPTION 'system reconciliation entries cannot be recategorised';
  END IF;

  WITH changed AS (
    SELECT * FROM public.transactions
     WHERE tenant_id = p_tenant_id AND id = ANY(p_transaction_ids)
       AND (category, subcategory, category_source, category_confidence, needs_review)
           IS DISTINCT FROM
           (p_category, nullif(p_subcategory, ''), 'user'::text, 1::real, false)
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
      p_category, nullif(p_subcategory, ''), 'user', 1, false
    FROM changed
    RETURNING transaction_id
  )
  UPDATE public.transactions t
     SET category = p_category,
         subcategory = nullif(p_subcategory, ''),
         category_source = 'user',
         category_confidence = 1,
         needs_review = false
   WHERE t.tenant_id = p_tenant_id
     AND t.id IN (SELECT transaction_id FROM recorded);
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'operation_id', v_operation_id,
    'selected', v_requested,
    'updated', v_updated,
    'category', p_category,
    'subcategory', nullif(p_subcategory, '')
  );
END;
$$;

CREATE FUNCTION public.undo_transaction_category_operation(
  p_tenant_id uuid,
  p_operation_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count integer;
BEGIN
  PERFORM 1 FROM public.transaction_category_edits
   WHERE tenant_id = p_tenant_id AND operation_id = p_operation_id
   ORDER BY transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'category operation not found'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.transaction_category_edits
     WHERE tenant_id = p_tenant_id AND operation_id = p_operation_id
       AND undone_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'category operation already undone'; END IF;

  PERFORM 1 FROM public.transactions t
   JOIN public.transaction_category_edits e ON e.transaction_id = t.id
   WHERE e.tenant_id = p_tenant_id AND e.operation_id = p_operation_id
   ORDER BY t.id FOR UPDATE OF t;

  IF EXISTS (
    SELECT 1 FROM public.transaction_category_edits e
    JOIN public.transactions t ON t.id = e.transaction_id AND t.tenant_id = e.tenant_id
    WHERE e.tenant_id = p_tenant_id AND e.operation_id = p_operation_id
      AND (t.category, t.subcategory, t.category_source, t.category_confidence, t.needs_review)
          IS DISTINCT FROM
          (e.after_category, e.after_subcategory, e.after_source, e.after_confidence, e.after_needs_review)
  ) THEN RAISE EXCEPTION 'transaction changed after this operation'; END IF;

  UPDATE public.transactions t
     SET category = e.before_category,
         subcategory = e.before_subcategory,
         category_source = e.before_source,
         category_confidence = e.before_confidence,
         needs_review = e.before_needs_review
    FROM public.transaction_category_edits e
   WHERE e.tenant_id = p_tenant_id AND e.operation_id = p_operation_id
     AND t.id = e.transaction_id AND t.tenant_id = e.tenant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.transaction_category_edits
     SET undone_at = now(), undone_by = p_actor_id
   WHERE tenant_id = p_tenant_id AND operation_id = p_operation_id;

  RETURN jsonb_build_object('operation_id', p_operation_id, 'restored', v_count, 'undone', true);
END;
$$;

CREATE FUNCTION public.apply_user_merchant_rule(
  p_tenant_id uuid,
  p_merchant_key text,
  p_merchant_display text,
  p_actor_id uuid,
  p_category text,
  p_subcategory text,
  p_apply_to_existing boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operation_id uuid := gen_random_uuid();
  v_matches integer := 0;
  v_updated integer := 0;
BEGIN
  INSERT INTO public.merchant_rules (
    tenant_id, merchant_key, merchant_display, category, subcategory, source, confidence
  ) VALUES (
    p_tenant_id, p_merchant_key, p_merchant_display,
    p_category, nullif(p_subcategory, ''), 'user', 1
  )
  ON CONFLICT (tenant_id, merchant_key) DO UPDATE SET
    merchant_display = excluded.merchant_display,
    category = excluded.category,
    subcategory = excluded.subcategory,
    source = 'user', confidence = 1, updated_at = now();

  IF p_apply_to_existing THEN
    PERFORM 1 FROM public.transactions
     WHERE tenant_id = p_tenant_id AND merchant_key = p_merchant_key
     ORDER BY id FOR UPDATE;

    SELECT count(*) INTO v_matches FROM public.transactions
     WHERE tenant_id = p_tenant_id AND merchant_key = p_merchant_key
       AND NOT (category = 'Transfer' AND subcategory = 'Reconciliation');

    WITH changed AS (
      SELECT * FROM public.transactions
       WHERE tenant_id = p_tenant_id AND merchant_key = p_merchant_key
         AND NOT (category = 'Transfer' AND subcategory = 'Reconciliation')
         AND (category, subcategory, category_source, category_confidence, needs_review)
             IS DISTINCT FROM
             (p_category, nullif(p_subcategory, ''), 'user'::text, 1::real, false)
    ), recorded AS (
      INSERT INTO public.transaction_category_edits (
        tenant_id, transaction_id, actor_id, operation_id, scope,
        before_category, before_subcategory, before_source,
        before_confidence, before_needs_review,
        after_category, after_subcategory, after_source,
        after_confidence, after_needs_review
      )
      SELECT p_tenant_id, id, p_actor_id, v_operation_id, 'merchant_rule',
        category, subcategory, category_source, category_confidence, needs_review,
        p_category, nullif(p_subcategory, ''), 'user', 1, false
      FROM changed RETURNING transaction_id
    )
    UPDATE public.transactions t
       SET category = p_category,
           subcategory = nullif(p_subcategory, ''),
           category_source = 'user',
           category_confidence = 1,
           needs_review = false
     WHERE t.tenant_id = p_tenant_id
       AND t.id IN (SELECT transaction_id FROM recorded);
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'operation_id', CASE WHEN v_updated > 0 THEN v_operation_id ELSE NULL END,
    'merchant_key', p_merchant_key,
    'existing_matches', v_matches,
    'updated', v_updated,
    'category', p_category,
    'subcategory', nullif(p_subcategory, '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_edit_transaction_categories(uuid, uuid[], uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.undo_transaction_category_operation(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_user_merchant_rule(uuid, text, text, uuid, text, text, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_merchant_rule(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_edit_transaction_categories(uuid, uuid[], uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.undo_transaction_category_operation(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_user_merchant_rule(uuid, text, text, uuid, text, text, boolean) TO service_role;

-- Rebuild because PostgreSQL freezes t.* at view-creation time.
DROP VIEW public.transactions_analytic;
CREATE VIEW public.transactions_analytic WITH (security_invoker = true) AS
SELECT
  t.*,
  CASE
    WHEN d.verdict = 'rejected' THEN false
    WHEN d.verdict IN ('confirmed', 'external') THEN true
    ELSE COALESCE(t.category = 'Transfer' OR l.state IN ('auto', 'suggested', 'confirmed', 'external') OR il.state IN ('auto', 'suggested', 'confirmed'), false)
  END AS is_transfer,
  COALESCE(il.state, l.state, d.verdict, CASE WHEN t.transfer_candidate THEN 'unmatched' ELSE 'none' END) AS transfer_state,
  l.id AS transfer_link_id,
  il.id AS investment_cash_link_id
FROM public.transactions t
LEFT JOIN LATERAL (
  SELECT id, state FROM public.transfer_links WHERE from_txn_id = t.id
  UNION ALL SELECT id, state FROM public.transfer_links WHERE to_txn_id = t.id LIMIT 1
) l ON true
LEFT JOIN public.investment_cash_links il ON il.transaction_id = t.id
LEFT JOIN LATERAL (
  SELECT verdict FROM (
    SELECT dd.verdict, dd.decided_at FROM public.transfer_decisions dd
     WHERE dd.tenant_id = t.tenant_id AND dd.from_account_id = t.account_id AND dd.from_hash = t.dedupe_hash AND dd.from_occurrence = t.occurrence
    UNION ALL
    SELECT dd.verdict, dd.decided_at FROM public.transfer_decisions dd
     WHERE dd.tenant_id = t.tenant_id AND dd.to_account_id = t.account_id AND dd.to_hash = t.dedupe_hash AND dd.to_occurrence = t.occurrence
    UNION ALL
    SELECT id.verdict, id.decided_at FROM public.investment_cash_decisions id
     WHERE id.tenant_id = t.tenant_id AND id.transaction_account_id = t.account_id AND id.transaction_hash = t.dedupe_hash AND id.transaction_occurrence = t.occurrence
  ) decisions ORDER BY decided_at DESC LIMIT 1
) d ON true;

GRANT SELECT ON public.transactions_analytic TO authenticated;
REVOKE ALL ON public.transactions_analytic FROM anon;

DO $$
DECLARE bad_functions text; bad_views text;
BEGIN
  SELECT string_agg(routine_name, ', ') INTO bad_functions
    FROM information_schema.role_routine_grants
   WHERE specific_schema = 'public'
     AND routine_name IN ('bulk_edit_transaction_categories', 'undo_transaction_category_operation', 'apply_user_merchant_rule', 'apply_merchant_rule')
     AND grantee IN ('PUBLIC', 'anon', 'authenticated');
  IF bad_functions IS NOT NULL THEN RAISE EXCEPTION 'unsafe categorisation function grants: %', bad_functions; END IF;

  SELECT string_agg(c.relname, ', ') INTO bad_views
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v'
     AND coalesce(c.reloptions, ARRAY[]::text[]) @> ARRAY['security_invoker=true'] = false;
  IF bad_views IS NOT NULL THEN RAISE EXCEPTION 'views without security_invoker: %', bad_views; END IF;
END $$;
