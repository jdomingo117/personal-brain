-- Phase 3: stable taxonomy identities and a reversible, audited vocabulary
-- migration. Text labels remain denormalised for reporting compatibility;
-- stable ids become the durable identity and write-time validation boundary.

CREATE TABLE public.taxonomy_categories (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
  display_name text NOT NULL UNIQUE,
  classification text NOT NULL CHECK (classification IN ('expense', 'income', 'transfer', 'investment', 'unresolved')),
  sort_order integer NOT NULL UNIQUE,
  color_token text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.taxonomy_subcategories (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+\.[a-z0-9-]+$'),
  category_id text NOT NULL REFERENCES public.taxonomy_categories(id),
  display_name text NOT NULL,
  sort_order integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, display_name),
  UNIQUE (category_id, sort_order)
);

CREATE TABLE public.taxonomy_category_aliases (
  source_name text PRIMARY KEY,
  target_category_id text NOT NULL REFERENCES public.taxonomy_categories(id),
  migration_version text NOT NULL DEFAULT 'v2'
);

CREATE TABLE public.taxonomy_subcategory_aliases (
  source_category text NOT NULL,
  source_subcategory text NOT NULL,
  target_subcategory_id text NOT NULL REFERENCES public.taxonomy_subcategories(id),
  migration_version text NOT NULL DEFAULT 'v2',
  PRIMARY KEY (source_category, source_subcategory)
);

INSERT INTO public.taxonomy_categories (id, display_name, classification, sort_order, color_token) VALUES
  ('food-and-drink', 'Food & drink', 'expense', 1, '--cat-1'),
  ('home', 'Home', 'expense', 2, '--cat-2'),
  ('transport', 'Transport', 'expense', 3, '--cat-3'),
  ('bills-and-utilities', 'Bills & utilities', 'expense', 4, '--cat-4'),
  ('shopping', 'Shopping', 'expense', 5, '--cat-5'),
  ('health-and-wellbeing', 'Health & wellbeing', 'expense', 6, '--cat-6'),
  ('lifestyle', 'Lifestyle', 'expense', 7, '--cat-7'),
  ('travel', 'Travel', 'expense', 8, '--cat-8'),
  ('family-and-pets', 'Family & pets', 'expense', 9, '--cat-9'),
  ('education', 'Education', 'expense', 10, '--cat-10'),
  ('financial-and-admin', 'Financial & admin', 'expense', 11, '--cat-11'),
  ('giving', 'Giving', 'expense', 12, '--cat-12'),
  ('other', 'Other', 'expense', 13, '--cat-13'),
  ('income', 'Income', 'income', 20, NULL),
  ('transfer', 'Transfer', 'transfer', 21, NULL),
  ('investing', 'Investing', 'investment', 22, NULL),
  ('uncategorized', 'Uncategorized', 'unresolved', 99, NULL);

