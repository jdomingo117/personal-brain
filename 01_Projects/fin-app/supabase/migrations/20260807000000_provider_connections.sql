-- ═══════════════════════════════════════════════════════════════════════
-- API bank connections (Up Bank first).
--
-- A user pastes a read-only Personal Access Token; we sync their accounts
-- and transactions automatically instead of requiring CSV uploads forever.
--
-- Three-way split, deliberately:
--   provider_connections         — status the user is allowed to see over PostgREST
--   private.provider_credentials — the ciphertext, which the user is NOT
--   account_connections          — per-account mapping, cutover date, sync cursor
--   sync_runs                    — run history + the concurrency lock
--
-- The credential/status split is what lets a client read "is my connection
-- healthy" without ever being able to read the secret behind it.
--
-- IMPORTANT, and verified against a running stack rather than assumed: Edge
-- Functions in this repo (via _shared/withAuth.ts's `ctx.admin()`) only ever
-- reach Postgres through PostgREST/HTTP — there is no raw SQL connection
-- anywhere in this codebase. PostgREST refuses to serve ANY schema absent
-- from config.toml's `[api] schemas` list, for every role, before any grant
-- or RLS check runs — including service_role. So `private` MUST be listed in
-- `[api] schemas` (it now is) or the Edge Functions that manage credentials
-- could not reach their own vault table at all.
--
-- That means schema placement is not the security boundary here — grants
-- are, exactly as everywhere else in this repo. `private` is still worth a
-- separate schema for one concrete reason: `public` carries `ALTER DEFAULT
-- PRIVILEGES ... GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`
-- (20260719000000_grant_permissions.sql), so a table added to `public`
-- inherits that dangerous default grant automatically. A table added to
-- `private` does not — this migration revokes the default first, so even a
-- future careless `CREATE TABLE private.something` starts from zero grants
-- rather than from "readable and writable by every logged-in user."
-- Everything below (REVOKE ALL, no policies at all, the assertion block at
-- the end) is the actual, load-bearing control.
-- ═══════════════════════════════════════════════════════════════════════

-- ── The vault schema ───────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON TABLES FROM anon, authenticated;

-- `private` MUST be in config.toml's `[api] schemas` list, or no client —
-- including a correctly-configured service-role one — can reach it over
-- PostgREST at all (see the comment above). The REVOKE ALL / no-policy
-- stance below is what keeps it locked down despite being schema-visible.

CREATE TYPE public.provider_kind AS ENUM ('up');

CREATE TYPE public.connection_status AS ENUM (
  'active',      -- token works
  'revoked',     -- provider returned 401; token is dead, user must re-enter
  'error',       -- transient/unknown failure, retryable
  'disabled'     -- user turned it off; ciphertext deleted
);

-- ── Connection: one per (tenant, provider) ─────────────────────────────
--
-- Up issues exactly one live Personal Access Token per user — generating a
-- new one in the Up app silently revokes the old one. Modelling more than
-- one connection per provider would let the UI offer something the
-- provider cannot actually honour.

CREATE TABLE public.provider_connections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  provider     public.provider_kind NOT NULL,
  status       public.connection_status NOT NULL DEFAULT 'active',
  -- Display only, e.g. "4f2c" from "up:yeah:...4f2c" — never used for auth,
  -- never compared against anything. Lets the user tell which token is
  -- installed without us ever showing the real one back.
  token_hint   text,
  -- Which entry in PROVIDER_TOKEN_KEYS encrypted the ciphertext. A rotation
  -- writes a new version while old rows stay decryptable under their own.
  key_version  smallint NOT NULL DEFAULT 1,
  last_error       text,
  last_error_at    timestamptz,
  last_verified_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

CREATE TRIGGER handle_updated_at_provider_connections
  BEFORE UPDATE ON public.provider_connections
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.provider_connections ENABLE ROW LEVEL SECURITY;

-- SELECT only. Every mutation goes through an Edge Function on the service
-- role — a client that could UPDATE this row could set status='active' on a
-- connection whose credential was already deleted, or repoint key_version at
-- a version that decrypts to garbage and turn a sync into a decrypt oracle.
CREATE POLICY "tenant members read provider_connections"
  ON public.provider_connections FOR SELECT USING (public.is_tenant_member(tenant_id));

-- ── The ciphertext ─────────────────────────────────────────────────────

CREATE TABLE private.provider_credentials (
  connection_id uuid PRIMARY KEY
                REFERENCES public.provider_connections(id) ON DELETE CASCADE,
  -- "v<key_version>.<b64url iv>.<b64url ciphertext||tag>" — see
  -- supabase/functions/_shared/crypto.ts. Text rather than bytea so the
  -- format/version travels with the bytes instead of living in a sibling
  -- column that could be edited independently of them.
  ciphertext    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  rotated_at    timestamptz
);

ALTER TABLE private.provider_credentials ENABLE ROW LEVEL SECURITY;
-- No policies at all: RLS with zero policies denies every row to every
-- non-superuser role, including service_role — which is exactly why
-- service_role needs to bypass RLS, and does by default in Supabase. Stated
-- explicitly so a future reader does not "fix" the apparently-missing policy.
REVOKE ALL ON private.provider_credentials FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON private.provider_credentials TO service_role;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON private.provider_credentials FROM service_role;

-- ── Per-account link ───────────────────────────────────────────────────

CREATE TABLE public.account_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connection_id   uuid NOT NULL REFERENCES public.provider_connections(id) ON DELETE CASCADE,
  account_id      uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  provider        public.provider_kind NOT NULL,
  provider_account_id   text NOT NULL,  -- Up's account UUID, stable for the account's life
  provider_account_type text,           -- Up: TRANSACTIONAL | SAVER
  provider_ownership    text,           -- Up: INDIVIDUAL | JOINT

  -- ── The CSV/API seam ─────────────────────────────────────────────────
  -- API rows dated before this are discarded, server-side, unconditionally.
  -- CSV owns history, the API owns forward — the two ingestion paths hash
  -- rows completely differently (see providerDedupeHashHex in
  -- _shared/dedupe.ts) and cannot see or collide with each other, so without
  -- a cutover a full Up backfill would write every already-imported
  -- transaction a second time.
  cutover_date    date NOT NULL,

  -- Incremental watermark: "the newest provider_posted_at we durably have",
  -- NOT Up's opaque page cursor (which expires and cannot be resumed days
  -- later). Every incremental sync re-reads from (watermark - REPLAY_DAYS)
  -- so a late-settling transaction is still picked up. Stays NULL until the
  -- backfill completes, because Up returns newest-first — advancing this
  -- early would make an interrupted backfill look "caught up" while its tail
  -- is still missing.
  synced_through  timestamptz,
  -- Opaque `links.next` URL from an in-progress backfill. NULL once done.
  backfill_cursor text,
  backfill_done   boolean NOT NULL DEFAULT false,

  last_synced_at  timestamptz,
  balance_as_of   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (connection_id, provider_account_id),
  -- One provider link per Halcyon account — two providers writing the same
  -- ledger would each believe they owned its balance.
  UNIQUE (account_id)
);

