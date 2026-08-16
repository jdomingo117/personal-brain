-- Custom taxonomy identity is explicit, not encoded into the global FK column.
ALTER TABLE public.transactions ADD COLUMN custom_subcategory_id uuid REFERENCES public.tenant_subcategories(id);
ALTER TABLE public.merchant_rules ADD COLUMN custom_subcategory_id uuid REFERENCES public.tenant_subcategories(id);
ALTER TABLE public.transaction_allocations ADD COLUMN custom_subcategory_id uuid REFERENCES public.tenant_subcategories(id);

CREATE OR REPLACE FUNCTION public.sync_transaction_taxonomy_and_classification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_category_id text;v_subcategory_id text;v_custom_id uuid;v_display text;
BEGIN
  IF current_setting('halcyon.taxonomy_revert',true)='on' THEN NEW.category_id:=NULL;NEW.subcategory_id:=NULL;NEW.custom_subcategory_id:=NULL;RETURN NEW;END IF;
  IF TG_OP='UPDATE' AND OLD.kind='adjustment' AND OLD.kind_source='system' AND OLD.subcategory='Reconciliation'
     AND (NEW.category IS DISTINCT FROM OLD.category OR NEW.subcategory IS DISTINCT FROM OLD.subcategory) THEN RAISE EXCEPTION 'system reconciliation classification is locked';END IF;
  SELECT tc.id INTO v_category_id FROM public.taxonomy_categories tc WHERE tc.display_name=NEW.category AND tc.active;
  IF v_category_id IS NULL THEN RAISE EXCEPTION 'unknown taxonomy category: %',NEW.category;END IF;
  IF NEW.subcategory IS NOT NULL THEN
    SELECT ts.id INTO v_subcategory_id FROM public.taxonomy_subcategories ts WHERE ts.category_id=v_category_id AND ts.display_name=NEW.subcategory AND ts.active;
    IF v_subcategory_id IS NULL THEN
      SELECT cs.id,cs.display_name INTO v_custom_id,v_display FROM public.tenant_subcategories cs WHERE cs.tenant_id=NEW.tenant_id AND cs.category_id=v_category_id AND lower(cs.display_name)=lower(NEW.subcategory) AND cs.active;
      IF v_custom_id IS NULL THEN RAISE EXCEPTION 'subcategory % does not belong to %',NEW.subcategory,NEW.category;END IF;
      NEW.subcategory:=v_display;
    END IF;
  END IF;
  NEW.category_id:=v_category_id;NEW.subcategory_id:=v_subcategory_id;NEW.custom_subcategory_id:=v_custom_id;
  IF NEW.kind_source IS DISTINCT FROM 'user' THEN NEW.kind:=public.default_transaction_kind(NEW.category,NEW.subcategory,NEW.amount);NEW.kind_source:=CASE WHEN NEW.kind='adjustment' THEN 'system' ELSE 'derived' END;END IF;
  IF NEW.subscription_source IS DISTINCT FROM 'user' THEN NEW.is_subscription:=NEW.category='Lifestyle' AND NEW.subcategory IN ('Streaming','Software & digital services','Memberships');NEW.subscription_source:='derived';END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_taxonomy_ids()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_category_id text;v_subcategory_id text;v_custom_id uuid;v_display text;
BEGIN
  IF current_setting('halcyon.taxonomy_revert',true)='on' THEN NEW.category_id:=NULL;NEW.subcategory_id:=NULL;NEW.custom_subcategory_id:=NULL;RETURN NEW;END IF;
  SELECT tc.id INTO v_category_id FROM public.taxonomy_categories tc WHERE tc.display_name=NEW.category AND tc.active;
  IF v_category_id IS NULL THEN RAISE EXCEPTION 'unknown taxonomy category: %',NEW.category;END IF;
  IF NEW.subcategory IS NOT NULL THEN
    SELECT ts.id INTO v_subcategory_id FROM public.taxonomy_subcategories ts WHERE ts.category_id=v_category_id AND ts.display_name=NEW.subcategory AND ts.active;
    IF v_subcategory_id IS NULL THEN
      SELECT cs.id,cs.display_name INTO v_custom_id,v_display FROM public.tenant_subcategories cs WHERE cs.tenant_id=NEW.tenant_id AND cs.category_id=v_category_id AND lower(cs.display_name)=lower(NEW.subcategory) AND cs.active;
      IF v_custom_id IS NULL THEN RAISE EXCEPTION 'subcategory % does not belong to %',NEW.subcategory,NEW.category;END IF;
      NEW.subcategory:=v_display;
    END IF;
  END IF;
  NEW.category_id:=v_category_id;NEW.subcategory_id:=v_subcategory_id;NEW.custom_subcategory_id:=v_custom_id;RETURN NEW;