INSERT INTO public.taxonomy_subcategories (id, category_id, display_name, sort_order) VALUES
  ('food-and-drink.groceries', 'food-and-drink', 'Groceries', 1),
  ('food-and-drink.dining-and-takeaway', 'food-and-drink', 'Dining & takeaway', 2),
  ('food-and-drink.coffee', 'food-and-drink', 'Coffee', 3),
  ('food-and-drink.alcohol-and-pubs', 'food-and-drink', 'Alcohol & pubs', 4),
  ('home.rent', 'home', 'Rent', 1), ('home.rates', 'home', 'Rates', 2),
  ('home.maintenance', 'home', 'Maintenance', 3), ('home.home-insurance', 'home', 'Home insurance', 4),
  ('home.furnishings', 'home', 'Furnishings', 5),
  ('transport.fuel', 'transport', 'Fuel', 1), ('transport.public-transport', 'transport', 'Public transport', 2),
  ('transport.rideshare', 'transport', 'Rideshare', 3), ('transport.parking-and-tolls', 'transport', 'Parking & tolls', 4),
  ('transport.registration', 'transport', 'Registration', 5), ('transport.servicing', 'transport', 'Servicing', 6),
  ('transport.car-insurance', 'transport', 'Car insurance', 7),
  ('bills-and-utilities.electricity-and-gas', 'bills-and-utilities', 'Electricity & gas', 1),
  ('bills-and-utilities.water', 'bills-and-utilities', 'Water', 2),
  ('bills-and-utilities.internet', 'bills-and-utilities', 'Internet', 3),
  ('bills-and-utilities.mobile', 'bills-and-utilities', 'Mobile', 4),
  ('shopping.clothing', 'shopping', 'Clothing', 1), ('shopping.electronics', 'shopping', 'Electronics', 2),
  ('shopping.household', 'shopping', 'Household', 3), ('shopping.gifts', 'shopping', 'Gifts', 4),
  ('shopping.general-retail', 'shopping', 'General retail', 5),
  ('health-and-wellbeing.medical', 'health-and-wellbeing', 'Medical', 1),
  ('health-and-wellbeing.dental', 'health-and-wellbeing', 'Dental', 2),
  ('health-and-wellbeing.pharmacy', 'health-and-wellbeing', 'Pharmacy', 3),
  ('health-and-wellbeing.allied-health', 'health-and-wellbeing', 'Allied health', 4),
  ('health-and-wellbeing.fitness', 'health-and-wellbeing', 'Fitness', 5),
  ('health-and-wellbeing.personal-care', 'health-and-wellbeing', 'Personal care', 6),
  ('lifestyle.streaming', 'lifestyle', 'Streaming', 1),
  ('lifestyle.software-and-digital-services', 'lifestyle', 'Software & digital services', 2),
  ('lifestyle.memberships', 'lifestyle', 'Memberships', 3), ('lifestyle.events', 'lifestyle', 'Events', 4),
  ('lifestyle.hobbies', 'lifestyle', 'Hobbies', 5), ('lifestyle.gaming', 'lifestyle', 'Gaming', 6),
  ('lifestyle.recreation', 'lifestyle', 'Recreation', 7),
  ('travel.flights', 'travel', 'Flights', 1), ('travel.accommodation', 'travel', 'Accommodation', 2),
  ('travel.local-transport', 'travel', 'Local transport', 3), ('travel.activities', 'travel', 'Activities', 4),
  ('travel.general-travel', 'travel', 'General travel', 5),
  ('family-and-pets.childcare', 'family-and-pets', 'Childcare', 1),
  ('family-and-pets.school', 'family-and-pets', 'School', 2), ('family-and-pets.children', 'family-and-pets', 'Children', 3),
  ('family-and-pets.pet-care', 'family-and-pets', 'Pet care', 4), ('family-and-pets.veterinary', 'family-and-pets', 'Veterinary', 5),
  ('education.courses', 'education', 'Courses', 1), ('education.books', 'education', 'Books', 2),
  ('education.student-costs', 'education', 'Student costs', 3),
  ('financial-and-admin.bank-fees', 'financial-and-admin', 'Bank fees', 1),
  ('financial-and-admin.government-charges', 'financial-and-admin', 'Government charges', 2),
  ('financial-and-admin.tax', 'financial-and-admin', 'Tax', 3),
  ('financial-and-admin.accounting', 'financial-and-admin', 'Accounting', 4),
  ('financial-and-admin.legal', 'financial-and-admin', 'Legal', 5),
  ('giving.charity', 'giving', 'Charity', 1), ('giving.donations', 'giving', 'Donations', 2),
  ('other.cash-withdrawal', 'other', 'Cash withdrawal', 1), ('other.miscellaneous', 'other', 'Miscellaneous', 2),
  ('income.salary', 'income', 'Salary', 1), ('income.interest', 'income', 'Interest', 2),
  ('income.dividends-and-distributions', 'income', 'Dividends & distributions', 3),
  ('income.benefits', 'income', 'Benefits', 4), ('income.rental-and-business-income', 'income', 'Rental & business income', 5),
  ('income.refund', 'income', 'Refund', 6), ('income.reimbursement', 'income', 'Reimbursement', 7),
  ('income.transfer-in', 'income', 'Transfer In', 8), ('income.other', 'income', 'Other', 9),
  ('transfer.internal', 'transfer', 'Internal', 1),
  ('transfer.managed-fund-funding', 'transfer', 'Managed fund funding', 2),
  ('transfer.reconciliation', 'transfer', 'Reconciliation', 3),
  ('investing.auto-invest', 'investing', 'Auto-invest', 1), ('investing.brokerage', 'investing', 'Brokerage', 2),
  ('investing.managed-fund-purchase', 'investing', 'Managed fund purchase', 3),
  ('investing.managed-fund-funding', 'investing', 'Managed fund funding', 4),
  ('investing.distribution', 'investing', 'Distribution', 5);