CREATE INDEX idx_account_connections_tenant ON public.account_connections (tenant_id);

CREATE TRIGGER handle_updated_at_account_connections
  BEFORE UPDATE ON public.account_connections
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.account_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read account_connections"
  ON public.account_connections FOR SELECT USING (public.is_tenant_member(tenant_id));
-- Mutations via Edge Function only: cutover_date and synced_through are
-- integrity-bearing. A client that could move cutover_date backwards could
-- make the next sync duplicate every CSV row it already has.

-- ── Sync run history + concurrency lock ────────────────────────────────

CREATE TABLE public.sync_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connection_id  uuid NOT NULL REFERENCES public.provider_connections(id) ON DELETE CASCADE,
  account_connection_id uuid REFERENCES public.account_connections(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('backfill', 'incremental', 'verify')),
  status         text NOT NULL CHECK (status IN ('running','succeeded','failed','stalled','partial')),
  trigger        text NOT NULL CHECK (trigger IN ('manual','stale','continue')),
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  pages_fetched  int  NOT NULL DEFAULT 0,
  rows_seen      int  NOT NULL DEFAULT 0,
  rows_inserted  int  NOT NULL DEFAULT 0,
  rows_updated   int  NOT NULL DEFAULT 0,
  rows_rejected_pre_cutover int NOT NULL DEFAULT 0,
  error_code     text,
  error_detail   text
);

CREATE INDEX idx_sync_runs_connection ON public.sync_runs (connection_id, started_at DESC);

-- THE concurrency control. Two tabs both clicking "Sync now" race to insert
-- a 'running' row; the loser gets 23505 and reports "already syncing"
-- instead of doubling the API spend and interleaving cursor writes. Cheaper
-- and more honest than an advisory lock: a killed Edge Function leaves
-- visible evidence here rather than a lock that silently released.
CREATE UNIQUE INDEX idx_sync_runs_one_active
  ON public.sync_runs (connection_id) WHERE status = 'running';

ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read sync_runs"
  ON public.sync_runs FOR SELECT USING (public.is_tenant_member(tenant_id));

