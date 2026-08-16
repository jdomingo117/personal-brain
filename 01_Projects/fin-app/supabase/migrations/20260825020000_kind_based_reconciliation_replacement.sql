-- Manual balance reconciliation replaces the system adjustment row by kind.
-- The CSV payload guard intentionally still validates the submitted reserved
-- category pair before the row exists and therefore has no stored kind yet.

DO $$
DECLARE
  signature regprocedure := 'public.import_transactions_atomic(uuid,uuid,jsonb,uuid,integer,text,integer,integer)'::regprocedure;
  definition text;
  rewritten text;
BEGIN
  SELECT pg_get_functiondef(signature) INTO definition;
  rewritten := regexp_replace(
    definition,
    'AND category = ''Transfer''[[:space:]]+AND subcategory = ''Reconciliation'';',
    'AND kind = ''adjustment'' AND kind_source = ''system'';',
    'g'
  );
  IF rewritten = definition THEN RAISE EXCEPTION 'reconciliation replacement guard not found'; END IF;
  EXECUTE rewritten;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='import_transactions_atomic'
      AND p.prosrc LIKE '%kind = ''adjustment'' AND kind_source = ''system''%'
  ) THEN RAISE EXCEPTION 'manual reconciliation still depends on stored category text'; END IF;
END
$$;