END $$;

DROP FUNCTION public.replace_transaction_allocations(uuid,uuid,uuid,jsonb);
DROP FUNCTION public.validate_allocation_pair(uuid,text,text);
CREATE FUNCTION public.validate_allocation_pair(p_tenant uuid,p_category text,p_subcategory text)
RETURNS TABLE(resolved_category_id text,resolved_subcategory_id text,resolved_custom_subcategory_id uuid,resolved_subcategory text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c text;s text;cu uuid;dn text;
BEGIN
  SELECT tc.id INTO c FROM public.taxonomy_categories tc WHERE tc.display_name=p_category AND tc.active;
  IF c IS NULL THEN RAISE EXCEPTION 'unknown taxonomy category: %',p_category;END IF;
  IF p_subcategory IS NOT NULL THEN
    SELECT ts.id,ts.display_name INTO s,dn FROM public.taxonomy_subcategories ts WHERE ts.category_id=c AND ts.display_name=p_subcategory AND ts.active;
    IF s IS NULL THEN SELECT cs.id,cs.display_name INTO cu,dn FROM public.tenant_subcategories cs WHERE cs.tenant_id=p_tenant AND cs.category_id=c AND lower(cs.display_name)=lower(p_subcategory) AND cs.active;END IF;
    IF s IS NULL AND cu IS NULL THEN RAISE EXCEPTION 'subcategory % does not belong to %',p_subcategory,p_category;END IF;
  END IF;
  RETURN QUERY SELECT c,s,cu,dn;
END $$;

CREATE OR REPLACE FUNCTION public.replace_transaction_allocations(p_tenant uuid,p_transaction uuid,p_actor uuid,p_allocations jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.transactions%ROWTYPE;before_json jsonb;after_json jsonb;edit uuid;r record;pair record;total bigint:=0;n int:=0;
BEGIN
  SELECT * INTO t FROM public.transactions WHERE id=p_transaction AND tenant_id=p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transaction not found';END IF;
  IF t.pending THEN RAISE EXCEPTION 'pending transactions cannot be split';END IF;
  IF t.kind='adjustment' AND t.kind_source='system' THEN RAISE EXCEPTION 'system reconciliation classification is locked';END IF;
  IF jsonb_typeof(p_allocations)<>'array' OR jsonb_array_length(p_allocations) NOT BETWEEN 2 AND 50 THEN RAISE EXCEPTION 'a split requires 2 to 50 allocations';END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(a)-'tenant_id' ORDER BY position),'[]'::jsonb) INTO before_json FROM public.transaction_allocations a WHERE transaction_id=p_transaction;
  CREATE TEMP TABLE allocation_stage(position smallint,amount int,kind text,category text,subcategory text,category_id text,subcategory_id text,custom_subcategory_id uuid,note text) ON COMMIT DROP;
  FOR r IN SELECT * FROM jsonb_to_recordset(p_allocations) AS x(position smallint,amount int,kind text,category text,subcategory text,note text) LOOP
    n:=n+1;total:=total+r.amount;
    IF r.position<0 OR r.position>49 OR r.amount=0 OR r.kind NOT IN ('expense','income','transfer','investment','adjustment','refund','reimbursement') THEN RAISE EXCEPTION 'invalid allocation';END IF;
    SELECT * INTO pair FROM public.validate_allocation_pair(p_tenant,r.category,nullif(r.subcategory,''));
    INSERT INTO allocation_stage VALUES(r.position,r.amount,r.kind,r.category,pair.resolved_subcategory,pair.resolved_category_id,pair.resolved_subcategory_id,pair.resolved_custom_subcategory_id,nullif(r.note,''));
  END LOOP;
  IF total<>t.amount THEN RAISE EXCEPTION 'allocation amounts must equal transaction amount';END IF;
  IF (SELECT count(*) FROM allocation_stage)<>(SELECT count(DISTINCT position) FROM allocation_stage) THEN RAISE EXCEPTION 'allocation positions must be unique';END IF;
  DELETE FROM public.transaction_allocations WHERE transaction_id=p_transaction;
  INSERT INTO public.transaction_allocations(tenant_id,transaction_id,position,amount,kind,category,subcategory,category_id,subcategory_id,custom_subcategory_id,note)
  SELECT p_tenant,p_transaction,s.position,s.amount,s.kind,s.category,s.subcategory,s.category_id,s.subcategory_id,s.custom_subcategory_id,s.note FROM allocation_stage s ORDER BY s.position;
  SELECT jsonb_agg(to_jsonb(a)-'tenant_id' ORDER BY position) INTO after_json FROM public.transaction_allocations a WHERE transaction_id=p_transaction;
  INSERT INTO public.transaction_allocation_edits(tenant_id,transaction_id,actor_id,before_allocations,after_allocations) VALUES(p_tenant,p_transaction,p_actor,before_json,after_json) RETURNING id INTO edit;
  RETURN jsonb_build_object('edit_id',edit,'transaction_id',p_transaction,'allocations',after_json);
