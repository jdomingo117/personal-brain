-- Phase 1: auditable, transaction-scoped categorisation edits with guarded undo.
--
-- The browser never calls these RPCs directly. The authenticated Edge Function
-- proves tenant visibility and validates the taxonomy, then invokes the
-- service-role-only functions below. Keeping the row update and history insert
-- in one database transaction prevents an audit event without its matching
-- financial-data change (or vice versa).

ALTER TABLE public.transactions
  ADD COLUMN category_confidence real
    CHECK (category_confidence IS NULL OR category_confidence BETWEEN 0 AND 1);

CREATE TABLE public.transaction_category_edits (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  transaction_id        uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  actor_id               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  before_category        text NOT NULL,
  before_subcategory     text,
  before_source          text CHECK (before_source IS NULL OR before_source IN ('user', 'bank', 'ai', 'seed')),
  before_confidence      real CHECK (before_confidence IS NULL OR before_confidence BETWEEN 0 AND 1),
  before_needs_review    boolean NOT NULL,
  after_category         text NOT NULL,
  after_subcategory      text,
  after_source           text NOT NULL CHECK (after_source IN ('user', 'bank', 'ai', 'seed')),
  after_confidence       real CHECK (after_confidence IS NULL OR after_confidence BETWEEN 0 AND 1),
  after_needs_review     boolean NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  undone_at              timestamptz,
  undone_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_transaction_category_edits_transaction
  ON public.transaction_category_edits (tenant_id, transaction_id, created_at DESC);

ALTER TABLE public.transaction_category_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read category edit history"
  ON public.transaction_category_edits
  FOR SELECT USING (public.is_tenant_member(tenant_id));

GRANT SELECT ON public.transaction_category_edits TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.transaction_category_edits TO service_role;
REVOKE ALL ON public.transaction_category_edits FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.transaction_category_edits FROM authenticated;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.transaction_category_edits FROM service_role;

CREATE OR REPLACE FUNCTION public.edit_transaction_category(
  p_tenant_id uuid,
  p_transaction_id uuid,
  p_actor_id uuid,
  p_category text,
  p_subcategory text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_before public.transactions%ROWTYPE;
  v_edit_id uuid;
BEGIN
  SELECT * INTO v_before
    FROM public.transactions
   WHERE id = p_transaction_id
     AND tenant_id = p_tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction not found';
  END IF;

  INSERT INTO public.transaction_category_edits (
    tenant_id, transaction_id, actor_id,
    before_category, before_subcategory, before_source,
    before_confidence, before_needs_review,
    after_category, after_subcategory, after_source,
    after_confidence, after_needs_review
  ) VALUES (
    p_tenant_id, p_transaction_id, p_actor_id,
    v_before.category, v_before.subcategory, v_before.category_source,
    v_before.category_confidence, v_before.needs_review,
    p_category, nullif(p_subcategory, ''), 'user', 1, false
  )
  RETURNING id INTO v_edit_id;

  UPDATE public.transactions
     SET category = p_category,
         subcategory = nullif(p_subcategory, ''),
         category_source = 'user',
         category_confidence = 1,
         needs_review = false
   WHERE id = p_transaction_id
     AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'edit_id', v_edit_id,
    'transaction_id', p_transaction_id,
    'category', p_category,
    'subcategory', nullif(p_subcategory, ''),
    'category_source', 'user',
    'category_confidence', 1,
    'needs_review', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_transaction_category_edit(
  p_tenant_id uuid,
  p_edit_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_edit public.transaction_category_edits%ROWTYPE;
  v_current public.transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_edit
    FROM public.transaction_category_edits
   WHERE id = p_edit_id
     AND tenant_id = p_tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'category edit not found';
  END IF;
  IF v_edit.undone_at IS NOT NULL THEN
    RAISE EXCEPTION 'category edit already undone';
  END IF;

  SELECT * INTO v_current
    FROM public.transactions
   WHERE id = v_edit.transaction_id
     AND tenant_id = p_tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction not found';
  END IF;

  -- A stale undo must never erase a correction made after this edit.
  IF v_current.category IS DISTINCT FROM v_edit.after_category
     OR v_current.subcategory IS DISTINCT FROM v_edit.after_subcategory
     OR v_current.category_source IS DISTINCT FROM v_edit.after_source
     OR v_current.category_confidence IS DISTINCT FROM v_edit.after_confidence
     OR v_current.needs_review IS DISTINCT FROM v_edit.after_needs_review THEN
    RAISE EXCEPTION 'transaction changed after this edit';
  END IF;

  UPDATE public.transactions
     SET category = v_edit.before_category,
         subcategory = v_edit.before_subcategory,
         category_source = v_edit.before_source,
         category_confidence = v_edit.before_confidence,
         needs_review = v_edit.before_needs_review
   WHERE id = v_edit.transaction_id
     AND tenant_id = p_tenant_id;

  UPDATE public.transaction_category_edits
     SET undone_at = now(), undone_by = p_actor_id
   WHERE id = p_edit_id;

  RETURN jsonb_build_object(
    'edit_id', p_edit_id,
    'transaction_id', v_edit.transaction_id,
    'category', v_edit.before_category,
    'subcategory', v_edit.before_subcategory,
    'category_source', v_edit.before_source,
    'category_confidence', v_edit.before_confidence,
    'needs_review', v_edit.before_needs_review,
    'undone', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.edit_transaction_category(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.undo_transaction_category_edit(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_transaction_category(uuid, uuid, uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.undo_transaction_category_edit(uuid, uuid, uuid)
  TO service_role;

DO $$
DECLARE bad_tables text; bad_views text; anon_grants text; bad_functions text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO bad_tables
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF bad_tables IS NOT NULL THEN RAISE EXCEPTION 'tables without RLS: %', bad_tables; END IF;

  SELECT string_agg(c.relname, ', ') INTO bad_views
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v'
     AND coalesce(c.reloptions, ARRAY[]::text[]) @> ARRAY['security_invoker=true'] = false;
  IF bad_views IS NOT NULL THEN RAISE EXCEPTION 'views without security_invoker: %', bad_views; END IF;

  SELECT string_agg(format('%s:%s/%s', grantee, table_name, privilege_type), ', ')
    INTO anon_grants FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee = 'anon';
  IF anon_grants IS NOT NULL THEN RAISE EXCEPTION 'anon grants: %', anon_grants; END IF;

  SELECT string_agg(routine_name, ', ') INTO bad_functions
    FROM information_schema.role_routine_grants
   WHERE specific_schema = 'public'
     AND routine_name IN ('edit_transaction_category', 'undo_transaction_category_edit')
     AND grantee IN ('PUBLIC', 'anon', 'authenticated');
  IF bad_functions IS NOT NULL THEN RAISE EXCEPTION 'unsafe category edit function grants: %', bad_functions; END IF;
END $$;
