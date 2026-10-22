-- Budget M2: additive, private-by-default persistence. Do not reset the personal database.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TABLE public.budget_source_versions (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
  dirty_from date, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.budget_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  version bigint NOT NULL DEFAULT 0 CHECK(version>=0),
  UNIQUE(tenant_id,id)
);
CREATE TABLE public.budget_draft_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL, draft_id uuid NOT NULL, version bigint NOT NULL CHECK(version>0),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=262144),
  source_revision bigint NOT NULL CHECK(source_revision>=0),
  method text NOT NULL CHECK(char_length(method) BETWEEN 1 AND 64),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,draft_id) REFERENCES public.budget_drafts(tenant_id,id) ON DELETE CASCADE,
  UNIQUE(draft_id,version)
);
CREATE TABLE public.budget_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  currency text NOT NULL CHECK(currency='AUD'), timezone text NOT NULL,
  frequency text NOT NULL CHECK(frequency IN('monthly','fortnightly')),
  anchor date NOT NULL, state text NOT NULL CHECK(state IN('active','archived')),
  version bigint NOT NULL CHECK(version>0), template_revision_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE UNIQUE INDEX budget_one_active_plan ON public.budget_plans(tenant_id) WHERE state='active';
CREATE TABLE public.budget_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, plan_id uuid NOT NULL,
  start_date date NOT NULL, end_date date NOT NULL, timezone text NOT NULL,
  frequency text NOT NULL CHECK(frequency IN('monthly','fortnightly')), transition boolean NOT NULL DEFAULT false,
  activated_revision_id uuid, current_revision_id uuid,
  CHECK(start_date<end_date), CHECK(start_date>='0001-01-01' AND end_date<='9999-12-31'),
  CHECK((frequency='fortnightly' AND NOT transition AND end_date=start_date+14) OR
    (frequency='monthly' AND end_date=(date_trunc('month',start_date)+interval '1 month')::date AND
      ((transition AND extract(day FROM start_date)>1) OR (NOT transition AND extract(day FROM start_date)=1)))),
  FOREIGN KEY(tenant_id,plan_id) REFERENCES public.budget_plans(tenant_id,id) ON DELETE CASCADE,
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,plan_id,id),
  EXCLUDE USING gist (plan_id WITH =, daterange(start_date,end_date,'[)') WITH &&)
);
CREATE TABLE public.budget_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, plan_id uuid NOT NULL,
  period_id uuid, version bigint NOT NULL CHECK(version>0),
  purpose text NOT NULL CHECK(purpose IN('period','template')),
  income_cents bigint NOT NULL CHECK(income_cents BETWEEN 0 AND 9007199254740991),
  drawdown_cents bigint NOT NULL CHECK(drawdown_cents BETWEEN 0 AND 9007199254740991),
  source_revision bigint NOT NULL CHECK(source_revision>=0),
  method text NOT NULL DEFAULT 'budget-foundation-v1',
  accepted_gap boolean NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,plan_id) REFERENCES public.budget_plans(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,plan_id,period_id) REFERENCES public.budget_periods(tenant_id,plan_id,id) ON DELETE CASCADE,
  CHECK((purpose='period' AND period_id IS NOT NULL) OR (purpose='template' AND period_id IS NULL)),
  UNIQUE(tenant_id,plan_id,id), UNIQUE(tenant_id,plan_id,period_id,id)
);
ALTER TABLE public.budget_plans ADD CONSTRAINT budget_template_pointer FOREIGN KEY(tenant_id,id,template_revision_id)
  REFERENCES public.budget_revisions(tenant_id,plan_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.budget_periods ADD CONSTRAINT budget_current_pointer FOREIGN KEY(tenant_id,plan_id,id,current_revision_id)
  REFERENCES public.budget_revisions(tenant_id,plan_id,period_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.budget_periods ADD CONSTRAINT budget_activation_pointer FOREIGN KEY(tenant_id,plan_id,id,activated_revision_id)
  REFERENCES public.budget_revisions(tenant_id,plan_id,period_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE public.budget_lines (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, plan_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN('fixed','reserve','everyday','contribution')),
  name text NOT NULL CHECK(char_length(trim(name)) BETWEEN 1 AND 60),
  opening_cents bigint NOT NULL DEFAULT 0 CHECK(opening_cents BETWEEN 0 AND 9007199254740991),
  opening_date date NOT NULL,
  FOREIGN KEY(tenant_id,plan_id) REFERENCES public.budget_plans(tenant_id,id) ON DELETE CASCADE,
  UNIQUE(tenant_id,plan_id,id)
);
CREATE UNIQUE INDEX budget_one_everyday_pool ON public.budget_lines(plan_id) WHERE kind='everyday';
CREATE TABLE public.budget_allocations (
  tenant_id uuid NOT NULL, plan_id uuid NOT NULL, revision_id uuid NOT NULL, line_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK(amount_cents BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(revision_id,line_id),
  FOREIGN KEY(tenant_id,plan_id,revision_id) REFERENCES public.budget_revisions(tenant_id,plan_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,plan_id,line_id) REFERENCES public.budget_lines(tenant_id,plan_id,id) ON DELETE CASCADE
);
CREATE TABLE public.budget_account_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, plan_id uuid NOT NULL,
  account_id uuid, original_account_id uuid NOT NULL,
  role text NOT NULL CHECK(role IN('activity','destination')), start_date date NOT NULL, end_date date,
  CHECK(end_date IS NULL OR end_date>start_date),
  FOREIGN KEY(tenant_id,plan_id) REFERENCES public.budget_plans(tenant_id,id) ON DELETE CASCADE,
  CHECK(account_id IS NULL OR account_id=original_account_id),
  UNIQUE(plan_id,original_account_id,role,start_date)
);
CREATE TABLE public.account_activity_coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, account_id uuid,
  original_account_id uuid NOT NULL, start_date date NOT NULL, end_date date NOT NULL,
  provenance text NOT NULL CHECK(provenance IN('user_confirmed','verified_statement','verified_provider')),
  evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object'), source_revision bigint NOT NULL,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, confirmed_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz, revoked_reason text,
  CHECK(start_date<end_date), CHECK(source_revision>=0),
  FOREIGN KEY(tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CHECK(account_id IS NULL OR account_id=original_account_id)
);
CREATE INDEX budget_coverage_account ON public.account_activity_coverage(tenant_id,account_id,start_date,end_date) WHERE revoked_at IS NULL;
CREATE TABLE public.budget_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, request_id uuid NOT NULL,
  payload_hash text NOT NULL, action text NOT NULL, before_state jsonb NOT NULL,
  after_state jsonb NOT NULL, outcome jsonb NOT NULL,
  undo_of uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,request_id), UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,undo_of) REFERENCES public.budget_operations(tenant_id,id)
);
CREATE UNIQUE INDEX budget_one_compensation ON public.budget_operations(undo_of) WHERE undo_of IS NOT NULL;

