-- Durable CSV upload history and atomic undo.
--
-- Upload history used to be inferred from whatever transactions happened to
-- be present in DataContext's bounded ledger response. Undo then fetched the
-- remaining ledger through PostgREST and reduced it in JavaScript, so a
-- response cap could silently write the wrong account balance. Batch metadata
-- is now first-class, and both import and undo are single database transactions.

CREATE TABLE public.upload_batches (
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id            uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  file_name              text NOT NULL,
  source_row_count       integer NOT NULL CHECK (source_row_count >= 0),
  inserted_count         integer NOT NULL CHECK (inserted_count >= 0),
  skipped_count          integer NOT NULL CHECK (skipped_count >= 0),
  blocked_count          integer NOT NULL DEFAULT 0 CHECK (blocked_count >= 0),
  needs_review_count     integer NOT NULL DEFAULT 0 CHECK (needs_review_count >= 0),
  target_balance         integer,
  reconciliation_amount integer,
  reconciliation_date   date,
  created_at             timestamptz NOT NULL DEFAULT now(),
  undone_at              timestamptz,
  removed_count          integer NOT NULL DEFAULT 0 CHECK (removed_count >= 0),
  CHECK (char_length(file_name) BETWEEN 1 AND 255),
  CHECK (inserted_count + skipped_count <= source_row_count),
  CHECK (blocked_count <= source_row_count),
  CHECK ((reconciliation_amount IS NULL) = (reconciliation_date IS NULL))
);

CREATE INDEX idx_upload_batches_tenant_account_created
  ON public.upload_batches (tenant_id, account_id, created_at DESC);

ALTER TABLE public.upload_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read upload batches" ON public.upload_batches
  FOR SELECT USING (public.is_tenant_member(tenant_id));

-- Historical transaction batches predate metadata. Preserve their durable
-- identity and useful counts without pretending the original filename or
-- pre-staging counts are knowable.
INSERT INTO public.upload_batches (
  id, tenant_id, user_id, account_id, file_name,
  source_row_count, inserted_count, skipped_count, blocked_count,
  needs_review_count, reconciliation_amount, reconciliation_date, created_at
)
SELECT
  t.upload_batch_id,
  (array_agg(t.tenant_id ORDER BY t.created_at))[1],
  (array_agg(t.user_id ORDER BY t.created_at))[1],
  (array_agg(t.account_id ORDER BY t.created_at))[1],
  'Legacy CSV upload',
  count(*) FILTER (
    WHERE NOT (t.category = 'Transfer' AND t.subcategory = 'Reconciliation')
  )::integer,
  count(*) FILTER (
    WHERE NOT (t.category = 'Transfer' AND t.subcategory = 'Reconciliation')
  )::integer,
  0,
  0,
  count(*) FILTER (
    WHERE t.needs_review
      AND NOT (t.category = 'Transfer' AND t.subcategory = 'Reconciliation')
  )::integer,
  max(t.amount) FILTER (
    WHERE t.category = 'Transfer' AND t.subcategory = 'Reconciliation'
  ),
  max(t.date) FILTER (
    WHERE t.category = 'Transfer' AND t.subcategory = 'Reconciliation'
  ),
  min(t.created_at)
FROM public.transactions t
WHERE t.upload_batch_id IS NOT NULL
GROUP BY t.upload_batch_id;

-- Metadata is immutable from PostgREST. The two RPCs below are the only write
-- paths, and explicitly re-check member access before using definer rights.
GRANT SELECT ON public.upload_batches TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.upload_batches FROM anon, authenticated;

