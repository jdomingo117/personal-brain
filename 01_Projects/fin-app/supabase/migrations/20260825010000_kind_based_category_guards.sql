-- Category editing/rule scopes protect system rows by first-class behavior,
-- not by the display label that happened to derive that behavior.

DO $$
DECLARE
  signature regprocedure;
  definition text;
  rewritten text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.preview_user_merchant_rule(uuid,text,text,text)'::regprocedure,
    'public.apply_user_merchant_rule(uuid,text,text,uuid,text,text,boolean)'::regprocedure,
    'public.bulk_edit_transaction_categories(uuid,uuid[],uuid,text,text)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(signature) INTO definition;
    rewritten := replace(
      definition,
      'category = ''Transfer'' AND subcategory = ''Reconciliation''',
      'kind = ''adjustment'' AND kind_source = ''system'''
    );
    IF rewritten = definition THEN
      RAISE EXCEPTION 'expected reconciliation guard not found in %', signature;
    END IF;
    EXECUTE rewritten;
  END LOOP;
END
$$;

DO $$
DECLARE
  leaked text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO leaked
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN ('preview_user_merchant_rule','apply_user_merchant_rule','bulk_edit_transaction_categories')
    AND p.prosrc LIKE '%category = ''Transfer'' AND subcategory = ''Reconciliation''%';
  IF leaked IS NOT NULL THEN RAISE EXCEPTION 'category-derived system guards remain: %', leaked; END IF;
END
$$;