INSERT INTO public.taxonomy_category_aliases (source_name, target_category_id) VALUES
  ('Food', 'food-and-drink'), ('Housing', 'home'), ('Transport', 'transport'),
  ('Utilities', 'bills-and-utilities'), ('Subscriptions', 'lifestyle'), ('Retail', 'shopping'),
  ('Health', 'health-and-wellbeing'), ('Other', 'other'), ('Income', 'income'),
  ('Transfer', 'transfer'), ('Investing', 'investing'), ('Uncategorized', 'uncategorized');

INSERT INTO public.taxonomy_subcategory_aliases (source_category, source_subcategory, target_subcategory_id) VALUES
  ('Food','Groceries','food-and-drink.groceries'), ('Food','Dining','food-and-drink.dining-and-takeaway'), ('Food','Coffee','food-and-drink.coffee'),
  ('Housing','Rent','home.rent'), ('Housing','Maintenance','home.maintenance'), ('Housing','Insurance','home.home-insurance'),
  ('Transport','Fuel','transport.fuel'), ('Transport','Rideshare','transport.rideshare'), ('Transport','Transit','transport.public-transport'),
  ('Transport','Parking','transport.parking-and-tolls'), ('Transport','Travel','travel.general-travel'),
  ('Utilities','Power','bills-and-utilities.electricity-and-gas'), ('Utilities','Water','bills-and-utilities.water'),
  ('Utilities','Internet','bills-and-utilities.internet'), ('Utilities','Mobile','bills-and-utilities.mobile'),
  ('Subscriptions','Streaming','lifestyle.streaming'), ('Subscriptions','Software','lifestyle.software-and-digital-services'),
  ('Subscriptions','Memberships','lifestyle.memberships'), ('Retail','Apparel','shopping.clothing'),
  ('Retail','Electronics','shopping.electronics'), ('Retail','Home','shopping.household'), ('Retail','Gifts','shopping.gifts'),
  ('Health','Medical','health-and-wellbeing.medical'), ('Health','Pharmacy','health-and-wellbeing.pharmacy'),
  ('Health','Fitness','health-and-wellbeing.fitness'), ('Health','Personal care','health-and-wellbeing.personal-care'),
  ('Other','Cash','other.cash-withdrawal'), ('Other','Fees','financial-and-admin.bank-fees'), ('Other','Misc','other.miscellaneous'),
  ('Income','Salary','income.salary'), ('Income','Interest','income.interest'), ('Income','Refund','income.refund'),
  ('Income','Transfer In','income.transfer-in'), ('Income','Other','income.other'),
  ('Transfer','Internal','transfer.internal'), ('Transfer','Managed fund funding','transfer.managed-fund-funding'),
  ('Transfer','Reconciliation','transfer.reconciliation'), ('Investing','Auto-invest','investing.auto-invest'),
  ('Investing','Brokerage','investing.brokerage'), ('Investing','Managed fund purchase','investing.managed-fund-purchase'),
  ('Investing','Managed fund funding','investing.managed-fund-funding'), ('Investing','Distribution','investing.distribution');

ALTER TABLE public.taxonomy_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxonomy_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxonomy_category_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxonomy_subcategory_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated users read taxonomy categories" ON public.taxonomy_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated users read taxonomy subcategories" ON public.taxonomy_subcategories FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated users read taxonomy category aliases" ON public.taxonomy_category_aliases FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated users read taxonomy subcategory aliases" ON public.taxonomy_subcategory_aliases FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.taxonomy_categories, public.taxonomy_subcategories,
  public.taxonomy_category_aliases, public.taxonomy_subcategory_aliases TO authenticated;
REVOKE ALL ON public.taxonomy_categories, public.taxonomy_subcategories,
  public.taxonomy_category_aliases, public.taxonomy_subcategory_aliases FROM anon;

CREATE TABLE public.taxonomy_migration_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'reverted')),
  transaction_count integer NOT NULL,
  cents_before bigint NOT NULL,
  cents_after bigint,
  before_distribution jsonb NOT NULL,
  after_distribution jsonb,
  applied_at timestamptz NOT NULL DEFAULT now(),
  reverted_at timestamptz,
  UNIQUE (tenant_id, version)
);

