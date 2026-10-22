-- M4: append-only item intent and evidence. No FK points into mutable source rows.
CREATE TABLE public.budget_item_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,plan_id uuid NOT NULL,line_id uuid NOT NULL,
 period_id uuid NOT NULL,version bigint NOT NULL, payload jsonb NOT NULL,actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,plan_id,line_id) REFERENCES public.budget_lines(tenant_id,plan_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,plan_id,period_id) REFERENCES public.budget_periods(tenant_id,plan_id,id) ON DELETE CASCADE,
 UNIQUE(line_id,version)
);
CREATE TABLE public.budget_manual_funding (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 amount_cents bigint NOT NULL CHECK(amount_cents BETWEEN 1 AND 9007199254740991),confirmed_date date NOT NULL,
 note text NOT NULL CHECK(char_length(note) BETWEEN 1 AND 200),actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id)
);
CREATE TABLE public.budget_source_claims (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,plan_id uuid NOT NULL,line_id uuid,
 purpose text NOT NULL CHECK(purpose IN('expense','purchase','refund','exclude','funding')),
 source_key text NOT NULL,source_fingerprint text NOT NULL,source_date date NOT NULL,source_identity jsonb NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents BETWEEN 1 AND 9007199254740991),
 occurrence_date date,occurrence_revision_id uuid,related_claim_id uuid,source_revision bigint NOT NULL,
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,plan_id) REFERENCES public.budget_plans(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,plan_id,line_id) REFERENCES public.budget_lines(tenant_id,plan_id,id) ON DELETE CASCADE,
 UNIQUE(tenant_id,plan_id,id),
 FOREIGN KEY(tenant_id,plan_id,related_claim_id) REFERENCES public.budget_source_claims(tenant_id,plan_id,id),
 CHECK((purpose='exclude' AND line_id IS NULL) OR (purpose<>'exclude' AND line_id IS NOT NULL))
);
CREATE INDEX budget_claims_source ON public.budget_source_claims(tenant_id,source_key);
CREATE TABLE public.budget_claim_reversals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,plan_id uuid NOT NULL,claim_id uuid NOT NULL,
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,plan_id,claim_id) REFERENCES public.budget_source_claims(tenant_id,plan_id,id) ON DELETE CASCADE,UNIQUE(claim_id)
);
CREATE TABLE public.budget_limit_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,plan_id uuid NOT NULL,period_id uuid NOT NULL,
 version bigint NOT NULL,payload jsonb NOT NULL,actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,plan_id,period_id) REFERENCES public.budget_periods(tenant_id,plan_id,id) ON DELETE CASCADE,
 UNIQUE(period_id,version)
);
CREATE TABLE public.budget_reserve_moves (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,plan_id uuid NOT NULL,period_id uuid NOT NULL,
 from_line_id uuid NOT NULL,to_line_id uuid NOT NULL,amount_cents bigint NOT NULL CHECK(amount_cents BETWEEN 1 AND 9007199254740991),
 effective_date date NOT NULL,actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,plan_id,from_line_id) REFERENCES public.budget_lines(tenant_id,plan_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,plan_id,to_line_id) REFERENCES public.budget_lines(tenant_id,plan_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,plan_id,period_id) REFERENCES public.budget_periods(tenant_id,plan_id,id) ON DELETE CASCADE,
 CHECK(from_line_id<>to_line_id)
);
DO $$ DECLARE tbl text;BEGIN
 FOREACH tbl IN ARRAY ARRAY['budget_item_revisions','budget_manual_funding','budget_source_claims','budget_claim_reversals','budget_limit_revisions','budget_reserve_moves'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tbl);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tbl);
  EXECUTE format('GRANT SELECT,INSERT,DELETE ON public.%I TO service_role',tbl);
  EXECUTE format('CREATE POLICY budget_member_read ON public.%I FOR SELECT TO authenticated USING(public.is_tenant_member(tenant_id))',tbl);
  EXECUTE format('CREATE TRIGGER budget_history_immutable BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.budget_immutable_history()',tbl);
 END LOOP;
END $$;

