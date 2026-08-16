-- Phase 4: separate accounting behavior from reporting category text.

CREATE FUNCTION public.default_transaction_kind(p_category text, p_subcategory text, p_amount integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_category = 'Transfer' AND p_subcategory = 'Reconciliation' THEN 'adjustment'
    WHEN p_category = 'Transfer' THEN 'transfer'
    WHEN p_category = 'Investing' THEN 'investment'
    WHEN p_category = 'Income' AND p_subcategory = 'Refund' THEN 'refund'
    WHEN p_category = 'Income' AND p_subcategory = 'Reimbursement' THEN 'reimbursement'
    WHEN p_category = 'Income' THEN 'income'
    WHEN p_category = 'Uncategorized' AND p_amount >= 0 THEN 'income'
    ELSE 'expense'
  END
$$;

ALTER TABLE public.transactions
  ADD COLUMN kind text CHECK (kind IN ('expense','income','transfer','investment','adjustment','refund','reimbursement')),
  ADD COLUMN kind_source text NOT NULL DEFAULT 'derived' CHECK (kind_source IN ('derived','user','system')),
  ADD COLUMN is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN recurring_source text NOT NULL DEFAULT 'derived' CHECK (recurring_source IN ('derived','user')),
  ADD COLUMN is_subscription boolean NOT NULL DEFAULT false,
  ADD COLUMN subscription_source text NOT NULL DEFAULT 'derived' CHECK (subscription_source IN ('derived','user')),
  ADD COLUMN spending_nature text CHECK (spending_nature IS NULL OR spending_nature IN ('essential','discretionary')),
  ADD COLUMN is_reimbursable boolean NOT NULL DEFAULT false,
  ADD COLUMN is_tax_related boolean NOT NULL DEFAULT false;

UPDATE public.transactions
SET kind = public.default_transaction_kind(category, subcategory, amount),
    kind_source = CASE WHEN category='Transfer' AND subcategory='Reconciliation' THEN 'system' ELSE 'derived' END,
    is_subscription = category='Lifestyle' AND subcategory IN ('Streaming','Software & digital services','Memberships'),
    subscription_source = 'derived';

UPDATE public.transactions t
SET is_recurring = h.is_recurring,
    recurring_source = 'derived'
FROM public.merchant_recurrence_hints h
WHERE h.tenant_id=t.tenant_id AND h.merchant_key=t.merchant_key;

ALTER TABLE public.transactions ALTER COLUMN kind SET NOT NULL;
CREATE INDEX idx_transactions_tenant_kind_date ON public.transactions (tenant_id, kind, date DESC);
CREATE INDEX idx_transactions_tenant_attributes ON public.transactions
  (tenant_id, is_subscription, is_recurring, spending_nature);

-- Keep stable taxonomy IDs and derived classification synchronized. A manual
-- kind/subscription override is durable and is not replaced by recategorising.
CREATE OR REPLACE FUNCTION public.sync_taxonomy_ids()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_category_id text; v_subcategory_id text;
BEGIN
  IF current_setting('halcyon.taxonomy_revert',true)='on' THEN
    NEW.category_id:=NULL;
    IF TG_TABLE_NAME<>'budgets' THEN NEW.subcategory_id:=NULL; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND OLD.kind='adjustment' AND OLD.kind_source='system' AND OLD.subcategory='Reconciliation'
     AND (NEW.category IS DISTINCT FROM OLD.category OR NEW.subcategory IS DISTINCT FROM OLD.subcategory) THEN
    RAISE EXCEPTION 'system reconciliation classification is locked';
  END IF;
  SELECT id INTO v_category_id FROM public.taxonomy_categories WHERE display_name=NEW.category AND active;
  IF v_category_id IS NULL THEN RAISE EXCEPTION 'unknown taxonomy category: %',NEW.category; END IF;
  IF NEW.subcategory IS NOT NULL THEN
    SELECT id INTO v_subcategory_id FROM public.taxonomy_subcategories
     WHERE category_id=v_category_id AND display_name=NEW.subcategory AND active;
    IF v_subcategory_id IS NULL THEN RAISE EXCEPTION 'subcategory % does not belong to %',NEW.subcategory,NEW.category; END IF;
  END IF;
  NEW.category_id:=v_category_id;
  NEW.subcategory_id:=v_subcategory_id;
  IF NEW.kind_source IS DISTINCT FROM 'user' THEN
    NEW.kind:=public.default_transaction_kind(NEW.category,NEW.subcategory,NEW.amount);
    NEW.kind_source:=CASE WHEN NEW.kind='adjustment' THEN 'system' ELSE 'derived' END;
  END IF;
  IF NEW.subscription_source IS DISTINCT FROM 'user' THEN
    NEW.is_subscription:=NEW.category='Lifestyle' AND NEW.subcategory IN ('Streaming','Software & digital services','Memberships');
    NEW.subscription_source:='derived';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER transactions_sync_taxonomy ON public.transactions;
CREATE TRIGGER transactions_sync_taxonomy
BEFORE INSERT OR UPDATE OF category,subcategory,amount ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_taxonomy_ids();

CREATE TABLE public.transaction_classification_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  before_kind text NOT NULL,
  before_kind_source text NOT NULL,
  before_attributes jsonb NOT NULL,
  after_kind text NOT NULL,
  after_kind_source text NOT NULL,
  after_attributes jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  undone_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX idx_transaction_classification_edits_transaction
  ON public.transaction_classification_edits (tenant_id,transaction_id,created_at DESC);
ALTER TABLE public.transaction_classification_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read classification edit history"
  ON public.transaction_classification_edits FOR SELECT USING (public.is_tenant_member(tenant_id));
GRANT SELECT ON public.transaction_classification_edits TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.transaction_classification_edits TO service_role;
REVOKE ALL ON public.transaction_classification_edits FROM anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.transaction_classification_edits FROM authenticated;
REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.transaction_classification_edits FROM service_role;

CREATE FUNCTION public.edit_transaction_classification(
  p_tenant_id uuid,p_transaction_id uuid,p_actor_id uuid,p_kind text,
  p_is_recurring boolean,p_is_subscription boolean,p_spending_nature text,
  p_is_reimbursable boolean,p_is_tax_related boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_before public.transactions%ROWTYPE;v_edit_id uuid;v_before_attrs jsonb;v_after_attrs jsonb;
BEGIN
  IF p_kind NOT IN ('expense','income','transfer','investment','adjustment','refund','reimbursement') THEN RAISE EXCEPTION 'invalid transaction kind';END IF;
  IF p_spending_nature IS NOT NULL AND p_spending_nature NOT IN ('essential','discretionary') THEN RAISE EXCEPTION 'invalid spending nature';END IF;
  SELECT * INTO v_before FROM public.transactions WHERE id=p_transaction_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transaction not found';END IF;
  IF v_before.kind='adjustment' AND v_before.subcategory='Reconciliation' THEN RAISE EXCEPTION 'system reconciliation classification is locked';END IF;
  v_before_attrs:=jsonb_build_object('is_recurring',v_before.is_recurring,'recurring_source',v_before.recurring_source,'is_subscription',v_before.is_subscription,'subscription_source',v_before.subscription_source,'spending_nature',v_before.spending_nature,'is_reimbursable',v_before.is_reimbursable,'is_tax_related',v_before.is_tax_related);
  v_after_attrs:=jsonb_build_object('is_recurring',p_is_recurring,'recurring_source','user','is_subscription',p_is_subscription,'subscription_source','user','spending_nature',p_spending_nature,'is_reimbursable',p_is_reimbursable,'is_tax_related',p_is_tax_related);
  INSERT INTO public.transaction_classification_edits(tenant_id,transaction_id,actor_id,before_kind,before_kind_source,before_attributes,after_kind,after_kind_source,after_attributes)
  VALUES(p_tenant_id,p_transaction_id,p_actor_id,v_before.kind,v_before.kind_source,v_before_attrs,p_kind,'user',v_after_attrs) RETURNING id INTO v_edit_id;
  UPDATE public.transactions SET kind=p_kind,kind_source='user',transfer_candidate=transfer_candidate OR p_kind='transfer',is_recurring=p_is_recurring,recurring_source='user',is_subscription=p_is_subscription,subscription_source='user',spending_nature=p_spending_nature,is_reimbursable=p_is_reimbursable,is_tax_related=p_is_tax_related WHERE id=p_transaction_id AND tenant_id=p_tenant_id;
  RETURN jsonb_build_object('edit_id',v_edit_id,'transaction_id',p_transaction_id,'kind',p_kind,'kind_source','user','is_recurring',p_is_recurring,'is_subscription',p_is_subscription,'spending_nature',p_spending_nature,'is_reimbursable',p_is_reimbursable,'is_tax_related',p_is_tax_related);
END $$;

CREATE FUNCTION public.undo_transaction_classification_edit(p_tenant_id uuid,p_edit_id uuid,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_edit public.transaction_classification_edits%ROWTYPE;v_current public.transactions%ROWTYPE;a jsonb;
BEGIN
  SELECT * INTO v_edit FROM public.transaction_classification_edits WHERE id=p_edit_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'classification edit not found';END IF;
  IF v_edit.undone_at IS NOT NULL THEN RAISE EXCEPTION 'classification edit already undone';END IF;
  SELECT * INTO v_current FROM public.transactions WHERE id=v_edit.transaction_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transaction not found';END IF;
  IF v_current.kind IS DISTINCT FROM v_edit.after_kind OR v_current.kind_source IS DISTINCT FROM v_edit.after_kind_source
     OR jsonb_build_object('is_recurring',v_current.is_recurring,'recurring_source',v_current.recurring_source,'is_subscription',v_current.is_subscription,'subscription_source',v_current.subscription_source,'spending_nature',v_current.spending_nature,'is_reimbursable',v_current.is_reimbursable,'is_tax_related',v_current.is_tax_related) IS DISTINCT FROM v_edit.after_attributes
  THEN RAISE EXCEPTION 'transaction changed after this classification edit';END IF;
  a:=v_edit.before_attributes;
  UPDATE public.transactions SET kind=v_edit.before_kind,kind_source=v_edit.before_kind_source,
    is_recurring=(a->>'is_recurring')::boolean,recurring_source=a->>'recurring_source',
    is_subscription=(a->>'is_subscription')::boolean,subscription_source=a->>'subscription_source',
    spending_nature=nullif(a->>'spending_nature','null'),is_reimbursable=(a->>'is_reimbursable')::boolean,is_tax_related=(a->>'is_tax_related')::boolean
  WHERE id=v_edit.transaction_id AND tenant_id=p_tenant_id;
  UPDATE public.transaction_classification_edits SET undone_at=now(),undone_by=p_actor_id WHERE id=p_edit_id;
  RETURN jsonb_build_object('edit_id',p_edit_id,'transaction_id',v_edit.transaction_id,'kind',v_edit.before_kind,'kind_source',v_edit.before_kind_source,'is_recurring',(a->>'is_recurring')::boolean,'is_subscription',(a->>'is_subscription')::boolean,'spending_nature',nullif(a->>'spending_nature','null'),'is_reimbursable',(a->>'is_reimbursable')::boolean,'is_tax_related',(a->>'is_tax_related')::boolean,'undone',true);
END $$;

REVOKE ALL ON FUNCTION public.default_transaction_kind(text,text,integer),public.edit_transaction_classification(uuid,uuid,uuid,text,boolean,boolean,text,boolean,boolean),public.undo_transaction_classification_edit(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.edit_transaction_classification(uuid,uuid,uuid,text,boolean,boolean,text,boolean,boolean),public.undo_transaction_classification_edit(uuid,uuid,uuid) TO service_role;

-- Transfer matching now consumes kind, not category convention.
CREATE OR REPLACE FUNCTION public.transfer_candidates(p_tenant_id uuid,p_from date,p_to date)
RETURNS TABLE(txn_id uuid,account_id uuid,account_name text,account_type public.account_type,txn_date date,amount int,original_description text,dedupe_hash bytea,occurrence int,subcategory text,provider_posted_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT t.id,t.account_id,a.name,a.type,t.date,t.amount,t.original_description,t.dedupe_hash,t.occurrence,t.subcategory,t.provider_posted_at
  FROM public.transactions t JOIN public.accounts a ON a.id=t.account_id
  WHERE t.tenant_id=p_tenant_id AND t.transfer_candidate AND t.kind<>'adjustment' AND t.date BETWEEN p_from AND p_to AND t.amount<>0 AND a.type IN ('Liquid','Savings','Credit Card') AND NOT t.pending;
$$;

DROP VIEW public.transactions_analytic;
CREATE VIEW public.transactions_analytic WITH (security_invoker=true) AS
SELECT t.*,
  CASE WHEN d.verdict='rejected' THEN false WHEN d.verdict IN ('confirmed','external') THEN true
    ELSE COALESCE(t.kind='transfer' OR l.state IN ('auto','suggested','confirmed','external') OR il.state IN ('auto','suggested','confirmed'),false) END is_transfer,
  COALESCE(il.state,l.state,d.verdict,CASE WHEN t.transfer_candidate THEN 'unmatched' ELSE 'none' END) transfer_state,
  l.id transfer_link_id,il.id investment_cash_link_id
FROM public.transactions t
LEFT JOIN LATERAL (SELECT id,state FROM public.transfer_links WHERE from_txn_id=t.id UNION ALL SELECT id,state FROM public.transfer_links WHERE to_txn_id=t.id LIMIT 1) l ON true
LEFT JOIN public.investment_cash_links il ON il.transaction_id=t.id
LEFT JOIN LATERAL (SELECT verdict FROM (
  SELECT dd.verdict,dd.decided_at FROM public.transfer_decisions dd WHERE dd.tenant_id=t.tenant_id AND dd.from_account_id=t.account_id AND dd.from_hash=t.dedupe_hash AND dd.from_occurrence=t.occurrence
  UNION ALL SELECT dd.verdict,dd.decided_at FROM public.transfer_decisions dd WHERE dd.tenant_id=t.tenant_id AND dd.to_account_id=t.account_id AND dd.to_hash=t.dedupe_hash AND dd.to_occurrence=t.occurrence
  UNION ALL SELECT id.verdict,id.decided_at FROM public.investment_cash_decisions id WHERE id.tenant_id=t.tenant_id AND id.transaction_account_id=t.account_id AND id.transaction_hash=t.dedupe_hash AND id.transaction_occurrence=t.occurrence
) decisions ORDER BY decided_at DESC LIMIT 1) d ON true;
GRANT SELECT ON public.transactions_analytic TO authenticated;
REVOKE ALL ON public.transactions_analytic FROM anon;

DO $$ DECLARE bad_tables text;bad_views text;anon_grants text;bad_functions text;
BEGIN
  SELECT string_agg(c.relname,', ') INTO bad_tables FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;
  IF bad_tables IS NOT NULL THEN RAISE EXCEPTION 'tables without RLS: %',bad_tables;END IF;
  SELECT string_agg(c.relname,', ') INTO bad_views FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v' AND coalesce(c.reloptions,ARRAY[]::text[])@>ARRAY['security_invoker=true']=false;
  IF bad_views IS NOT NULL THEN RAISE EXCEPTION 'views without security_invoker: %',bad_views;END IF;
  SELECT string_agg(format('%s:%s/%s',grantee,table_name,privilege_type),', ') INTO anon_grants FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon';
  IF anon_grants IS NOT NULL THEN RAISE EXCEPTION 'anon grants: %',anon_grants;END IF;
  SELECT string_agg(routine_name,', ') INTO bad_functions FROM information_schema.role_routine_grants WHERE specific_schema='public' AND routine_name IN ('default_transaction_kind','edit_transaction_classification','undo_transaction_classification_edit') AND grantee IN ('PUBLIC','anon','authenticated');
  IF bad_functions IS NOT NULL THEN RAISE EXCEPTION 'unsafe classification function grants: %',bad_functions;END IF;
END $$;