CREATE TABLE public.taxonomy_migration_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  migration_run_id uuid NOT NULL REFERENCES public.taxonomy_migration_runs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_table text NOT NULL CHECK (target_table IN ('transactions','merchant_rules','budgets','transaction_category_edits.before','transaction_category_edits.after')),
  target_id uuid NOT NULL,
  before_category text NOT NULL,
  before_subcategory text,
  after_category text NOT NULL,
  after_subcategory text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_taxonomy_migration_events_run ON public.taxonomy_migration_events (migration_run_id, target_table);
ALTER TABLE public.taxonomy_migration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxonomy_migration_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read taxonomy migration runs" ON public.taxonomy_migration_runs FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members read taxonomy migration events" ON public.taxonomy_migration_events FOR SELECT USING (public.is_tenant_member(tenant_id));
GRANT SELECT ON public.taxonomy_migration_runs, public.taxonomy_migration_events TO authenticated;
REVOKE ALL ON public.taxonomy_migration_runs, public.taxonomy_migration_events FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.taxonomy_migration_runs TO service_role;
GRANT SELECT, INSERT ON public.taxonomy_migration_events TO service_role;

CREATE FUNCTION public.taxonomy_v2_category(p_category text)
RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(c.display_name, p_category)
  FROM (SELECT 1) x
  LEFT JOIN public.taxonomy_category_aliases a ON a.source_name = p_category
  LEFT JOIN public.taxonomy_categories c ON c.id = a.target_category_id
$$;

CREATE FUNCTION public.taxonomy_v2_subcategory(p_category text, p_subcategory text)
RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p_subcategory IS NULL THEN NULL
    ELSE coalesce(s.display_name, p_subcategory)
  END
  FROM (SELECT 1) x
  LEFT JOIN public.taxonomy_subcategory_aliases a
    ON a.source_category = p_category AND a.source_subcategory = p_subcategory
  LEFT JOIN public.taxonomy_subcategories s ON s.id = a.target_subcategory_id
$$;

-- Travel moved out of Transport, and fees moved out of Other; those pair-level
-- mappings override the ordinary category alias.
CREATE FUNCTION public.taxonomy_v2_pair_category(p_category text, p_subcategory text)
RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p_category = 'Transport' AND p_subcategory = 'Travel' THEN 'Travel'
    WHEN p_category = 'Other' AND p_subcategory = 'Fees' THEN 'Financial & admin'
    ELSE public.taxonomy_v2_category(p_category)
  END
$$;

INSERT INTO public.taxonomy_migration_runs (
  tenant_id, version, transaction_count, cents_before, before_distribution
)
SELECT tenant_id, 'v2', count(*)::integer, coalesce(sum(amount),0),
       jsonb_object_agg(category, rows ORDER BY category)
FROM (
  SELECT tenant_id, category, count(*) rows, sum(amount) amount
  FROM public.transactions GROUP BY tenant_id, category
) grouped
GROUP BY tenant_id;

INSERT INTO public.taxonomy_migration_events (
  migration_run_id, tenant_id, target_table, target_id,
  before_category, before_subcategory, after_category, after_subcategory
)
SELECT r.id, t.tenant_id, 'transactions', t.id, t.category, t.subcategory,
       public.taxonomy_v2_pair_category(t.category,t.subcategory), public.taxonomy_v2_subcategory(t.category,t.subcategory)
FROM public.transactions t JOIN public.taxonomy_migration_runs r ON r.tenant_id=t.tenant_id AND r.version='v2'
WHERE (t.category,t.subcategory) IS DISTINCT FROM
      (public.taxonomy_v2_pair_category(t.category,t.subcategory),public.taxonomy_v2_subcategory(t.category,t.subcategory));

INSERT INTO public.taxonomy_migration_events (migration_run_id,tenant_id,target_table,target_id,before_category,before_subcategory,after_category,after_subcategory)
SELECT r.id,m.tenant_id,'merchant_rules',m.id,m.category,m.subcategory,
       public.taxonomy_v2_pair_category(m.category,m.subcategory),public.taxonomy_v2_subcategory(m.category,m.subcategory)
FROM public.merchant_rules m JOIN public.taxonomy_migration_runs r ON r.tenant_id=m.tenant_id AND r.version='v2'
WHERE (m.category,m.subcategory) IS DISTINCT FROM
      (public.taxonomy_v2_pair_category(m.category,m.subcategory),public.taxonomy_v2_subcategory(m.category,m.subcategory));