-- Equivalent ownership validation without a source FK's implicit KEY SHARE lock after the gate.
-- Account deletion clears these live pointers under the gate in its AFTER statement trigger.
CREATE FUNCTION public.budget_validate_account_ref() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.account_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN
    IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=NEW.account_id AND tenant_id=NEW.tenant_id) THEN RAISE EXCEPTION 'budget_account_unavailable';END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER budget_account_ref BEFORE INSERT OR UPDATE ON public.budget_account_memberships FOR EACH ROW EXECUTE FUNCTION public.budget_validate_account_ref();
CREATE TRIGGER budget_account_ref BEFORE INSERT OR UPDATE ON public.account_activity_coverage FOR EACH ROW EXECUTE FUNCTION public.budget_validate_account_ref();

-- DB-level invalidation includes direct service writes, bulk SQL RPCs and deletes.
CREATE FUNCTION public.budget_touch_source(p_tenant uuid,p_from date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  -- Tenant deletion must not resurrect a gate or block account/transaction cascades.
  IF NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant) THEN RETURN;END IF;
  INSERT INTO public.budget_source_versions(tenant_id,revision,dirty_from) VALUES(p_tenant,1,coalesce(p_from,'0001-01-01'))
  ON CONFLICT(tenant_id) DO UPDATE SET revision=budget_source_versions.revision+1,
    dirty_from=least(budget_source_versions.dirty_from,excluded.dirty_from),updated_at=now();