CREATE FUNCTION public.import_transactions_atomic(
  p_tenant_id       uuid,
  p_account_id      uuid,
  p_rows            jsonb,
  p_upload_batch_id uuid DEFAULT NULL,
  p_target_balance  integer DEFAULT NULL,
  p_file_name       text DEFAULT NULL,
  p_source_row_count integer DEFAULT NULL,
  p_blocked_count   integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_submitted       integer;
  v_source_rows     integer;
  v_inserted        integer := 0;
  v_needs_review    integer := 0;
  v_cutover_date    date;
  v_ledger_total    bigint;
  v_anchor_amount   bigint;
  v_anchor_date     date;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR NOT public.has_tenant_role(p_tenant_id, 'member') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  v_submitted := jsonb_array_length(p_rows);
  v_source_rows := COALESCE(p_source_row_count, v_submitted + p_blocked_count);
  IF v_submitted = 0 OR v_submitted > 5000 THEN
    RAISE EXCEPTION 'p_rows must contain between 1 and 5000 rows';
  END IF;
  IF p_blocked_count < 0 OR v_source_rows < v_submitted
     OR p_blocked_count > v_source_rows THEN
    RAISE EXCEPTION 'invalid source row counts';
  END IF;
  IF p_file_name IS NOT NULL AND char_length(trim(p_file_name)) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'invalid file name';
  END IF;

  PERFORM 1
    FROM public.accounts
   WHERE id = p_account_id AND tenant_id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account not found'; END IF;

  SELECT cutover_date
    INTO v_cutover_date
    FROM public.account_connections
   WHERE account_id = p_account_id AND tenant_id = p_tenant_id;

  IF v_cutover_date IS NOT NULL THEN
    IF p_target_balance IS NOT NULL THEN
      RAISE EXCEPTION 'connected account balance is provider-owned';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM jsonb_to_recordset(p_rows) AS x(date date, category text, subcategory text)
       WHERE x.date >= v_cutover_date
          OR (x.category = 'Transfer' AND x.subcategory = 'Reconciliation')
    ) THEN
      RAISE EXCEPTION 'CSV rows overlap provider-owned history';
    END IF;
  END IF;

  WITH inserted AS (
    INSERT INTO public.transactions (
      user_id, tenant_id, account_id, date,
      original_description, merchant, category, subcategory, amount,
      original_amount, original_currency, upload_batch_id,
      category_source, needs_review, dedupe_hash, occurrence,
      transfer_candidate
    )
    SELECT
      (SELECT auth.uid()), p_tenant_id, p_account_id, x.date,
      x.original_description, x.merchant, x.category, x.subcategory, x.amount,
      x.original_amount, x.original_currency, p_upload_batch_id,
      x.category_source, COALESCE(x.needs_review, false),
      decode(x.dedupe_hash_hex, 'hex'), x.occurrence,
      COALESCE(x.transfer_candidate, false)
    FROM jsonb_to_recordset(p_rows) AS x(
      date date,
      original_description text,
      merchant text,
      category text,
      subcategory text,
      amount integer,
      original_amount integer,
      original_currency text,
      category_source text,
      needs_review boolean,
      dedupe_hash_hex text,
      occurrence integer,
      transfer_candidate boolean
    )
    ON CONFLICT (account_id, dedupe_hash, occurrence) DO NOTHING
    RETURNING needs_review
  )
  SELECT count(*)::integer,
         count(*) FILTER (WHERE needs_review)::integer
    INTO v_inserted, v_needs_review
    FROM inserted;

  IF p_target_balance IS NOT NULL THEN
    DELETE FROM public.transactions
     WHERE tenant_id = p_tenant_id
       AND account_id = p_account_id
       AND category = 'Transfer'
       AND subcategory = 'Reconciliation';

    SELECT COALESCE(sum(amount), 0), COALESCE(min(date) - 1, current_date)
      INTO v_ledger_total, v_anchor_date
      FROM public.transactions
     WHERE tenant_id = p_tenant_id AND account_id = p_account_id;

    v_anchor_amount := p_target_balance::bigint - v_ledger_total;
    IF v_anchor_amount < -2147483648 OR v_anchor_amount > 2147483647 THEN
      RAISE EXCEPTION 'reconciliation amount exceeds integer-cent range';
    END IF;

    IF v_anchor_amount <> 0 THEN
      INSERT INTO public.transactions (
        user_id, tenant_id, account_id, date,
        original_description, merchant, category, subcategory, amount,
        upload_batch_id, category_source, needs_review,
        dedupe_hash, occurrence, transfer_candidate
      ) VALUES (
        (SELECT auth.uid()), p_tenant_id, p_account_id, v_anchor_date,
        'Opening Balance Offset (Reconciliation)', 'Opening Balance',
        'Transfer', 'Reconciliation', v_anchor_amount::integer,
        p_upload_batch_id, 'seed', false, NULL, 0, false
      );
    END IF;

    UPDATE public.accounts
       SET balance = p_target_balance
     WHERE id = p_account_id AND tenant_id = p_tenant_id;
  END IF;

  IF p_upload_batch_id IS NOT NULL THEN
    INSERT INTO public.upload_batches (
      id, tenant_id, user_id, account_id, file_name,
      source_row_count, inserted_count, skipped_count, blocked_count,
      needs_review_count, target_balance,
      reconciliation_amount, reconciliation_date
    ) VALUES (
      p_upload_batch_id, p_tenant_id, (SELECT auth.uid()), p_account_id,
      COALESCE(trim(p_file_name), 'CSV upload'), v_source_rows, v_inserted,
      v_submitted - v_inserted, p_blocked_count, v_needs_review,
      p_target_balance,
      CASE WHEN v_anchor_amount <> 0 THEN v_anchor_amount::integer ELSE NULL END,
      CASE WHEN v_anchor_amount <> 0 THEN v_anchor_date ELSE NULL END
    );
  END IF;

  RETURN jsonb_build_object(
    'uploadBatchId', p_upload_batch_id,
    'inserted', v_inserted,
    'skipped', v_submitted - v_inserted,
    'needsReview', v_needs_review,
    'reconciliationAmount', CASE WHEN v_anchor_amount <> 0 THEN v_anchor_amount ELSE NULL END,
    'reconciliationDate', CASE WHEN v_anchor_amount <> 0 THEN v_anchor_date ELSE NULL END
  );
