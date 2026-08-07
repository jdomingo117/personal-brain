-- ═══════════════════════════════════════════════════════════════════════
-- Deciding on an UNMATCHED single leg.
--
-- decide_transfer (20260806000000) only accepts a p_link_id — but a leg that
-- looks like a transfer with no counterpart anywhere in the ledger (the
-- other account isn't connected yet, or it genuinely isn't a transfer) never
-- gets a transfer_links row: matchTransfers() only ever emits pairs. There
-- was no way to record a verdict on it at all.
--
-- Per the design: an unmatched candidate counts as ordinary spending by
-- default (overstating spending is honest; silently zeroing out a real
-- purchase because it merely LOOKS like a transfer is not), and the user is
-- asked. This RPC is the "asked" half — it writes straight to
-- transfer_decisions with the to_* side left NULL, exactly the single-leg
-- shape idx_transfer_decisions_pair (NULLS NOT DISTINCT) already supports.
-- No transfer_links row is needed: transactions_analytic already consults
-- transfer_decisions directly (20260806030000), so the verdict take effect
-- immediately.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.decide_transfer_leg(
  p_tenant_id uuid,
  p_txn_id    uuid,
  p_verdict   text,
  p_note      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_txn public.transactions%ROWTYPE;
  v_decision_id uuid;
BEGIN
  -- 'confirmed' means "this pairing is correct" — meaningless without a
  -- counterpart leg. A lone leg can only be affirmed as someone else's
  -- (external) or denied outright (rejected).
  IF p_verdict NOT IN ('rejected', 'external') THEN
    RAISE EXCEPTION 'invalid verdict for a single leg: %', p_verdict;
  END IF;

  SELECT * INTO v_txn FROM public.transactions
   WHERE id = p_txn_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction not found';
  END IF;

  -- Refuse to record a verdict on a leg that already has a link (auto,
  -- suggested, or otherwise) — that path goes through decide_transfer, which
  -- knows which leg is "from" and which is "to". Applying this RPC on top
  -- would create a second, contradictory decision row for the same leg.
  IF EXISTS (
    SELECT 1 FROM public.transfer_links
     WHERE tenant_id = p_tenant_id AND (from_txn_id = p_txn_id OR to_txn_id = p_txn_id)
  ) THEN
    RAISE EXCEPTION 'this transaction is already linked — use decide_transfer instead';
  END IF;

  INSERT INTO public.transfer_decisions (
    tenant_id, from_account_id, from_hash, from_occurrence,
    to_account_id, to_hash, to_occurrence, verdict, decided_by, note
  )
  VALUES (
    p_tenant_id, v_txn.account_id, v_txn.dedupe_hash, v_txn.occurrence,
    NULL, NULL, NULL, p_verdict, (SELECT auth.uid()), p_note
  )
  ON CONFLICT (tenant_id, from_account_id, from_hash, from_occurrence,
               to_account_id, to_hash, to_occurrence)
  DO UPDATE SET verdict = excluded.verdict, decided_by = excluded.decided_by,
                decided_at = now(), note = excluded.note
  RETURNING id INTO v_decision_id;

  RETURN v_decision_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decide_transfer_leg(uuid, uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.decide_transfer_leg(uuid, uuid, text, text) FROM anon;
