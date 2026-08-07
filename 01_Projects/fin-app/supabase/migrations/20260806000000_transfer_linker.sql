-- ═══════════════════════════════════════════════════════════════════════
-- Internal transfer detection ("Same-Day Osko Linker", SRD §6.E).
--
-- Transfers between a user's own accounts (Liquid/Savings/Credit Card in
-- Phase 1) are zero-sum balance movements, but today every analytics view
-- filters on amount sign only — never category — so both legs of a real
-- transfer are double-counted as income AND spending. This migration adds
-- the schema; the matching logic lives in app/src/lib/transfers/ and is
-- deployed separately as the link-transfers edge function.
--
-- Three new tables, deliberately split by lifecycle:
--   account_identifiers — masks/numbers/names that resolve a description
--                          token ("Xx3965") to one of the user's accounts.
--                          Missing from `accounts` today; this is what
--                          makes mask-based matching possible at all.
--   transfer_links       — the algorithm's current best guess. Disposable
--                          and fully rebuildable from `transactions` on
--                          every rescan.
--   transfer_decisions   — the user's verdict. Durable, and keyed on
--                          CONTENT (account_id, dedupe_hash, occurrence),
--                          never on transactions.id — so a decision
--                          survives deleting and re-importing the batch
--                          it was made on (see idx_transactions_dedupe in
--                          20260804010000_ingestion_engine.sql).
-- ═══════════════════════════════════════════════════════════════════════

-- ── Account identifiers ─────────────────────────────────────────────────
--
-- A table, not columns on `accounts`: one account legitimately carries
-- several identifiers (its own mask, its full number, the institution name,
-- the alias a *different* bank prints for it). `source='inferred'` rows are
-- written by link-transfers when a pair is confirmed — the tokens found in
-- one leg's description become identifiers for the other leg's account, so
-- the second import matches far better than the first with no user input.

CREATE TABLE public.account_identifiers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('mask', 'account_number', 'institution', 'alias')),
  -- Normalised at write time: digits-only (leading zeros stripped) for
  -- mask/account_number; lowercase, collapsed-whitespace for institution/alias.
  value      text NOT NULL,
  source     text NOT NULL CHECK (source IN ('user', 'inferred')),
  confidence real NOT NULL DEFAULT 1.0,
  hit_count  int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Deliberately includes account_id: two institutions can issue the same
  -- last-4. A value that resolves to more than one account is intentionally
  -- ambiguous — the matcher's S_mask score treats that as zero, not a guess.
  UNIQUE (tenant_id, kind, value, account_id)
);

CREATE INDEX idx_account_identifiers_lookup
  ON public.account_identifiers (tenant_id, kind, value);

CREATE TRIGGER handle_updated_at_account_identifiers
  BEFORE UPDATE ON public.account_identifiers
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.account_identifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read account_identifiers" ON public.account_identifiers
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members write account_identifiers" ON public.account_identifiers
  FOR INSERT WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members update account_identifiers" ON public.account_identifiers
  FOR UPDATE USING (public.has_tenant_role(tenant_id, 'member'))
          WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members delete account_identifiers" ON public.account_identifiers
  FOR DELETE USING (public.has_tenant_role(tenant_id, 'member'));

-- ── Candidate flag on transactions ──────────────────────────────────────
--
-- One cheap boolean so the candidate fetch is index-backed. The rich tokens
-- (masks, embedded dates, lexicon hits) are recomputed in TS at match time
-- from original_description, never stored — storing them would force a
-- migration every time the lexicon improves. Because the flag is
-- recomputable, a lexicon improvement is a backfill, not data loss.
--
-- Written server-side in upsert-transactions from original_description, for
-- the same reason the dedupe hash is server-computed: never trust a
-- client-supplied classification.

ALTER TABLE public.transactions
  ADD COLUMN transfer_candidate boolean NOT NULL DEFAULT false;

CREATE INDEX idx_transactions_transfer_bucket
  ON public.transactions (tenant_id, abs(amount), date)
  WHERE transfer_candidate;