END;
$$;

CREATE FUNCTION public.delete_upload_batch_atomic(
  p_tenant_id uuid,
  p_upload_batch_id uuid,
  p_account_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch             public.upload_batches%ROWTYPE;
  v_removed           integer := 0;
  v_new_balance       bigint;
  v_provider_owned    boolean;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR NOT public.has_tenant_role(p_tenant_id, 'member') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Account-first matches import's lock order, preventing an import/undo
  -- deadlock while guaranteeing no balance-affecting write can interleave.
  PERFORM 1
    FROM public.accounts
   WHERE id = p_account_id AND tenant_id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account not found'; END IF;

  SELECT * INTO v_batch
    FROM public.upload_batches
   WHERE id = p_upload_batch_id
     AND tenant_id = p_tenant_id
     AND account_id = p_account_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'upload batch not found'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.account_connections
     WHERE tenant_id = p_tenant_id AND account_id = p_account_id
  ) INTO v_provider_owned;

  IF v_batch.undone_at IS NOT NULL THEN
    SELECT balance::bigint INTO v_new_balance
      FROM public.accounts
     WHERE id = p_account_id AND tenant_id = p_tenant_id;
    RETURN jsonb_build_object(
      'success', true,
      'alreadyUndone', true,
      'removed', v_batch.removed_count,
      'newBalance', CASE WHEN v_provider_owned THEN NULL ELSE v_new_balance END,
      'balanceOwnedByProvider', v_provider_owned
    );
  END IF;

  WITH deleted AS (
    DELETE FROM public.transactions
     WHERE tenant_id = p_tenant_id
       AND account_id = p_account_id
       AND upload_batch_id = p_upload_batch_id
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_removed FROM deleted;

  IF NOT v_provider_owned THEN
    SELECT COALESCE(sum(amount), 0)
      INTO v_new_balance
      FROM public.transactions
     WHERE tenant_id = p_tenant_id AND account_id = p_account_id;

    IF v_new_balance < -2147483648 OR v_new_balance > 2147483647 THEN
      RAISE EXCEPTION 'remaining ledger exceeds integer-cent range';
    END IF;

    UPDATE public.accounts
       SET balance = v_new_balance::integer
     WHERE id = p_account_id AND tenant_id = p_tenant_id;
  END IF;

  UPDATE public.upload_batches
     SET undone_at = now(), removed_count = v_removed
   WHERE id = p_upload_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'alreadyUndone', false,
    'removed', v_removed,
    'newBalance', CASE WHEN v_provider_owned THEN NULL ELSE v_new_balance END,
    'balanceOwnedByProvider', v_provider_owned
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_transactions_atomic(
  uuid, uuid, jsonb, uuid, integer, text, integer, integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_upload_batch_atomic(uuid, uuid, uuid)
  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.import_transactions_atomic(
  uuid, uuid, jsonb, uuid, integer, text, integer, integer
) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_upload_batch_atomic(uuid, uuid, uuid)
  FROM PUBLIC, anon;

DO $$
DECLARE bad_grants text;
BEGIN
  SELECT string_agg(table_name || ':' || privilege_type, ', ')
    INTO bad_grants
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name = 'upload_batches'
     AND grantee IN ('anon', 'authenticated')
     AND privilege_type <> 'SELECT';
  IF bad_grants IS NOT NULL THEN
    RAISE EXCEPTION 'unsafe upload_batches grants: %', bad_grants;
  END IF;
END $$;