-- ── Transactions: provenance, external identity, pending ───────────────

ALTER TABLE public.transactions
  ADD COLUMN provider    public.provider_kind,
  ADD COLUMN external_id text,          -- Up's transaction id; stable across HELD -> SETTLED
  -- HELD at Up. A held amount is provisional (a restaurant pre-auth holds
  -- $1 and settles at $84), so pending rows are excluded from spending
  -- analytics and transfer matching until they settle — see
  -- transactions_analytic and transfer_candidates below.
  ADD COLUMN pending     boolean NOT NULL DEFAULT false,
  -- Up's settledAt/createdAt, kept for same-day ordering and as the
  -- incremental watermark. `date` remains the analytics date.
  ADD COLUMN provider_posted_at timestamptz,
  -- Up's `transferAccount` relationship: the provider telling us, as ground
  -- truth, that this leg's counterparty is another of the user's own
  -- accounts. Stored raw (not consumed inline) so a linking pass can match
  -- retroactively once the OTHER account is connected and synced too.
  ADD COLUMN provider_transfer_account_id text;

-- Partial so CSV rows (external_id NULL) are wholly unaffected and the index
-- stays small. This is the identity constraint for API rows — see
-- providerDedupeHashHex in _shared/dedupe.ts for why dedupe_hash alone
-- already protects them too, and why both exist.
CREATE UNIQUE INDEX idx_transactions_external
  ON public.transactions (account_id, provider, external_id)
  WHERE external_id IS NOT NULL;

-- Fast "which of my rows are still held" for the pending-refresh pass.
CREATE INDEX idx_transactions_pending
  ON public.transactions (account_id, provider_posted_at)
  WHERE pending;

-- ── account_identifiers: allow 'provider' as a source ───────────────────
--
-- Up gives a real account UUID at connect time, but that UUID will never
-- appear in another bank's transaction description, so it is deliberately
-- NOT written in as an identifier (see the connect-provider function). This
-- widening is for the one identifier that IS worth writing:
-- kind='institution', value='up', source='provider' — so a transfer
-- landing in Up from elsewhere gets an institution-name signal.

ALTER TABLE public.account_identifiers DROP CONSTRAINT account_identifiers_source_check;
ALTER TABLE public.account_identifiers ADD CONSTRAINT account_identifiers_source_check
  CHECK (source IN ('user', 'inferred', 'provider'));

-- ── transfer_candidates: exclude pending legs ───────────────────────────
--
-- A held amount is provisional. Matching on it either fails to find its
-- true (settled) counterpart and burns a candidate slot, or worse, finds a
-- spurious inverse and writes a transfer_links row whose legs stop summing
-- to zero the instant the amount corrects on settle. The row becomes a
-- candidate automatically the moment the sync that settles it runs.

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
    AND t.subcategory IS DISTINCT FROM 'Reconciliation'
    AND NOT t.pending;
$$;

-- (GRANT/REVOKE already applied to this function name+signature by
-- 20260806000000; CREATE OR REPLACE preserves them.)

-- ── transactions_analytic: DROP + CREATE, not CREATE OR REPLACE ─────────
--
-- The view body is `SELECT t.*, <computed columns>`. `t.*` was expanded to a
-- fixed column list at the view's creation time, and the five ALTER TABLE
-- ADD COLUMNs above land BEFORE that expansion point once the view is
-- rebuilt — CREATE OR REPLACE VIEW may only *append* trailing columns, so
-- replacing this view now fails with "cannot change name of view column
-- \"is_transfer\" to \"provider\"". Drop and recreate; the body is otherwise
-- byte-identical to 20260806030000, `pending` simply arrives via `t.*`.

DROP VIEW public.transactions_analytic;

CREATE VIEW public.transactions_analytic
WITH (security_invoker = true) AS
SELECT
  t.*,
  CASE
    WHEN d.verdict = 'rejected'               THEN false
    WHEN d.verdict IN ('confirmed', 'external') THEN true
    ELSE coalesce(
      t.category = 'Transfer' OR l.state IN ('auto', 'confirmed', 'external'),
      false
    )
  END AS is_transfer,
  coalesce(
    l.state,
    d.verdict,
    CASE WHEN t.transfer_candidate THEN 'unmatched' ELSE 'none' END
  ) AS transfer_state,
  l.id AS transfer_link_id