END $$;
CREATE FUNCTION public.budget_invalidate_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE query text; item record;
BEGIN
  query:=CASE TG_OP WHEN 'INSERT' THEN 'SELECT to_jsonb(r) j FROM new_rows r'
    WHEN 'DELETE' THEN 'SELECT to_jsonb(r) j FROM old_rows r'
    ELSE 'SELECT to_jsonb(r) j FROM old_rows r UNION ALL SELECT to_jsonb(r) j FROM new_rows r' END;
  FOR item IN EXECUTE 'SELECT (j->>''tenant_id'')::uuid tenant_id,min((j->>''date'')::date) dirty_from FROM ('||query||') s GROUP BY 1 ORDER BY 1' LOOP
    IF item.tenant_id IS NULL THEN
      -- Global taxonomy changes invalidate existing Budget users, not an arbitrary user's tenant.
      PERFORM public.budget_touch_source(v.tenant_id,NULL) FROM public.budget_source_versions v ORDER BY v.tenant_id;
    ELSE
      PERFORM public.budget_touch_source(item.tenant_id,item.dirty_from);
    END IF;
  END LOOP;
  IF TG_TABLE_NAME='transactions' AND TG_OP='DELETE' THEN
    -- Gate was acquired above. Never take source row locks after that gate.
    UPDATE public.account_activity_coverage c SET revoked_at=now(),revoked_reason='source_activity_deleted'
    WHERE c.revoked_at IS NULL AND EXISTS(SELECT 1 FROM old_rows r WHERE r.tenant_id=c.tenant_id AND r.account_id=c.account_id
      AND NOT r.pending AND r.date>=c.start_date AND r.date<c.end_date);
  END IF;
  IF TG_TABLE_NAME='accounts' AND TG_OP='DELETE' THEN
    UPDATE public.budget_account_memberships m SET account_id=NULL WHERE EXISTS(SELECT 1 FROM old_rows r WHERE r.id=m.account_id AND r.tenant_id=m.tenant_id);
    UPDATE public.account_activity_coverage c SET account_id=NULL,revoked_at=coalesce(c.revoked_at,now()),revoked_reason=coalesce(c.revoked_reason,'account_deleted')
      WHERE EXISTS(SELECT 1 FROM old_rows r WHERE r.id=c.account_id AND r.tenant_id=c.tenant_id);
  END IF;
  IF TG_TABLE_NAME='account_connections' AND TG_OP='DELETE' THEN
    UPDATE public.account_activity_coverage c SET revoked_at=now(),revoked_reason='account_mapping_removed'
      WHERE c.revoked_at IS NULL AND EXISTS(SELECT 1 FROM old_rows r WHERE r.tenant_id=c.tenant_id AND r.account_id=c.original_account_id);
  ELSIF TG_TABLE_NAME='account_connections' AND TG_OP='UPDATE' THEN
    UPDATE public.account_activity_coverage c SET revoked_at=now(),revoked_reason='account_mapping_changed'
      WHERE c.revoked_at IS NULL AND EXISTS(SELECT 1 FROM old_rows o JOIN new_rows n ON n.id=o.id
        WHERE o.tenant_id=c.tenant_id AND c.original_account_id IN(o.account_id,n.account_id)
          AND (o.account_id IS DISTINCT FROM n.account_id OR o.provider_account_id IS DISTINCT FROM n.provider_account_id OR o.cutover_date IS DISTINCT FROM n.cutover_date));
  END IF;
  RETURN NULL;
END $$;
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['transactions','transaction_allocations','accounts','upload_batches',
    'transfer_links','transfer_decisions','investment_cash_links','investment_cash_decisions',
    'account_connections','provider_connections','recurring_series_overrides','merchant_rules',
    'tenant_subcategories','taxonomy_categories','taxonomy_subcategories','classification_review_policies',
    'account_activity_coverage'] LOOP
    EXECUTE format('CREATE TRIGGER budget_invalidate_insert AFTER INSERT ON public.%I REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.budget_invalidate_source()',tbl);
    EXECUTE format('CREATE TRIGGER budget_invalidate_update AFTER UPDATE ON public.%I REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.budget_invalidate_source()',tbl);
    EXECUTE format('CREATE TRIGGER budget_invalidate_delete AFTER DELETE ON public.%I REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.budget_invalidate_source()',tbl);
  END LOOP;
END $$;

-- Existing-source query indexes, additive only. No analytical view replacement.
CREATE INDEX budget_transactions_scope_date ON public.transactions(tenant_id,account_id,date,id);

DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['budget_source_versions','budget_drafts','budget_draft_revisions','budget_plans','budget_periods',
    'budget_revisions','budget_lines','budget_allocations','budget_account_memberships','account_activity_coverage','budget_operations'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
    EXECUTE format('CREATE POLICY budget_member_read ON public.%I FOR SELECT USING(public.is_tenant_member(tenant_id))',tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tbl);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tbl);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO service_role',tbl);
    EXECUTE format('REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.%I FROM service_role',tbl);
  END LOOP;
  -- Setup input and operation payloads belong to the personal owner, not household collaboration.
  FOREACH tbl IN ARRAY ARRAY['budget_drafts','budget_draft_revisions','budget_operations'] LOOP
    EXECUTE format('DROP POLICY budget_member_read ON public.%I',tbl);
    EXECUTE format('CREATE POLICY budget_owner_read ON public.%I FOR SELECT USING(public.has_tenant_role(tenant_id,''owner''))',tbl);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.budget_touch_source(uuid,date),public.budget_invalidate_source(),public.budget_validate_account_ref() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_touch_source(uuid,date),public.budget_invalidate_source(),public.budget_validate_account_ref() TO service_role;

DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND (left(tablename,7)='budget_' OR tablename='account_activity_coverage') LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||t)::regclass) THEN RAISE EXCEPTION 'Budget RLS missing: %',t;END IF;
    IF EXISTS(SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name=t AND
      (grantee IN('anon','PUBLIC') OR (grantee='authenticated' AND privilege_type<>'SELECT'))) THEN RAISE EXCEPTION 'Budget grant leak: %',t;END IF;
  END LOOP;
END $$;