-- Original parent identity survives splits; only children contribute when present.
CREATE FUNCTION public.budget_activity(p_tenant uuid,p_plan uuid,p_from date,p_until date)
RETURNS TABLE(source_key text,source_type text,booking_date date,capacity bigint,fingerprint text,identity jsonb,category_id text,subcategory_id text,custom_subcategory_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
 WITH rows AS (
 SELECT t.id parent_id,a.id allocation_id,t.date,t.account_id,t.dedupe_hash,t.occurrence,t.merchant,t.pending,t.is_transfer,t.transfer_state,t.kind_source,
 coalesce(a.amount,t.amount)::bigint amount,coalesce(a.kind,t.kind) kind,
 coalesce(a.category_id,t.category_id) category_id,CASE WHEN a.id IS NULL THEN t.subcategory_id ELSE a.subcategory_id END subcategory_id,
 CASE WHEN a.id IS NULL THEN original.custom_subcategory_id ELSE a.custom_subcategory_id END custom_subcategory_id
 FROM public.transactions_analytic t LEFT JOIN public.transaction_allocations a ON a.tenant_id=t.tenant_id AND a.transaction_id=t.id
 JOIN public.transactions original ON original.id=t.id AND original.tenant_id=t.tenant_id
 JOIN public.accounts acct ON acct.id=t.account_id AND acct.tenant_id=t.tenant_id AND acct.currency='AUD'
 WHERE t.tenant_id=p_tenant AND t.date>=p_from AND t.date<p_until AND EXISTS(
 SELECT 1 FROM public.budget_account_memberships m WHERE m.tenant_id=p_tenant AND m.plan_id=p_plan AND m.role='activity' AND m.account_id=t.account_id
 AND m.start_date<=t.date AND (m.end_date IS NULL OR m.end_date>t.date))
 ), effective AS (SELECT *,CASE WHEN kind='transfer' AND kind_source='derived' AND transfer_state='rejected' THEN CASE WHEN amount>=0 THEN 'income' ELSE 'expense' END ELSE kind END k FROM rows),
 typed AS (SELECT *,jsonb_build_object('parent_id',parent_id,'allocation_id',allocation_id,'account_id',account_id,'dedupe_hash',encode(dedupe_hash,'hex'),'occurrence',occurrence,
 'date',date,'amount',amount,'kind',k,'category_id',category_id,'subcategory_id',subcategory_id,'custom_subcategory_id',custom_subcategory_id) detail FROM effective WHERE NOT pending AND NOT is_transfer AND ((k='expense' AND amount<0) OR (k IN('refund','reimbursement') AND amount>0)))
 SELECT CASE WHEN allocation_id IS NULL THEN 't:'||parent_id ELSE 'a:'||allocation_id END,
 CASE WHEN k='expense' THEN 'expense' ELSE 'refund' END,date,abs(amount),encode(extensions.digest(detail::text,'sha256'),'hex'),detail||jsonb_build_object('merchant',merchant),category_id,subcategory_id,custom_subcategory_id FROM typed;
$$;
CREATE FUNCTION public.budget_funding_sources(p_tenant uuid,p_plan uuid,p_from date,p_until date)
RETURNS TABLE(source_key text,source_type text,booking_date date,capacity bigint,fingerprint text,identity jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
 WITH pairs AS (
 SELECT f.id,f.date,abs(f.amount::bigint) amount,jsonb_build_object('from_id',f.id,'to_id',t.id,'from_account',f.account_id,'to_account',t.account_id,'amount',abs(f.amount::bigint),'from_date',f.date,'to_date',t.date,'link_id',l.id) detail
 FROM public.transfer_links l JOIN public.transactions_analytic f ON f.id=l.from_txn_id AND f.tenant_id=l.tenant_id
 JOIN public.transactions_analytic t ON t.id=l.to_txn_id AND t.tenant_id=l.tenant_id
 JOIN public.accounts fa ON fa.id=f.account_id AND fa.tenant_id=p_tenant AND fa.currency='AUD'
 JOIN public.accounts ta ON ta.id=t.account_id AND ta.tenant_id=p_tenant AND ta.currency='AUD'
 WHERE l.tenant_id=p_tenant AND l.state IN('auto','confirmed') AND NOT l.ambiguous AND f.is_transfer AND t.is_transfer
 AND NOT f.pending AND NOT t.pending AND f.amount<0 AND t.amount=-f.amount::bigint AND f.date>=p_from AND f.date<p_until
 AND NOT EXISTS(SELECT 1 FROM public.transaction_allocations a WHERE a.transaction_id IN(f.id,t.id))
 AND NOT EXISTS(SELECT 1 FROM public.transfer_decisions d WHERE d.tenant_id=p_tenant AND d.from_account_id=f.account_id AND d.from_hash=f.dedupe_hash AND d.from_occurrence=f.occurrence AND d.verdict IN('rejected','external'))
 AND EXISTS(SELECT 1 FROM public.budget_account_memberships m WHERE m.plan_id=p_plan AND m.tenant_id=p_tenant AND m.role='activity' AND m.account_id=f.account_id AND m.start_date<=f.date AND (m.end_date IS NULL OR m.end_date>f.date))
 ) SELECT 'm:'||id,'bank-observed',date,amount,encode(extensions.digest(detail::text,'sha256'),'hex'),detail FROM pairs
 UNION ALL SELECT 'manual:'||id,'user-confirmed',confirmed_date,amount_cents,encode(extensions.digest(to_jsonb(m)::text,'sha256'),'hex'),jsonb_build_object('manual_id',id,'note',note) FROM public.budget_manual_funding m WHERE tenant_id=p_tenant AND confirmed_date>=p_from AND confirmed_date<p_until;
$$;
CREATE FUNCTION public.budget_live_claims(p_tenant uuid,p_plan uuid)
RETURNS TABLE(id uuid,line_id uuid,purpose text,source_key text,source_date date,amount_cents bigint,occurrence_date date,related_claim_id uuid,valid boolean,provenance text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH sources AS (SELECT a.source_key,a.fingerprint,a.source_type FROM public.budget_activity(p_tenant,p_plan,'0001-01-01','9999-12-31') a
 UNION ALL SELECT f.source_key,f.fingerprint,f.source_type FROM public.budget_funding_sources(p_tenant,p_plan,'0001-01-01','9999-12-31') f),
 live AS (SELECT c.*,s.source_type,s.source_key IS NOT NULL ok FROM public.budget_source_claims c LEFT JOIN sources s ON s.source_key=c.source_key AND s.fingerprint=c.source_fingerprint
 WHERE c.tenant_id=p_tenant AND c.plan_id=p_plan AND NOT EXISTS(SELECT 1 FROM public.budget_claim_reversals r WHERE r.claim_id=c.id))
 SELECT c.id,c.line_id,c.purpose,c.source_key,c.source_date,c.amount_cents,c.occurrence_date,c.related_claim_id,
 c.ok AND (c.related_claim_id IS NULL OR EXISTS(SELECT 1 FROM live parent WHERE parent.id=c.related_claim_id AND parent.ok)),coalesce(c.source_type,'changed') FROM live c;
$$;
-- Calendar arithmetic preserves the desired day, including January 31 -> February -> March 31.
CREATE FUNCTION public.budget_occurrence_dates(p_anchor date,p_cadence text,p_from date,p_until date) RETURNS SETOF date
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE d date; n int; step_months int; step_days int;BEGIN
 IF p_until<=p_from OR p_until-p_from>3660 OR p_cadence NOT IN('once','weekly','fortnightly','monthly','quarterly','annual') THEN RAISE EXCEPTION 'budget_invalid_schedule';END IF;
 IF p_cadence='once' THEN IF p_anchor>=p_from AND p_anchor<p_until THEN RETURN NEXT p_anchor;END IF;RETURN;END IF;
 IF p_cadence IN('weekly','fortnightly') THEN
  step_days:=CASE WHEN p_cadence='weekly' THEN 7 ELSE 14 END;
  FOR d IN SELECT x::date FROM generate_series((p_anchor+greatest(0,ceil((p_from-p_anchor)::numeric/step_days)::int)*step_days)::timestamp,p_until-1,make_interval(days=>step_days)) x LOOP RETURN NEXT d;END LOOP;
 ELSE
  step_months:=CASE p_cadence WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 ELSE 12 END;
  n:=greatest(0,(extract(year FROM age(p_from,p_anchor))::int*12+extract(month FROM age(p_from,p_anchor))::int)/step_months-1);
  LOOP d:=(p_anchor+make_interval(months=>n*step_months))::date;EXIT WHEN d>=p_until;IF d>=p_from THEN RETURN NEXT d;END IF;n:=n+1;END LOOP;
 END IF;
END $$;

DO $$ DECLARE f record; t text;BEGIN
 FOREACH t IN ARRAY ARRAY['budget_item_revisions','budget_manual_funding','budget_source_claims','budget_claim_reversals','budget_limit_revisions','budget_reserve_moves'] LOOP
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||t)::regclass) OR has_table_privilege('anon','public.'||t,'SELECT') OR has_table_privilege('authenticated','public.'||t,'INSERT') THEN RAISE EXCEPTION 'Budget M4 grant leak';END IF;
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND left(p.proname,7)='budget_' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
