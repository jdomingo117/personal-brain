-- Atomic CSV import for manual and provider-connected accounts.
--
-- The old browser workflow committed transactions, then called upsert-account
-- separately. A failure between those calls left a partially-successful import,
-- and its reconciliation anchor only considered the current file rather than
-- the complete ledger. This function makes the account the transaction lock,
-- inserts only rows that survive dedupe, replaces the one manual reconciliation
-- anchor from the complete surviving ledger, and updates accounts.balance in a
-- single PostgreSQL transaction.

CREATE FUNCTION public.import_transactions_atomic(
  p_tenant_id      uuid,
  p_account_id     uuid,
  p_rows           jsonb,
  p_upload_batch_id uuid DEFAULT NULL,
  p_target_balance integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_submitted       integer;
  v_inserted        integer := 0;
  v_needs_review    integer := 0;
  v_cutover_date    date;
  v_ledger_total    bigint;
  v_anchor_amount   bigint;
  v_anchor_date     date;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  v_submitted := jsonb_array_length(p_rows);
  IF v_submitted = 0 OR v_submitted > 5000 THEN
    RAISE EXCEPTION 'p_rows must contain between 1 and 5000 rows';
  END IF;

  -- Serialises imports and balance-affecting account updates. RLS makes an
  -- inaccessible/mismatched account indistinguishable from a missing one.
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
      auth.uid(), p_tenant_id, p_account_id, x.date,
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
    -- Reconciliation is account state, not one more offset per statement.
    -- Remove every legacy/current anchor before measuring the real ledger,
    -- then create at most one replacement before its earliest transaction.
    DELETE FROM public.transactions
     WHERE tenant_id = p_tenant_id
       AND account_id = p_account_id
       AND category = 'Transfer'
       AND subcategory = 'Reconciliation';

    SELECT COALESCE(sum(amount), 0), min(date) - 1
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
        auth.uid(), p_tenant_id, p_account_id, v_anchor_date,
        'Opening Balance Offset (Reconciliation)', 'Opening Balance',
        'Transfer', 'Reconciliation', v_anchor_amount::integer,
        p_upload_batch_id, 'seed', false, NULL, 0, false
      );
    END IF;

    UPDATE public.accounts
       SET balance = p_target_balance
     WHERE id = p_account_id AND tenant_id = p_tenant_id;
  END IF;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped', v_submitted - v_inserted,
    'needsReview', v_needs_review,
    'reconciliationAmount', CASE WHEN v_anchor_amount <> 0 THEN v_anchor_amount ELSE NULL END,
    'reconciliationDate', CASE WHEN v_anchor_amount <> 0 THEN v_anchor_date ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_transactions_atomic(uuid, uuid, jsonb, uuid, integer)
  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.import_transactions_atomic(uuid, uuid, jsonb, uuid, integer)
  FROM PUBLIC, anon;

DO $$
DECLARE bad_grants text;
BEGIN
  SELECT string_agg(grantee, ', ')
    INTO bad_grants
    FROM information_schema.role_routine_grants
   WHERE routine_name = 'import_transactions_atomic' AND grantee = 'anon';
  IF bad_grants IS NOT NULL THEN
    RAISE EXCEPTION 'anon can execute import_transactions_atomic: %', bad_grants;
  END IF;
END $$;