INSERT INTO public.taxonomy_migration_events (migration_run_id,tenant_id,target_table,target_id,before_category,before_subcategory,after_category,after_subcategory)
SELECT r.id,b.tenant_id,'budgets',b.id,b.category,NULL,public.taxonomy_v2_category(b.category),NULL
FROM public.budgets b JOIN public.taxonomy_migration_runs r ON r.tenant_id=b.tenant_id AND r.version='v2'
WHERE b.category IS DISTINCT FROM public.taxonomy_v2_category(b.category);

INSERT INTO public.taxonomy_migration_events (migration_run_id,tenant_id,target_table,target_id,before_category,before_subcategory,after_category,after_subcategory)
SELECT r.id,e.tenant_id,'transaction_category_edits.before',e.id,e.before_category,e.before_subcategory,
       public.taxonomy_v2_pair_category(e.before_category,e.before_subcategory),public.taxonomy_v2_subcategory(e.before_category,e.before_subcategory)
FROM public.transaction_category_edits e JOIN public.taxonomy_migration_runs r ON r.tenant_id=e.tenant_id AND r.version='v2'
WHERE (e.before_category,e.before_subcategory) IS DISTINCT FROM
      (public.taxonomy_v2_pair_category(e.before_category,e.before_subcategory),public.taxonomy_v2_subcategory(e.before_category,e.before_subcategory));

INSERT INTO public.taxonomy_migration_events (migration_run_id,tenant_id,target_table,target_id,before_category,before_subcategory,after_category,after_subcategory)
SELECT r.id,e.tenant_id,'transaction_category_edits.after',e.id,e.after_category,e.after_subcategory,
       public.taxonomy_v2_pair_category(e.after_category,e.after_subcategory),public.taxonomy_v2_subcategory(e.after_category,e.after_subcategory)
FROM public.transaction_category_edits e JOIN public.taxonomy_migration_runs r ON r.tenant_id=e.tenant_id AND r.version='v2'
WHERE (e.after_category,e.after_subcategory) IS DISTINCT FROM
      (public.taxonomy_v2_pair_category(e.after_category,e.after_subcategory),public.taxonomy_v2_subcategory(e.after_category,e.after_subcategory));

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.budgets old
    JOIN public.budgets target ON target.user_id=old.user_id AND target.id<>old.id
      AND target.category=public.taxonomy_v2_category(old.category)
    WHERE old.category<>public.taxonomy_v2_category(old.category)
  ) THEN RAISE EXCEPTION 'taxonomy migration would collide with an existing target budget'; END IF;
END $$;

UPDATE public.transactions SET
  category=public.taxonomy_v2_pair_category(category,subcategory),
  subcategory=public.taxonomy_v2_subcategory(category,subcategory);
UPDATE public.merchant_rules SET
  category=public.taxonomy_v2_pair_category(category,subcategory),
  subcategory=public.taxonomy_v2_subcategory(category,subcategory);
UPDATE public.budgets SET category=public.taxonomy_v2_category(category);
UPDATE public.transaction_category_edits SET
  before_category=public.taxonomy_v2_pair_category(before_category,before_subcategory),
  before_subcategory=public.taxonomy_v2_subcategory(before_category,before_subcategory),
  after_category=public.taxonomy_v2_pair_category(after_category,after_subcategory),
  after_subcategory=public.taxonomy_v2_subcategory(after_category,after_subcategory);

ALTER TABLE public.transactions ADD COLUMN category_id text REFERENCES public.taxonomy_categories(id),
  ADD COLUMN subcategory_id text REFERENCES public.taxonomy_subcategories(id);
ALTER TABLE public.merchant_rules ADD COLUMN category_id text REFERENCES public.taxonomy_categories(id),
  ADD COLUMN subcategory_id text REFERENCES public.taxonomy_subcategories(id);
ALTER TABLE public.budgets ADD COLUMN category_id text REFERENCES public.taxonomy_categories(id);

UPDATE public.transactions t SET
  category_id=(SELECT c.id FROM public.taxonomy_categories c WHERE c.display_name=t.category),
  subcategory_id=(SELECT s.id FROM public.taxonomy_subcategories s JOIN public.taxonomy_categories c ON c.id=s.category_id WHERE c.display_name=t.category AND s.display_name=t.subcategory);
