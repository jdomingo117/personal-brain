-- Transactions are ledger entries, not a browser-mutable resource. Every
-- create/update/delete operation must pass through a validated Edge Function
-- and its guarded RPC/audit path. The old membership policies predated that
-- boundary and allowed an authenticated caller to insert a syntactically
-- valid transaction directly through PostgREST, bypassing CSV taxonomy,
-- dedupe, upload-batch and connected-account protections.

DROP POLICY IF EXISTS "tenant members write transactions" ON public.transactions;
DROP POLICY IF EXISTS "tenant members update transactions" ON public.transactions;
DROP POLICY IF EXISTS "tenant members delete transactions" ON public.transactions;

REVOKE INSERT, UPDATE, DELETE ON public.transactions FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.transactions', 'INSERT')
     OR has_table_privilege('anon', 'public.transactions', 'UPDATE')
     OR has_table_privilege('anon', 'public.transactions', 'DELETE')
     OR has_table_privilege('authenticated', 'public.transactions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.transactions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.transactions', 'DELETE') THEN
    RAISE EXCEPTION 'browser roles retain direct transaction mutation privileges';
  END IF;
END $$;
