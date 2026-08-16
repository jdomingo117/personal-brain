-- Phase 5: exact-cent allocations, tenant subcategories, managed rules and review policy.

CREATE TABLE public.tenant_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id text NOT NULL REFERENCES public.taxonomy_categories(id),
  display_name text NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 1 AND 48),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tenant_subcategories_name_unique
  ON public.tenant_subcategories (tenant_id,category_id,lower(display_name));
CREATE TRIGGER handle_updated_at_tenant_subcategories BEFORE UPDATE ON public.tenant_subcategories
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
ALTER TABLE public.tenant_subcategories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read custom subcategories" ON public.tenant_subcategories
  FOR SELECT USING (public.is_tenant_member(tenant_id));
GRANT SELECT ON public.tenant_subcategories TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.tenant_subcategories TO service_role;
REVOKE ALL ON public.tenant_subcategories FROM anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.tenant_subcategories FROM authenticated;
REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.tenant_subcategories FROM service_role;

CREATE TABLE public.classification_review_policies (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  ai_confidence_threshold real NOT NULL DEFAULT 0.75 CHECK (ai_confidence_threshold BETWEEN 0 AND 1),
  review_ai_missing_subcategory boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.classification_review_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read classification policy" ON public.classification_review_policies
  FOR SELECT USING (public.is_tenant_member(tenant_id));
GRANT SELECT ON public.classification_review_policies TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.classification_review_policies TO service_role;
REVOKE ALL ON public.classification_review_policies FROM anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.classification_review_policies FROM authenticated;
REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.classification_review_policies FROM service_role;

CREATE FUNCTION public.apply_classification_review_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.classification_review_policies%ROWTYPE;
BEGIN
  IF NEW.category_source='user' THEN RETURN NEW; END IF;
  IF NEW.category='Uncategorized' THEN NEW.needs_review:=true; RETURN NEW; END IF;
  IF NEW.category_source<>'ai' THEN RETURN NEW; END IF;
  SELECT * INTO p FROM public.classification_review_policies WHERE tenant_id=NEW.tenant_id;
  NEW.needs_review:=COALESCE(NEW.category_confidence,0)<COALESCE(p.ai_confidence_threshold,0.75)
    OR (COALESCE(p.review_ai_missing_subcategory,true) AND NEW.subcategory IS NULL);
  RETURN NEW;
END $$;
CREATE TRIGGER transactions_apply_review_policy
  BEFORE INSERT OR UPDATE OF category,subcategory,category_source,category_confidence ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.apply_classification_review_policy();

-- Accept either a system subcategory or one active tenant-owned subcategory.
CREATE OR REPLACE FUNCTION public.sync_transaction_taxonomy_and_classification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_category_id text;v_subcategory_id text;v_custom_id uuid;
BEGIN
  IF current_setting('halcyon.taxonomy_revert',true)='on' THEN NEW.category_id:=NULL;NEW.subcategory_id:=NULL;RETURN NEW;END IF;
  IF TG_OP='UPDATE' AND OLD.kind='adjustment' AND OLD.kind_source='system' AND OLD.subcategory='Reconciliation'
     AND (NEW.category IS DISTINCT FROM OLD.category OR NEW.subcategory IS DISTINCT FROM OLD.subcategory) THEN
    RAISE EXCEPTION 'system reconciliation classification is locked';
  END IF;
  SELECT id INTO v_category_id FROM public.taxonomy_categories WHERE display_name=NEW.category AND active;
  IF v_category_id IS NULL THEN RAISE EXCEPTION 'unknown taxonomy category: %',NEW.category;END IF;
  IF NEW.subcategory IS NOT NULL THEN
    SELECT id INTO v_subcategory_id FROM public.taxonomy_subcategories WHERE category_id=v_category_id AND display_name=NEW.subcategory AND active;
    IF v_subcategory_id IS NULL THEN
      SELECT id INTO v_custom_id FROM public.tenant_subcategories
       WHERE tenant_id=NEW.tenant_id AND category_id=v_category_id AND lower(display_name)=lower(NEW.subcategory) AND active;
      IF v_custom_id IS NULL THEN RAISE EXCEPTION 'subcategory % does not belong to %',NEW.subcategory,NEW.category;END IF;
      v_subcategory_id:='custom:'||v_custom_id::text;
      SELECT display_name INTO NEW.subcategory FROM public.tenant_subcategories WHERE id=v_custom_id;
    END IF;
  END IF;
  NEW.category_id:=v_category_id;NEW.subcategory_id:=v_subcategory_id;
  IF NEW.kind_source IS DISTINCT FROM 'user' THEN NEW.kind:=public.default_transaction_kind(NEW.category,NEW.subcategory,NEW.amount);NEW.kind_source:=CASE WHEN NEW.kind='adjustment' THEN 'system' ELSE 'derived' END;END IF;
  IF NEW.subscription_source IS DISTINCT FROM 'user' THEN NEW.is_subscription:=NEW.category='Lifestyle' AND NEW.subcategory IN ('Streaming','Software & digital services','Memberships');NEW.subscription_source:='derived';END IF;
  RETURN NEW;
END $$;

-- Merchant rules use the same stable identity contract, including custom subs.
CREATE OR REPLACE FUNCTION public.sync_taxonomy_ids()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_category_id text;v_subcategory_id text;v_custom_id uuid;
BEGIN
  IF current_setting('halcyon.taxonomy_revert',true)='on' THEN NEW.category_id:=NULL;NEW.subcategory_id:=NULL;RETURN NEW;END IF;
  SELECT id INTO v_category_id FROM public.taxonomy_categories WHERE display_name=NEW.category AND active;
  IF v_category_id IS NULL THEN RAISE EXCEPTION 'unknown taxonomy category: %',NEW.category;END IF;
  IF NEW.subcategory IS NOT NULL THEN
    SELECT id INTO v_subcategory_id FROM public.taxonomy_subcategories WHERE category_id=v_category_id AND display_name=NEW.subcategory AND active;
    IF v_subcategory_id IS NULL THEN
      SELECT id INTO v_custom_id FROM public.tenant_subcategories WHERE tenant_id=NEW.tenant_id AND category_id=v_category_id AND lower(display_name)=lower(NEW.subcategory) AND active;
      IF v_custom_id IS NULL THEN RAISE EXCEPTION 'subcategory % does not belong to %',NEW.subcategory,NEW.category;END IF;
      v_subcategory_id:='custom:'||v_custom_id::text;
      SELECT display_name INTO NEW.subcategory FROM public.tenant_subcategories WHERE id=v_custom_id;
    END IF;
  END IF;
  NEW.category_id:=v_category_id;NEW.subcategory_id:=v_subcategory_id;RETURN NEW;
END $$;

CREATE TABLE public.transaction_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 49),
  amount integer NOT NULL CHECK (amount<>0),
  kind text NOT NULL CHECK (kind IN ('expense','income','transfer','investment','adjustment','refund','reimbursement')),
  category text NOT NULL,
  subcategory text,
  category_id text NOT NULL REFERENCES public.taxonomy_categories(id),
  subcategory_id text,
  note text CHECK (note IS NULL OR char_length(note)<=160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(transaction_id,position)
);
CREATE INDEX transaction_allocations_tenant_transaction ON public.transaction_allocations(tenant_id,transaction_id);
CREATE TRIGGER handle_updated_at_transaction_allocations BEFORE UPDATE ON public.transaction_allocations
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
ALTER TABLE public.transaction_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read transaction allocations" ON public.transaction_allocations
  FOR SELECT USING (public.is_tenant_member(tenant_id));