FROM public.transactions t
LEFT JOIN LATERAL (
  SELECT id, state FROM public.transfer_links WHERE from_txn_id = t.id
  UNION ALL
  SELECT id, state FROM public.transfer_links WHERE to_txn_id   = t.id
  LIMIT 1
) l ON true
LEFT JOIN LATERAL (
  SELECT verdict FROM (
    SELECT dd.verdict, dd.decided_at
      FROM public.transfer_decisions dd
     WHERE dd.tenant_id       = t.tenant_id
       AND dd.from_account_id = t.account_id
       AND dd.from_hash       = t.dedupe_hash
       AND dd.from_occurrence = t.occurrence
    UNION ALL
    SELECT dd.verdict, dd.decided_at
      FROM public.transfer_decisions dd
     WHERE dd.tenant_id     = t.tenant_id
       AND dd.to_account_id = t.account_id
       AND dd.to_hash       = t.dedupe_hash
       AND dd.to_occurrence = t.occurrence
  ) either_leg
  ORDER BY decided_at DESC
  LIMIT 1
) d ON true;

GRANT SELECT ON public.transactions_analytic TO authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.transactions_analytic
  FROM anon, authenticated, service_role;
REVOKE ALL ON public.transactions_analytic FROM anon;

-- ── Grants ─────────────────────────────────────────────────────────────

GRANT SELECT ON public.provider_connections, public.account_connections, public.sync_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_connections, public.account_connections, public.sync_runs TO service_role;
-- authenticated gets SELECT only — every mutation is integrity-bearing
-- (cutover dates, sync cursors, connection status) and goes through an
-- Edge Function on the service role instead.
REVOKE INSERT, UPDATE, DELETE ON public.provider_connections, public.account_connections, public.sync_runs FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.provider_connections, public.account_connections, public.sync_runs
  FROM anon, authenticated, service_role;
REVOKE ALL ON public.provider_connections, public.account_connections, public.sync_runs FROM anon;

-- ── Assertions ────────────────────────────────────────────────────────────
--
-- The existing checks only ever look at nspname='public', so a table in
-- `private` without RLS, or with a grant to a PostgREST role, would sail
-- through every guard this repo already has. Extended here rather than in a
-- follow-up migration, because a vault schema with an unchecked assumption
-- is worse than no vault schema at all.

DO $$
DECLARE
  unprotected text;
  leaked      text;
  leaky_views text;
  vault_rls   text;
  vault_grants text;
  vault_usage_anon boolean;
  vault_usage_auth boolean;
  conn_write_grants text;
BEGIN
  -- Existing guard: every public table has RLS.
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO unprotected
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF unprotected IS NOT NULL THEN
    RAISE EXCEPTION 'Tables in public without RLS enabled: %', unprotected;
  END IF;

  -- Existing guard: no anon grants, no forbidden write grants in public.
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

  -- Existing guard: every public view is security_invoker.
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

  -- NEW: every table in `private` must have RLS enabled too.
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO vault_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'private' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF vault_rls IS NOT NULL THEN
    RAISE EXCEPTION 'Tables in private without RLS: %', vault_rls;
  END IF;

  -- NEW: PostgREST-reachable roles must hold no grant at all in `private`.
  SELECT string_agg(format('%s:%s/%s', grantee, table_name, privilege_type), ', ')
    INTO vault_grants
    FROM information_schema.role_table_grants
   WHERE table_schema = 'private' AND grantee IN ('anon', 'authenticated');
  IF vault_grants IS NOT NULL THEN
    RAISE EXCEPTION 'PostgREST roles hold grants in private: %', vault_grants;
  END IF;

  -- NEW: PostgREST-reachable roles must hold no USAGE on `private` either —
  -- a grant alone is inert without schema USAGE, so both must be absent.
  SELECT has_schema_privilege('anon', 'private', 'USAGE') INTO vault_usage_anon;
  SELECT has_schema_privilege('authenticated', 'private', 'USAGE') INTO vault_usage_auth;
  IF vault_usage_anon OR vault_usage_auth THEN
    RAISE EXCEPTION 'anon/authenticated hold USAGE on schema private';
  END IF;

  -- NEW: authenticated must hold SELECT only on the three connection
  -- tables — a stray future `GRANT ... ON ALL TABLES IN SCHEMA public TO
  -- authenticated` would silently re-open write access to integrity-bearing
  -- rows (cutover dates, sync cursors) that must only ever move through an
  -- Edge Function.
  SELECT string_agg(format('%s/%s', table_name, privilege_type), ', ')
    INTO conn_write_grants
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee = 'authenticated'
     AND table_name IN ('provider_connections', 'account_connections', 'sync_runs')
     AND privilege_type <> 'SELECT';
  IF conn_write_grants IS NOT NULL THEN
    RAISE EXCEPTION 'authenticated holds write grants on connection tables: %', conn_write_grants;
  END IF;
END $$;