UPDATE public.merchant_rules m SET
  category_id=(SELECT c.id FROM public.taxonomy_categories c WHERE c.display_name=m.category),
  subcategory_id=(SELECT s.id FROM public.taxonomy_subcategories s JOIN public.taxonomy_categories c ON c.id=s.category_id WHERE c.display_name=m.category AND s.display_name=m.subcategory);
UPDATE public.budgets b SET category_id=c.id FROM public.taxonomy_categories c WHERE c.display_name=b.category;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.transactions WHERE category_id IS NULL OR (subcategory IS NOT NULL AND subcategory_id IS NULL)) THEN
    RAISE EXCEPTION 'unmapped transaction taxonomy value'; END IF;
  IF EXISTS (SELECT 1 FROM public.merchant_rules WHERE category_id IS NULL OR (subcategory IS NOT NULL AND subcategory_id IS NULL)) THEN
    RAISE EXCEPTION 'unmapped merchant-rule taxonomy value'; END IF;
  IF EXISTS (SELECT 1 FROM public.budgets WHERE category_id IS NULL) THEN RAISE EXCEPTION 'unmapped budget taxonomy value'; END IF;
END $$;

CREATE FUNCTION public.sync_taxonomy_ids()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_category_id text; v_subcategory_id text;
BEGIN
  IF current_setting('halcyon.taxonomy_revert',true)='on' THEN
    NEW.category_id:=NULL;
    IF TG_TABLE_NAME<>'budgets' THEN NEW.subcategory_id:=NULL; END IF;
    RETURN NEW;
  END IF;
  SELECT id INTO v_category_id FROM public.taxonomy_categories WHERE display_name=NEW.category AND active;
  IF v_category_id IS NULL THEN RAISE EXCEPTION 'unknown taxonomy category: %',NEW.category; END IF;
  IF TG_TABLE_NAME<>'budgets' AND NEW.subcategory IS NOT NULL THEN
    SELECT id INTO v_subcategory_id FROM public.taxonomy_subcategories
     WHERE category_id=v_category_id AND display_name=NEW.subcategory AND active;
    IF v_subcategory_id IS NULL THEN RAISE EXCEPTION 'subcategory % does not belong to %',NEW.subcategory,NEW.category; END IF;
  END IF;
  NEW.category_id:=v_category_id;
  IF TG_TABLE_NAME<>'budgets' THEN NEW.subcategory_id:=v_subcategory_id; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER transactions_sync_taxonomy BEFORE INSERT OR UPDATE OF category,subcategory ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_taxonomy_ids();
CREATE TRIGGER merchant_rules_sync_taxonomy BEFORE INSERT OR UPDATE OF category,subcategory ON public.merchant_rules
  FOR EACH ROW EXECUTE FUNCTION public.sync_taxonomy_ids();
CREATE TRIGGER budgets_sync_taxonomy BEFORE INSERT OR UPDATE OF category ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.sync_taxonomy_ids();

UPDATE public.taxonomy_migration_runs r SET
  cents_after=x.cents,
  after_distribution=x.distribution
FROM (
  SELECT tenant_id,coalesce(sum(amount),0) cents,jsonb_object_agg(category,rows ORDER BY category) distribution
  FROM (SELECT tenant_id,category,count(*) rows,sum(amount) amount FROM public.transactions GROUP BY tenant_id,category) q
  GROUP BY tenant_id
) x WHERE x.tenant_id=r.tenant_id AND r.version='v2';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.taxonomy_migration_runs WHERE version='v2' AND cents_before<>cents_after) THEN
    RAISE EXCEPTION 'taxonomy migration changed transaction cents'; END IF;
END $$;