GRANT SELECT ON public.transaction_allocations TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.transaction_allocations TO service_role;
REVOKE ALL ON public.transaction_allocations FROM anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.transaction_allocations FROM authenticated;
REVOKE TRUNCATE,REFERENCES,TRIGGER ON public.transaction_allocations FROM service_role;

CREATE TABLE public.transaction_allocation_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  before_allocations jsonb NOT NULL,
  after_allocations jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  undone_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.transaction_allocation_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read allocation history" ON public.transaction_allocation_edits
  FOR SELECT USING (public.is_tenant_member(tenant_id));
GRANT SELECT ON public.transaction_allocation_edits TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.transaction_allocation_edits TO service_role;
REVOKE ALL ON public.transaction_allocation_edits FROM anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.transaction_allocation_edits FROM authenticated;
REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.transaction_allocation_edits FROM service_role;

CREATE FUNCTION public.validate_allocation_pair(p_tenant uuid,p_category text,p_subcategory text)
RETURNS TABLE(category_id text,subcategory_id text,subcategory text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c text;s text;cu uuid;dn text;
BEGIN
  SELECT id INTO c FROM public.taxonomy_categories WHERE display_name=p_category AND active;
  IF c IS NULL THEN RAISE EXCEPTION 'unknown taxonomy category: %',p_category;END IF;
  IF p_subcategory IS NOT NULL THEN
    SELECT id,display_name INTO s,dn FROM public.taxonomy_subcategories WHERE category_id=c AND display_name=p_subcategory AND active;
    IF s IS NULL THEN SELECT id,display_name INTO cu,dn FROM public.tenant_subcategories WHERE tenant_id=p_tenant AND category_id=c AND lower(display_name)=lower(p_subcategory) AND active;END IF;
    IF s IS NULL AND cu IS NULL THEN RAISE EXCEPTION 'subcategory % does not belong to %',p_subcategory,p_category;END IF;
  END IF;
  RETURN QUERY SELECT c,CASE WHEN s IS NOT NULL THEN s WHEN cu IS NOT NULL THEN 'custom:'||cu::text END,dn;
END $$;

CREATE FUNCTION public.replace_transaction_allocations(p_tenant uuid,p_transaction uuid,p_actor uuid,p_allocations jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.transactions%ROWTYPE;before_json jsonb;after_json jsonb;edit uuid;r record;pair record;total bigint:=0;n int:=0;
BEGIN
  SELECT * INTO t FROM public.transactions WHERE id=p_transaction AND tenant_id=p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transaction not found';END IF;
  IF t.pending THEN RAISE EXCEPTION 'pending transactions cannot be split';END IF;
  IF t.kind='adjustment' AND t.kind_source='system' THEN RAISE EXCEPTION 'system reconciliation classification is locked';END IF;
  IF jsonb_typeof(p_allocations)<>'array' OR jsonb_array_length(p_allocations) NOT BETWEEN 2 AND 50 THEN RAISE EXCEPTION 'a split requires 2 to 50 allocations';END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(a)-'tenant_id' ORDER BY position),'[]'::jsonb) INTO before_json FROM public.transaction_allocations a WHERE transaction_id=p_transaction;
  CREATE TEMP TABLE allocation_stage(position smallint,amount int,kind text,category text,subcategory text,category_id text,subcategory_id text,note text) ON COMMIT DROP;
  FOR r IN SELECT * FROM jsonb_to_recordset(p_allocations) AS x(position smallint,amount int,kind text,category text,subcategory text,note text) LOOP
    n:=n+1;total:=total+r.amount;
    IF r.position<0 OR r.position>49 OR r.amount=0 OR r.kind NOT IN ('expense','income','transfer','investment','adjustment','refund','reimbursement') THEN RAISE EXCEPTION 'invalid allocation';END IF;
    SELECT * INTO pair FROM public.validate_allocation_pair(p_tenant,r.category,nullif(r.subcategory,''));
    INSERT INTO allocation_stage VALUES(r.position,r.amount,r.kind,r.category,pair.subcategory,pair.category_id,pair.subcategory_id,nullif(r.note,''));
  END LOOP;
  IF total<>t.amount THEN RAISE EXCEPTION 'allocation amounts must equal transaction amount';END IF;
  IF (SELECT count(*) FROM allocation_stage)<>(SELECT count(DISTINCT position) FROM allocation_stage) THEN RAISE EXCEPTION 'allocation positions must be unique';END IF;
  DELETE FROM public.transaction_allocations WHERE transaction_id=p_transaction;
  INSERT INTO public.transaction_allocations(tenant_id,transaction_id,position,amount,kind,category,subcategory,category_id,subcategory_id,note)
  SELECT p_tenant,p_transaction,position,amount,kind,category,subcategory,category_id,subcategory_id,note FROM allocation_stage ORDER BY position;
  SELECT jsonb_agg(to_jsonb(a)-'tenant_id' ORDER BY position) INTO after_json FROM public.transaction_allocations a WHERE transaction_id=p_transaction;
  INSERT INTO public.transaction_allocation_edits(tenant_id,transaction_id,actor_id,before_allocations,after_allocations) VALUES(p_tenant,p_transaction,p_actor,before_json,after_json) RETURNING id INTO edit;
  RETURN jsonb_build_object('edit_id',edit,'transaction_id',p_transaction,'allocations',after_json);
