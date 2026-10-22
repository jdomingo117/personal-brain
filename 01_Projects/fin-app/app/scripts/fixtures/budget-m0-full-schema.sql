-- Executed only after this runner proves a new isolated database has no users.
-- All fixtures are fictional. No proposed production Budget tables are created.
BEGIN;
CREATE TEMP TABLE budget_m0_identity AS SELECT gen_random_uuid() user_id;
INSERT INTO auth.users(id,aud,role,email,created_at,updated_at)
  SELECT user_id,'authenticated','authenticated','budget-m0-'||user_id||'@example.test',now(),now()
  FROM budget_m0_identity;
ALTER TABLE budget_m0_identity ADD COLUMN tenant_id uuid;
UPDATE budget_m0_identity p SET tenant_id=t.default_tenant_id FROM public.profiles t WHERE t.id=p.user_id;
CREATE TEMP TABLE budget_m0_accounts AS
  WITH inserted AS (
    INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency)
    SELECT user_id,tenant_id,'Budget M0 fictional source','Liquid',0,'AUD' FROM budget_m0_identity RETURNING id
  ) SELECT id account_id FROM inserted;
INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,dedupe_hash)
 SELECT p.user_id,p.tenant_id,a.account_id,'2026-09-01'::date+(g%30),'M0 fictional transaction '||g,'M0 proof','m0-proof',
   (SELECT display_name FROM public.taxonomy_categories WHERE active AND display_name='Shopping'),
   -101,'expense','user',decode(md5('m0-'||g),'hex')
 FROM budget_m0_identity p CROSS JOIN budget_m0_accounts a CROSS JOIN generate_series(1,10000) g;

DO $$ DECLARE total bigint; BEGIN
 SELECT sum(greatest(-t.amount::bigint,0)) INTO total FROM public.transactions_analytic t
 JOIN budget_m0_identity p ON p.tenant_id=t.tenant_id JOIN budget_m0_accounts a ON a.account_id=t.account_id
 WHERE NOT t.pending AND NOT t.is_transfer AND t.kind='expense' AND date>='2026-09-01' AND date<'2026-10-01';
 IF total<>1010000 THEN RAISE EXCEPTION 'complete full-schema aggregate mismatch: %',total;END IF;
END $$;
SELECT 'PASS full-schema UUID/bytea import identity, taxonomy triggers and 10,000-row aggregate';

-- Use the real split command and its taxonomy/ownership checks, not direct fixture children.
SELECT public.replace_transaction_allocations(p.tenant_id,t.id,p.user_id,
 jsonb_build_array(jsonb_build_object('position',0,'amount',-70,'kind','expense','category','Shopping','subcategory',null),
                   jsonb_build_object('position',1,'amount',-31,'kind','expense','category','Shopping','subcategory',null)))
FROM budget_m0_identity p JOIN public.transactions t ON t.tenant_id=p.tenant_id
WHERE t.original_description='M0 fictional transaction 1';
DO $$ DECLARE n bigint;total bigint; BEGIN
 WITH rows AS (
 SELECT t.id,coalesce(a.amount,t.amount)::bigint amount FROM public.transactions_analytic t
 JOIN budget_m0_identity p ON p.tenant_id=t.tenant_id
 LEFT JOIN public.transaction_allocations a ON a.transaction_id=t.id AND a.tenant_id=t.tenant_id
 WHERE NOT t.pending AND NOT t.is_transfer AND t.kind='expense'
 ) SELECT count(*),sum(-amount) INTO n,total FROM rows;
 IF n<>10001 OR total<>1010000 THEN RAISE EXCEPTION 'full-schema split replacement mismatch: %, %',n,total;END IF;
END $$;
SELECT 'PASS real split RPC replaces parent without duplicating expense';

-- Existing tenant-read policy must still filter this source relation.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.transactions_analytic) THEN RAISE EXCEPTION 'foreign source rows leaked';END IF;
END $$;
RESET ROLE;
SELECT 'PASS existing analytic invoker/RLS excludes a foreign identity';
ROLLBACK;
SELECT 'PASS fictional fixtures rolled back; no Budget migration applied';
