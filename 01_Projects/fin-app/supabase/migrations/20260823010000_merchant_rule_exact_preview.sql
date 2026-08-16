-- Exact impact counts for merchant-rule confirmation. PostgREST row payloads
-- are capped, so counting in an Edge Function could understate a common
-- merchant with more than 1,000 ledger entries.

CREATE FUNCTION public.preview_user_merchant_rule(
  p_tenant_id uuid,
  p_merchant_key text,
  p_category text,
  p_subcategory text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'existing_matches', count(*),
    'transactions_to_update', count(*) FILTER (
      WHERE (category, subcategory, category_source, category_confidence, needs_review)
            IS DISTINCT FROM
            (p_category, nullif(p_subcategory, ''), 'user'::text, 1::real, false)
    )
  )
  FROM public.transactions
  WHERE tenant_id = p_tenant_id
    AND merchant_key = p_merchant_key
    AND NOT (category = 'Transfer' AND subcategory = 'Reconciliation');
$$;

REVOKE ALL ON FUNCTION public.preview_user_merchant_rule(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_user_merchant_rule(uuid, text, text, text)
  TO service_role;