END $$;

CREATE FUNCTION public.undo_transaction_allocation_edit(p_tenant uuid,p_edit uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.transaction_allocation_edits%ROWTYPE;current_json jsonb;r record;
BEGIN
  SELECT * INTO e FROM public.transaction_allocation_edits WHERE id=p_edit AND tenant_id=p_tenant FOR UPDATE;
  IF NOT FOUND OR e.undone_at IS NOT NULL THEN RAISE EXCEPTION 'allocation edit not found or already undone';END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(a)-'tenant_id' ORDER BY position),'[]'::jsonb) INTO current_json FROM public.transaction_allocations a WHERE transaction_id=e.transaction_id;
  IF current_json IS DISTINCT FROM e.after_allocations THEN RAISE EXCEPTION 'transaction allocations changed after this edit';END IF;
  DELETE FROM public.transaction_allocations WHERE transaction_id=e.transaction_id;
  FOR r IN SELECT * FROM jsonb_to_recordset(e.before_allocations) AS x(id uuid,transaction_id uuid,position smallint,amount int,kind text,category text,subcategory text,category_id text,subcategory_id text,note text,created_at timestamptz,updated_at timestamptz) LOOP
    INSERT INTO public.transaction_allocations(id,tenant_id,transaction_id,position,amount,kind,category,subcategory,category_id,subcategory_id,note,created_at,updated_at)
    VALUES(r.id,p_tenant,e.transaction_id,r.position,r.amount,r.kind,r.category,r.subcategory,r.category_id,r.subcategory_id,r.note,r.created_at,r.updated_at);
  END LOOP;
  UPDATE public.transaction_allocation_edits SET undone_at=now(),undone_by=p_actor WHERE id=p_edit;
  RETURN jsonb_build_object('edit_id',p_edit,'transaction_id',e.transaction_id,'allocations',e.before_allocations,'undone',true);
