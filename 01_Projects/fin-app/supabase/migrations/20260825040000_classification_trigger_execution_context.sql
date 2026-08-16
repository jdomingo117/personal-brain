-- The trigger must be able to call the private derivation helper while an
-- authenticated RLS insert is running. It only mutates NEW, has a fixed
-- search_path, and remains non-executable by browser roles.

ALTER FUNCTION public.sync_transaction_taxonomy_and_classification() SECURITY DEFINER;

DO $$
BEGIN
  IF has_function_privilege('anon','public.sync_transaction_taxonomy_and_classification()','EXECUTE')
     OR has_function_privilege('authenticated','public.sync_transaction_taxonomy_and_classification()','EXECUTE')
     OR has_function_privilege('anon','public.default_transaction_kind(text,text,integer)','EXECUTE')
     OR has_function_privilege('authenticated','public.default_transaction_kind(text,text,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'classification internals leaked to browser roles';
  END IF;
END $$;