-- Deliberately generous: a false positive costs one extra candidate in a
-- match bucket; a false negative is a transfer that can never be found. The
-- TS matcher (hard gates + score) is what actually decides — this backfill
-- only decides what gets a chance to be considered.
UPDATE public.transactions
   SET transfer_candidate = true
 WHERE category = 'Transfer'
    OR original_description ~* '(internal transfer|funds transfer|linked account|osko|payid|bpay|npp|tfr|sct deposit|payment received|direct (credit|debit)|autopay|^\s*(to|from)\s)';

-- ── transfer_links: derived pairing, disposable ─────────────────────────

CREATE TABLE public.transfer_links (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- `from` is ALWAYS the negative leg, `to` the positive leg. Canonical by
  -- construction: (A,B) and (B,A) can never both exist, so no lexicographic
  -- tie-break is needed to decide which row owns the pair.
  from_txn_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  to_txn_id   uuid          REFERENCES public.transactions(id) ON DELETE CASCADE,

  state     text NOT NULL CHECK (state IN ('auto', 'suggested', 'confirmed', 'rejected', 'external')),
  score     real NOT NULL,
  reasons   jsonb NOT NULL DEFAULT '[]'::jsonb,  -- e.g. ["mask:3692", "embedded-date", "name:st george"]
  ambiguous boolean NOT NULL DEFAULT false,
  matcher_version int NOT NULL,

  -- Content identity copied off the legs at link-creation time, so
  -- decide_transfer can write a durable transfer_decisions row without a
  -- second read of `transactions`.
  from_account_id uuid NOT NULL,
  from_hash       bytea NOT NULL,
  from_occurrence int NOT NULL,
  to_account_id   uuid,
  to_hash         bytea,
  to_occurrence   int,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A transaction participates in AT MOST ONE link. Because `from` is always
-- the negative leg and `to` always the positive leg, a row's sign fixes its
-- possible role, so these two unique indexes are jointly sufficient. This is
-- the database-level backstop for the greedy assignment in the matcher:
-- without it, a matcher bug could link one leg into two pairs and quietly
-- deflate reported spending with nothing on screen to explain it.
CREATE UNIQUE INDEX idx_transfer_links_from_leg ON public.transfer_links (from_txn_id);
CREATE UNIQUE INDEX idx_transfer_links_to_leg   ON public.transfer_links (to_txn_id)
  WHERE to_txn_id IS NOT NULL;

CREATE INDEX idx_transfer_links_tenant_state ON public.transfer_links (tenant_id, state);

CREATE TRIGGER handle_updated_at_transfer_links
  BEFORE UPDATE ON public.transfer_links
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.transfer_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read transfer_links" ON public.transfer_links
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members write transfer_links" ON public.transfer_links
  FOR INSERT WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members update transfer_links" ON public.transfer_links
  FOR UPDATE USING (public.has_tenant_role(tenant_id, 'member'))
          WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members delete transfer_links" ON public.transfer_links
  FOR DELETE USING (public.has_tenant_role(tenant_id, 'member'));

-- ── transfer_decisions: the user's verdict, durable ─────────────────────
--
-- Deliberately NO foreign key to transactions. Keyed instead on the content
-- triple (account_id, dedupe_hash, occurrence) that idx_transactions_dedupe
-- already enforces as identity. Deleting an upload batch and re-importing it
-- regenerates identical triples (occurrence restarts at 0 per batch — see
-- 20260804010000_ingestion_engine.sql), so the user's decision reattaches to
-- the re-imported rows instead of reverting to the algorithm's guess.

CREATE TABLE public.transfer_decisions (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  from_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  from_hash       bytea NOT NULL,
  from_occurrence int   NOT NULL,
  to_account_id   uuid  REFERENCES public.accounts(id) ON DELETE CASCADE,
  to_hash         bytea,
  to_occurrence   int,

  verdict    text NOT NULL CHECK (verdict IN ('confirmed', 'rejected', 'external')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  note       text
);

-- NULLS NOT DISTINCT is required, and is the OPPOSITE of idx_transactions_dedupe's
-- behaviour: a single-leg 'external' decision has NULL to_* columns, and
-- re-deciding that same leg must CONFLICT with the existing row rather than
-- insert a second one. Requires PG15+.
CREATE UNIQUE INDEX idx_transfer_decisions_pair
  ON public.transfer_decisions
  (tenant_id, from_account_id, from_hash, from_occurrence,
   to_account_id, to_hash, to_occurrence) NULLS NOT DISTINCT;

CREATE INDEX idx_transfer_decisions_tenant ON public.transfer_decisions (tenant_id);

ALTER TABLE public.transfer_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read transfer_decisions" ON public.transfer_decisions
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members write transfer_decisions" ON public.transfer_decisions
  FOR INSERT WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members update transfer_decisions" ON public.transfer_decisions
  FOR UPDATE USING (public.has_tenant_role(tenant_id, 'member'))
          WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
-- No member DELETE policy. Human judgement is append-mostly; "undo" in the
-- panel writes a new decision row rather than deleting the old one. Only
-- admin+ (via has_tenant_role in a future admin tool) may hard-delete.
CREATE POLICY "tenant admins delete transfer_decisions" ON public.transfer_decisions
  FOR DELETE USING (public.has_tenant_role(tenant_id, 'admin'));

-- ── Candidate selection RPC ──────────────────────────────────────────────
--
-- Only what the matcher needs leaves Postgres. The partial index on
-- transactions (tenant_id, abs(amount), date) WHERE transfer_candidate makes
-- this an index scan, not a sequential scan — this IS the O(N) bucketing
-- Law 3 requires; the TS layer only does the per-bucket scoring.

CREATE OR REPLACE FUNCTION public.transfer_candidates(
  p_tenant_id uuid,
  p_from      date,
  p_to        date
)
RETURNS TABLE (
  txn_id               uuid,
  account_id           uuid,
  account_name         text,
  account_type         public.account_type,
  txn_date             date,
  amount               int,
  original_description text,
  dedupe_hash          bytea,
  occurrence           int,
  subcategory          text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    t.id, t.account_id, a.name, a.type, t.date, t.amount,
    t.original_description, t.dedupe_hash, t.occurrence, t.subcategory
  FROM public.transactions t
  JOIN public.accounts a ON a.id = t.account_id
  WHERE t.tenant_id = p_tenant_id
    AND t.transfer_candidate
    AND t.date BETWEEN p_from AND p_to
    AND t.amount <> 0
    AND a.type IN ('Liquid', 'Savings', 'Credit Card')
    -- Never link the synthetic opening-balance anchor from buildAnchor().
    AND t.subcategory IS DISTINCT FROM 'Reconciliation';
$$;

GRANT EXECUTE ON FUNCTION public.transfer_candidates(uuid, date, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.transfer_candidates(uuid, date, date) FROM anon;

-- ── Identifier map RPC ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.account_identifier_map(p_tenant_id uuid)
RETURNS TABLE (
  account_id uuid,
  kind       text,
  value      text,
  confidence real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT account_id, kind, value, confidence
    FROM public.account_identifiers
   WHERE tenant_id = p_tenant_id;
$$;

GRANT EXECUTE ON FUNCTION public.account_identifier_map(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.account_identifier_map(uuid) FROM anon;

-- ── Idempotent link replacement RPC ──────────────────────────────────────
--
-- Runs as one transaction so a failed rescan can never leave the ledger
-- half-unlinked with analytics silently wrong. Three steps:
--   1. Delete only 'auto'/'suggested' links whose BOTH legs sit inside the
--      rescanned window. 'confirmed'/'rejected'/'external' are never
--      touched here — a rescan must not erase a human decision.
--   2. Insert the new set the matcher produced, ON CONFLICT DO NOTHING
--      (the unique indexes on from_txn_id/to_txn_id are the guard).
--   3. Re-apply any durable decision that matches a link's content key.
--      This is the step that makes a delete-and-reimport idempotent: the
--      user's earlier verdict reattaches instead of reverting to whatever
--      the algorithm guesses this time.
--
-- p_links is a JSON array of objects with the shape produced by
-- app/src/lib/transfers/match.ts's PersistableLink type.

CREATE OR REPLACE FUNCTION public.replace_transfer_links(
  p_tenant_id      uuid,
  p_from           date,
  p_to             date,
  p_links          jsonb,
  p_matcher_version int
)
RETURNS TABLE (created int, kept int, removed int)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_removed int;
  v_created int;
BEGIN
  WITH stale AS (
    SELECT l.id
      FROM public.transfer_links l
      JOIN public.transactions ft ON ft.id = l.from_txn_id
      LEFT JOIN public.transactions tt ON tt.id = l.to_txn_id
     WHERE l.tenant_id = p_tenant_id
       AND l.state IN ('auto', 'suggested')
       AND ft.date BETWEEN p_from AND p_to
       AND (tt.id IS NULL OR tt.date BETWEEN p_from AND p_to)
  )
  DELETE FROM public.transfer_links WHERE id IN (SELECT id FROM stale);
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  INSERT INTO public.transfer_links (
    tenant_id, from_txn_id, to_txn_id, state, score, reasons, ambiguous,
    matcher_version, from_account_id, from_hash, from_occurrence,
    to_account_id, to_hash, to_occurrence
  )
  SELECT
    p_tenant_id,
    (elem ->> 'from_txn_id')::uuid,
    NULLIF(elem ->> 'to_txn_id', '')::uuid,
    elem ->> 'state',
    (elem ->> 'score')::real,
    coalesce(elem -> 'reasons', '[]'::jsonb),
    coalesce((elem ->> 'ambiguous')::boolean, false),
    p_matcher_version,
    (elem ->> 'from_account_id')::uuid,
    decode(elem ->> 'from_hash', 'hex'),
    (elem ->> 'from_occurrence')::int,
    NULLIF(elem ->> 'to_account_id', '')::uuid,
    CASE WHEN elem ->> 'to_hash' IS NULL THEN NULL ELSE decode(elem ->> 'to_hash', 'hex') END,
    NULLIF(elem ->> 'to_occurrence', '')::int
  FROM jsonb_array_elements(p_links) elem
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_created = ROW_COUNT;

  -- Re-apply durable decisions onto whatever now exists in-window.
  UPDATE public.transfer_links l
     SET state = d.verdict
    FROM public.transfer_decisions d
   WHERE l.tenant_id = p_tenant_id
     AND d.tenant_id = p_tenant_id
     AND l.from_account_id = d.from_account_id
     AND l.from_hash       = d.from_hash
     AND l.from_occurrence = d.from_occurrence
     AND l.to_account_id IS NOT DISTINCT FROM d.to_account_id
     AND l.to_hash       IS NOT DISTINCT FROM d.to_hash
     AND l.to_occurrence IS NOT DISTINCT FROM d.to_occurrence
     AND l.state <> d.verdict;

  RETURN QUERY SELECT v_created, 0, v_removed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_transfer_links(uuid, date, date, jsonb, int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.replace_transfer_links(uuid, date, date, jsonb, int) FROM anon;

-- ── Decision RPC ──────────────────────────────────────────────────────────
--
-- Copies the content key off the link into transfer_decisions (durable),
-- then stamps the same verdict onto the link itself (so the UI reflects it
-- immediately, without waiting for the next rescan).

CREATE OR REPLACE FUNCTION public.decide_transfer(
  p_tenant_id uuid,
  p_link_id   uuid,
  p_verdict   text,
  p_note      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.transfer_links%ROWTYPE;
  v_decision_id uuid;
BEGIN
  IF p_verdict NOT IN ('confirmed', 'rejected', 'external') THEN
    RAISE EXCEPTION 'invalid verdict: %', p_verdict;
  END IF;

  SELECT * INTO v_link FROM public.transfer_links
   WHERE id = p_link_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer link not found';
  END IF;

  INSERT INTO public.transfer_decisions (
    tenant_id, from_account_id, from_hash, from_occurrence,
    to_account_id, to_hash, to_occurrence, verdict, decided_by, note
  )
  VALUES (
    p_tenant_id, v_link.from_account_id, v_link.from_hash, v_link.from_occurrence,
    v_link.to_account_id, v_link.to_hash, v_link.to_occurrence, p_verdict,
    (SELECT auth.uid()), p_note
  )
  ON CONFLICT (tenant_id, from_account_id, from_hash, from_occurrence,
               to_account_id, to_hash, to_occurrence)
  DO UPDATE SET verdict = excluded.verdict, decided_by = excluded.decided_by,
                decided_at = now(), note = excluded.note
  RETURNING id INTO v_decision_id;

  UPDATE public.transfer_links SET state = p_verdict WHERE id = p_link_id;

  RETURN v_decision_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decide_transfer(uuid, uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.decide_transfer(uuid, uuid, text, text) FROM anon;

-- ── Analytics view ────────────────────────────────────────────────────────
--
-- security_invoker = true is mandatory: without it this view runs with
-- owner privileges and returns every tenant's rows, bypassing RLS entirely.
--
-- The join is deliberately NOT
--   LEFT JOIN transfer_links l ON l.from_txn_id = t.id OR l.to_txn_id = t.id
-- — an OR across two columns defeats both unique indexes and forces a
-- nested loop over transfer_links per row, exactly the Law 3 trap. The
-- LATERAL/UNION ALL form below keeps both branches as index lookups.

CREATE VIEW public.transactions_analytic
WITH (security_invoker = true) AS
SELECT
  t.*,
  -- coalesce(...) matters: for an unlinked row, `l.state` is NULL, and SQL's
  -- three-valued logic makes `false OR NULL` evaluate to NULL rather than
  -- false. An `is_transfer` of NULL still reads falsy in the client's `!t.isTransfer`
  -- checks, but it is the wrong value to carry — a future `.eq('is_transfer', false)`
  -- filter (PostgREST or otherwise) would silently exclude every unlinked
  -- transaction, since NULL never equals false in SQL.
  coalesce(t.category = 'Transfer' OR l.state IN ('auto', 'confirmed', 'external'), false) AS is_transfer,
  coalesce(l.state, CASE WHEN t.transfer_candidate THEN 'unmatched' ELSE 'none' END) AS transfer_state,
  l.id AS transfer_link_id
FROM public.transactions t
LEFT JOIN LATERAL (
  SELECT id, state FROM public.transfer_links WHERE from_txn_id = t.id
  UNION ALL
  SELECT id, state FROM public.transfer_links WHERE to_txn_id = t.id
  LIMIT 1
) l ON true;

GRANT SELECT ON public.transactions_analytic TO authenticated;

-- Views pick up Supabase's bootstrap ALL-grant to service_role same as
-- tables do, and that grant is not touched by the table-scoped REVOKEs
-- earlier migrations run — it has to be stripped here explicitly, per view.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.transactions_analytic
  FROM anon, authenticated, service_role;
REVOKE ALL ON public.transactions_analytic FROM anon;

-- ── Grants ─────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_identifiers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_identifiers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_links TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.transfer_decisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_decisions TO service_role;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.account_identifiers
  FROM anon, authenticated, service_role;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.transfer_links
  FROM anon, authenticated, service_role;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.transfer_decisions
  FROM anon, authenticated, service_role;
REVOKE ALL ON public.account_identifiers FROM anon;
REVOKE ALL ON public.transfer_links FROM anon;
REVOKE ALL ON public.transfer_decisions FROM anon;

-- ── Assertions ────────────────────────────────────────────────────────────
--
-- Same guards as 20260804010000_ingestion_engine.sql, extended with a check
-- that no view in `public` is missing security_invoker=true — the RLS/grant
-- assertions below only look at tables (relkind = 'r') and would silently
-- pass a leaky view like the one this migration adds.

DO $$
DECLARE
  unprotected text;
  leaked      text;
  leaky_views text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO unprotected
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF unprotected IS NOT NULL THEN
    RAISE EXCEPTION 'Tables in public without RLS enabled: %', unprotected;
  END IF;

  SELECT string_agg(format('%s:%s/%s', grantee, table_name, privilege_type), ', ')
    INTO leaked
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND (grantee = 'anon'
          OR (grantee IN ('authenticated', 'service_role')
              AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')));
  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected grants remain: %', leaked;
  END IF;

  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO leaky_views
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v'
     AND NOT coalesce(
           (SELECT option_value::boolean
              FROM pg_options_to_table(c.reloptions) o
             WHERE o.option_name = 'security_invoker'),
           false);
  IF leaky_views IS NOT NULL THEN
    RAISE EXCEPTION 'Views in public without security_invoker=true: %', leaky_views;
  END IF;
END $$;