CREATE FUNCTION public.revert_taxonomy_v2(p_tenant_id uuid,p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_run public.taxonomy_migration_runs%ROWTYPE; v_count integer;
BEGIN
  SELECT * INTO v_run FROM public.taxonomy_migration_runs
   WHERE id=p_run_id AND tenant_id=p_tenant_id AND version='v2' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'taxonomy migration run not found'; END IF;
  IF v_run.status='reverted' THEN RETURN jsonb_build_object('reverted',true,'already_reverted',true); END IF;
  PERFORM set_config('halcyon.taxonomy_revert','on',true);
  UPDATE public.transactions t SET category=e.before_category,subcategory=e.before_subcategory
    FROM public.taxonomy_migration_events e WHERE e.migration_run_id=p_run_id AND e.target_table='transactions' AND t.id=e.target_id AND t.tenant_id=p_tenant_id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  UPDATE public.merchant_rules t SET category=e.before_category,subcategory=e.before_subcategory
    FROM public.taxonomy_migration_events e WHERE e.migration_run_id=p_run_id AND e.target_table='merchant_rules' AND t.id=e.target_id AND t.tenant_id=p_tenant_id;
  UPDATE public.budgets t SET category=e.before_category
    FROM public.taxonomy_migration_events e WHERE e.migration_run_id=p_run_id AND e.target_table='budgets' AND t.id=e.target_id AND t.tenant_id=p_tenant_id;
  UPDATE public.transaction_category_edits t SET before_category=e.before_category,before_subcategory=e.before_subcategory
    FROM public.taxonomy_migration_events e WHERE e.migration_run_id=p_run_id AND e.target_table='transaction_category_edits.before' AND t.id=e.target_id AND t.tenant_id=p_tenant_id;
  UPDATE public.transaction_category_edits t SET after_category=e.before_category,after_subcategory=e.before_subcategory
    FROM public.taxonomy_migration_events e WHERE e.migration_run_id=p_run_id AND e.target_table='transaction_category_edits.after' AND t.id=e.target_id AND t.tenant_id=p_tenant_id;
  UPDATE public.taxonomy_migration_runs SET status='reverted',reverted_at=now() WHERE id=p_run_id;
  RETURN jsonb_build_object('reverted',true,'transactions_restored',v_count);
END $$;

REVOKE ALL ON FUNCTION public.taxonomy_v2_category(text),public.taxonomy_v2_subcategory(text,text),
  public.taxonomy_v2_pair_category(text,text),public.revert_taxonomy_v2(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.revert_taxonomy_v2(uuid,uuid) TO service_role;

DROP VIEW public.transactions_analytic;
CREATE VIEW public.transactions_analytic WITH (security_invoker=true) AS
SELECT t.*,
  CASE WHEN d.verdict='rejected' THEN false WHEN d.verdict IN ('confirmed','external') THEN true
    ELSE COALESCE(t.category='Transfer' OR l.state IN ('auto','suggested','confirmed','external') OR il.state IN ('auto','suggested','confirmed'),false) END is_transfer,
  COALESCE(il.state,l.state,d.verdict,CASE WHEN t.transfer_candidate THEN 'unmatched' ELSE 'none' END) transfer_state,
  l.id transfer_link_id,il.id investment_cash_link_id
FROM public.transactions t
LEFT JOIN LATERAL (SELECT id,state FROM public.transfer_links WHERE from_txn_id=t.id UNION ALL SELECT id,state FROM public.transfer_links WHERE to_txn_id=t.id LIMIT 1) l ON true
LEFT JOIN public.investment_cash_links il ON il.transaction_id=t.id
LEFT JOIN LATERAL (
  SELECT verdict FROM (
    SELECT dd.verdict,dd.decided_at FROM public.transfer_decisions dd WHERE dd.tenant_id=t.tenant_id AND dd.from_account_id=t.account_id AND dd.from_hash=t.dedupe_hash AND dd.from_occurrence=t.occurrence
    UNION ALL SELECT dd.verdict,dd.decided_at FROM public.transfer_decisions dd WHERE dd.tenant_id=t.tenant_id AND dd.to_account_id=t.account_id AND dd.to_hash=t.dedupe_hash AND dd.to_occurrence=t.occurrence
    UNION ALL SELECT id.verdict,id.decided_at FROM public.investment_cash_decisions id WHERE id.tenant_id=t.tenant_id AND id.transaction_account_id=t.account_id AND id.transaction_hash=t.dedupe_hash AND id.transaction_occurrence=t.occurrence
  ) decisions ORDER BY decided_at DESC LIMIT 1
) d ON true;
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
  SELECT string_agg(routine_name,', ') INTO bad_functions FROM information_schema.role_routine_grants WHERE specific_schema='public' AND routine_name IN ('revert_taxonomy_v2','taxonomy_v2_category','taxonomy_v2_subcategory','taxonomy_v2_pair_category') AND grantee IN ('PUBLIC','anon','authenticated');
  IF bad_functions IS NOT NULL THEN RAISE EXCEPTION 'unsafe taxonomy function grants: %',bad_functions;END IF;
END $$;
