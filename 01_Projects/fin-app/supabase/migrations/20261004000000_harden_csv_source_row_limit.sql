-- The user-facing CSV limit is a source-statement limit, not merely the
-- count of rows that survived staging. Without this check a 5,001+ row CSV
-- with blocked or excluded rows could bypass the advertised browser limit.
--
-- The optional reconciliation row remains server-generated account state. It
-- is intentionally not a source row and does not reduce the 5,000-row input
-- ceiling.

CREATE OR REPLACE FUNCTION public.import_transactions_atomic(
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
  IF v_source_rows > 5000 THEN
    RAISE EXCEPTION 'source statement must contain at most 5000 rows';
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

REVOKE ALL ON FUNCTION public.import_transactions_atomic(uuid, uuid, jsonb, uuid, integer, text, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_transactions_atomic(uuid, uuid, jsonb, uuid, integer, text, integer, integer)
  TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.import_transactions_atomic(uuid,uuid,jsonb,uuid,integer,text,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'atomic import RPC is available to an untrusted role';
  END IF;
END $$;
