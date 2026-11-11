-- Keep prepared and live impact projections hash-identical when the database
-- returns the same Budget lines in different orders.
CREATE OR REPLACE FUNCTION public.budget_scope_facts(
  p_tenant uuid, p_actor uuid, p_plan uuid, p_period uuid,
  p_source bigint, p_version bigint, p_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  details jsonb;
  lifecycle jsonb;
BEGIN
  details := public.budget_details(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
  lifecycle := details->'lifecycle';
  RETURN jsonb_build_object(
    'key',p_key,'start_date',lifecycle->'facts'->'start_date','end_date',lifecycle->'facts'->'end_date',
    'actuals',lifecycle->'facts'->'actuals','scope_valid',lifecycle->'facts'->'scope_valid',
    'coverage_complete',lifecycle->'facts'->'coverage_complete','opening_carry_cents',lifecycle->'facts'->'opening_carry_cents',
    'closing_everyday_cents',lifecycle->'facts'->'closing_everyday_cents','provisional_carry',lifecycle->'provisional_carry',
    'changed_since_review',lifecycle->'changed_since_review','rollover',details->'rollover',
    'excluded_cents',details->'excluded_cents','unassigned_credit_cents',details->'unassigned_credit_cents','limits',details->'limits',
    'items',(SELECT coalesce(jsonb_agg(item ORDER BY (item->>'line_id')::uuid),'[]')
             FROM jsonb_array_elements(details->'items') AS item),
    'claims',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x->'id','valid',x->'valid',
                'amount_cents',x->'amount_cents','purpose',x->'purpose') ORDER BY x->>'id'),'[]')
              FROM jsonb_array_elements(details->'claims') x)
  );
END $$;

DO $$
BEGIN
  IF has_function_privilege('anon','public.budget_scope_facts(uuid,uuid,uuid,uuid,bigint,bigint,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.budget_scope_facts(uuid,uuid,uuid,uuid,bigint,bigint,text)','EXECUTE')
  THEN
    RAISE EXCEPTION 'Budget impact facts must remain service-only';
  END IF;
END $$;