END $$;

CREATE OR REPLACE FUNCTION public.undo_transaction_allocation_edit(p_tenant uuid,p_edit uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.transaction_allocation_edits%ROWTYPE;current_json jsonb;r record;
BEGIN
  SELECT * INTO e FROM public.transaction_allocation_edits WHERE id=p_edit AND tenant_id=p_tenant FOR UPDATE;
  IF NOT FOUND OR e.undone_at IS NOT NULL THEN RAISE EXCEPTION 'allocation edit not found or already undone';END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(a)-'tenant_id' ORDER BY position),'[]'::jsonb) INTO current_json FROM public.transaction_allocations a WHERE transaction_id=e.transaction_id;
  IF current_json IS DISTINCT FROM e.after_allocations THEN RAISE EXCEPTION 'transaction allocations changed after this edit';END IF;
  DELETE FROM public.transaction_allocations WHERE transaction_id=e.transaction_id;
  FOR r IN SELECT * FROM jsonb_to_recordset(e.before_allocations) AS x(id uuid,transaction_id uuid,position smallint,amount int,kind text,category text,subcategory text,category_id text,subcategory_id text,custom_subcategory_id uuid,note text,created_at timestamptz,updated_at timestamptz) LOOP
    INSERT INTO public.transaction_allocations(id,tenant_id,transaction_id,position,amount,kind,category,subcategory,category_id,subcategory_id,custom_subcategory_id,note,created_at,updated_at)
    VALUES(r.id,p_tenant,e.transaction_id,r.position,r.amount,r.kind,r.category,r.subcategory,r.category_id,r.subcategory_id,r.custom_subcategory_id,r.note,r.created_at,r.updated_at);
  END LOOP;
  UPDATE public.transaction_allocation_edits SET undone_at=now(),undone_by=p_actor WHERE id=p_edit;
  RETURN jsonb_build_object('edit_id',p_edit,'transaction_id',e.transaction_id,'allocations',e.before_allocations,'undone',true);
END $$;

REVOKE ALL ON FUNCTION public.validate_allocation_pair(uuid,text,text),public.sync_transaction_taxonomy_and_classification(),public.sync_taxonomy_ids() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_allocation_pair(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_transaction_allocations(uuid,uuid,uuid,jsonb) TO service_role;

DO $$ BEGIN
  IF has_function_privilege('authenticated','public.validate_allocation_pair(uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'allocation validator exposed';END IF;
END $$;