END $$;

CREATE FUNCTION public.create_tenant_subcategory(p_tenant uuid,p_actor uuid,p_category text,p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c text;s public.tenant_subcategories%ROWTYPE;
BEGIN
  SELECT id INTO c FROM public.taxonomy_categories WHERE display_name=p_category AND active AND classification='expense';
  IF c IS NULL THEN RAISE EXCEPTION 'custom subcategories require an expense category';END IF;
  IF EXISTS(SELECT 1 FROM public.taxonomy_subcategories WHERE category_id=c AND lower(display_name)=lower(trim(p_name))) THEN RAISE EXCEPTION 'subcategory already exists';END IF;
  INSERT INTO public.tenant_subcategories(tenant_id,category_id,display_name,created_by) VALUES(p_tenant,c,trim(p_name),p_actor) RETURNING * INTO s;
  RETURN jsonb_build_object('id',s.id,'category_id',s.category_id,'display_name',s.display_name);
END $$;

CREATE FUNCTION public.set_classification_review_policy(p_tenant uuid,p_actor uuid,p_threshold real,p_missing boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  INSERT INTO public.classification_review_policies(tenant_id,ai_confidence_threshold,review_ai_missing_subcategory,updated_by)
  VALUES(p_tenant,p_threshold,p_missing,p_actor) ON CONFLICT(tenant_id) DO UPDATE SET ai_confidence_threshold=excluded.ai_confidence_threshold,review_ai_missing_subcategory=excluded.review_ai_missing_subcategory,updated_by=excluded.updated_by,updated_at=now();
  UPDATE public.transactions SET needs_review=COALESCE(category_confidence,0)<p_threshold OR (p_missing AND subcategory IS NULL)
   WHERE tenant_id=p_tenant AND category_source='ai';
  RETURN jsonb_build_object('ai_confidence_threshold',p_threshold,'review_ai_missing_subcategory',p_missing);
END $$;

CREATE FUNCTION public.delete_user_merchant_rule(p_tenant uuid,p_rule uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.merchant_rules%ROWTYPE;
BEGIN
  DELETE FROM public.merchant_rules WHERE id=p_rule AND tenant_id=p_tenant AND source='user' RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'user merchant rule not found';END IF;
  RETURN jsonb_build_object('id',r.id,'merchant_key',r.merchant_key,'deleted',true);
END $$;

REVOKE ALL ON FUNCTION public.apply_classification_review_policy(),public.validate_allocation_pair(uuid,text,text),public.replace_transaction_allocations(uuid,uuid,uuid,jsonb),public.undo_transaction_allocation_edit(uuid,uuid,uuid),public.create_tenant_subcategory(uuid,uuid,text,text),public.set_classification_review_policy(uuid,uuid,real,boolean),public.delete_user_merchant_rule(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_transaction_allocations(uuid,uuid,uuid,jsonb),public.undo_transaction_allocation_edit(uuid,uuid,uuid),public.create_tenant_subcategory(uuid,uuid,text,text),public.set_classification_review_policy(uuid,uuid,real,boolean),public.delete_user_merchant_rule(uuid,uuid) TO service_role;

DO $$ DECLARE bad_tables text;bad_views text;anon_grants text;unsafe text;
BEGIN
  SELECT string_agg(c.relname,', ') INTO bad_tables FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;
  IF bad_tables IS NOT NULL THEN RAISE EXCEPTION 'tables without RLS: %',bad_tables;END IF;
  SELECT string_agg(c.relname,', ') INTO bad_views FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v' AND NOT coalesce(c.reloptions,ARRAY[]::text[])@>ARRAY['security_invoker=true'];
  IF bad_views IS NOT NULL THEN RAISE EXCEPTION 'views without security_invoker: %',bad_views;END IF;
  SELECT string_agg(format('%s:%s/%s',grantee,table_name,privilege_type),', ') INTO anon_grants FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon';
  IF anon_grants IS NOT NULL THEN RAISE EXCEPTION 'anon grants: %',anon_grants;END IF;
  SELECT string_agg(routine_name,', ') INTO unsafe FROM information_schema.role_routine_grants WHERE specific_schema='public' AND routine_name IN ('replace_transaction_allocations','undo_transaction_allocation_edit','create_tenant_subcategory','set_classification_review_policy','delete_user_merchant_rule','validate_allocation_pair','apply_classification_review_policy') AND grantee IN ('PUBLIC','anon','authenticated');
  IF unsafe IS NOT NULL THEN RAISE EXCEPTION 'unsafe phase5 function grants: %',unsafe;END IF;
END $$;
