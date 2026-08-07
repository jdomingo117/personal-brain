-- ═══════════════════════════════════════════════════════════════════════
-- Auth hardening: tenancy, session registry, brute-force state, audit log.
--
-- Credentials, refresh tokens and OAuth identities stay in GoTrue's `auth`
-- schema and are NOT duplicated here. This migration builds only the layer
-- GoTrue deliberately does not provide: who belongs to what, who may do what,
-- which devices are signed in, who is hammering the login endpoint, and an
-- immutable record of it all.
-- ═══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Tenancy
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       extensions.citext UNIQUE NOT NULL,
  kind       text NOT NULL DEFAULT 'personal' CHECK (kind IN ('personal', 'org')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TYPE public.tenant_role AS ENUM ('owner', 'admin', 'member', 'viewer');

CREATE TABLE public.tenant_members (
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.tenant_role NOT NULL DEFAULT 'member',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX idx_tenant_members_user ON public.tenant_members (user_id);

-- Each profile remembers which tenant to open on login.
ALTER TABLE public.profiles
  ADD COLUMN default_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;

-- Account deletion is scheduled, not immediate. A 30-day window means an
-- attacker who takes over a session cannot destroy someone's financial
-- history irreversibly, and it gives the real owner time to notice and
-- cancel. Signing in during the window clears the flag.
ALTER TABLE public.profiles
  ADD COLUMN deletion_scheduled_at timestamptz;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Authorization helpers
--
-- These MUST be SECURITY DEFINER. An RLS policy on tenant_members that
-- itself selects from tenant_members recurses infinitely; routing the lookup
-- through a definer-rights function breaks the cycle because the function
-- body runs with RLS bypassed for its owner.
--
-- STABLE (not VOLATILE) lets the planner hoist the call out of the row loop,
-- so the membership lookup runs once per query rather than once per row.
-- `SET search_path` prevents a hostile search_path from resolving these
-- names to attacker-controlled objects.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.current_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT tenant_id
    FROM public.tenant_members
   WHERE user_id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.tenant_members
     WHERE tenant_id = p_tenant_id
       AND user_id = (SELECT auth.uid())
  );
$$;

-- Role hierarchy: owner > admin > member > viewer. `p_min_role` is the
-- weakest role that satisfies the check.
CREATE OR REPLACE FUNCTION public.has_tenant_role(
  p_tenant_id uuid,
  p_min_role  public.tenant_role
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.tenant_members m
     WHERE m.tenant_id = p_tenant_id
       AND m.user_id = (SELECT auth.uid())
       AND CASE m.role
             WHEN 'owner'  THEN 4
             WHEN 'admin'  THEN 3
             WHEN 'member' THEN 2
             WHEN 'viewer' THEN 1
           END
           >=
           CASE p_min_role
             WHEN 'owner'  THEN 4
             WHEN 'admin'  THEN 3
             WHEN 'member' THEN 2
             WHEN 'viewer' THEN 1
           END
  );
$$;

-- Platform-level admin, distinct from tenant `admin`. Read from the JWT's
-- app_metadata, which only the service role can write — a user cannot grant
-- themselves this by updating their own profile row.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    (SELECT auth.jwt() -> 'app_metadata' ->> 'admin') = 'true',
    false
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Session registry
--
-- A user-facing mirror of auth.sessions carrying the device metadata an
-- "active sessions" screen needs. Deliberately stores no token material —
-- only a hash, and only so that a replayed refresh token can be traced back
-- to a device after the fact.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.user_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gotrue_session_id  uuid,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token_hash bytea,
  user_agent         text,
  ip                 inet,
  approx_location    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz,
  revoked_reason     text
);

CREATE INDEX idx_user_sessions_active ON public.user_sessions (user_id, revoked_at);
CREATE UNIQUE INDEX idx_user_sessions_gotrue ON public.user_sessions (gotrue_session_id)
  WHERE gotrue_session_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Brute-force state
--
-- Emails are stored hashed. This table is an attack-surface record, not a
-- user directory: a leak of it must not hand over a list of registered
-- addresses, and a hash still supports every rate-limiting query we need.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.login_attempts (
  id           bigserial PRIMARY KEY,
  email_hash   bytea NOT NULL,
  ip           inet,
  succeeded    boolean NOT NULL,
  failure_kind text CHECK (
    failure_kind IN ('bad_password', 'unknown_user', 'locked', 'captcha', 'rate_limited')
  ),
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_login_attempts_email ON public.login_attempts (email_hash, attempted_at DESC);
CREATE INDEX idx_login_attempts_ip ON public.login_attempts (ip, attempted_at DESC);

CREATE TABLE public.account_lockouts (
  email_hash   bytea PRIMARY KEY,
  failed_count int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_failure timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Audit log
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.audit_log (
  id          bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_id   uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  action      text NOT NULL,
  target_type text,
  target_id   text,
  ip          inet,
  user_agent  text,
  metadata    jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_audit_log_tenant ON public.audit_log (tenant_id, occurred_at DESC);
CREATE INDEX idx_audit_log_actor ON public.audit_log (actor_id, occurred_at DESC);
CREATE INDEX idx_audit_log_action ON public.audit_log (action, occurred_at DESC);

-- Append-only. An audit log that a compromised session can rewrite is
-- decoration, so mutation is blocked at the table level rather than trusted
-- to application code.
CREATE OR REPLACE FUNCTION public.audit_log_is_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (attempted %)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_is_append_only();

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Tenant backfill for existing data
--
-- Runs before the policies are swapped, so there is never a window where a
-- membership-based policy is evaluating a NULL tenant_id.
-- ═══════════════════════════════════════════════════════════════════════

-- One personal tenant per existing user, owned by them.
INSERT INTO public.tenants (id, name, slug, kind)
SELECT
  gen_random_uuid(),
  coalesce(p.callsign, 'Personal'),
  'u-' || replace(u.id::text, '-', ''),
  'personal'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id;

INSERT INTO public.tenant_members (tenant_id, user_id, role)
SELECT t.id, u.id, 'owner'
FROM auth.users u
JOIN public.tenants t ON t.slug = 'u-' || replace(u.id::text, '-', '');

UPDATE public.profiles p
   SET default_tenant_id = t.id
  FROM public.tenants t
 WHERE t.slug = 'u-' || replace(p.id::text, '-', '');

-- Add tenant_id to every tenant-scoped table, backfill from user_id, then
-- enforce NOT NULL.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['accounts', 'transactions', 'static_profiles', 'budgets']
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE',
      tbl
    );
    EXECUTE format(
      'UPDATE public.%I s SET tenant_id = m.tenant_id
         FROM public.tenant_members m
        WHERE m.user_id = s.user_id AND m.role = ''owner''',
      tbl
    );
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', tbl);
    EXECUTE format('CREATE INDEX idx_%I_tenant ON public.%I (tenant_id)', tbl, tbl);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Policy rewrite: auth.uid() = user_id  ->  tenant membership
--
-- Note `(SELECT auth.uid())` rather than a bare `auth.uid()`. The subquery
-- form is evaluated once as an InitPlan instead of once per candidate row,
-- which is the difference between a sequential scan and an index scan on
-- large transaction tables.
-- ═══════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can manage their own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can manage their own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can manage their own static profiles" ON public.static_profiles;
DROP POLICY IF EXISTS "Users can manage their own budgets" ON public.budgets;

CREATE POLICY "tenant members read accounts" ON public.accounts
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members write accounts" ON public.accounts
  FOR INSERT WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members update accounts" ON public.accounts
  FOR UPDATE USING (public.has_tenant_role(tenant_id, 'member'))
          WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members delete accounts" ON public.accounts
  FOR DELETE USING (public.has_tenant_role(tenant_id, 'member'));

CREATE POLICY "tenant members read transactions" ON public.transactions
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members write transactions" ON public.transactions
  FOR INSERT WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members update transactions" ON public.transactions
  FOR UPDATE USING (public.has_tenant_role(tenant_id, 'member'))
          WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members delete transactions" ON public.transactions
  FOR DELETE USING (public.has_tenant_role(tenant_id, 'member'));

CREATE POLICY "tenant members read static_profiles" ON public.static_profiles
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members write static_profiles" ON public.static_profiles
  FOR INSERT WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members update static_profiles" ON public.static_profiles
  FOR UPDATE USING (public.has_tenant_role(tenant_id, 'member'))
          WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members delete static_profiles" ON public.static_profiles
  FOR DELETE USING (public.has_tenant_role(tenant_id, 'member'));

CREATE POLICY "tenant members read budgets" ON public.budgets
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members write budgets" ON public.budgets
  FOR INSERT WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members update budgets" ON public.budgets
  FOR UPDATE USING (public.has_tenant_role(tenant_id, 'member'))
          WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members delete budgets" ON public.budgets
  FOR DELETE USING (public.has_tenant_role(tenant_id, 'member'));

-- ── RLS on the new tables ──────────────────────────────────────────────

ALTER TABLE public.tenants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_lockouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read their tenants" ON public.tenants
  FOR SELECT USING (public.is_tenant_member(id) OR public.is_platform_admin());
CREATE POLICY "owners update their tenants" ON public.tenants
  FOR UPDATE USING (public.has_tenant_role(id, 'owner'))
          WITH CHECK (public.has_tenant_role(id, 'owner'));

CREATE POLICY "members read the roster" ON public.tenant_members
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "admins manage the roster" ON public.tenant_members
  FOR ALL USING (public.has_tenant_role(tenant_id, 'admin'))
          WITH CHECK (public.has_tenant_role(tenant_id, 'admin'));

-- A user may see and revoke their own sessions, and nothing else. Inserts
-- come from the service role only, so there is no INSERT policy.
CREATE POLICY "users read their sessions" ON public.user_sessions
  FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "users revoke their sessions" ON public.user_sessions
  FOR UPDATE USING (user_id = (SELECT auth.uid()))
          WITH CHECK (user_id = (SELECT auth.uid()));

-- Read-only, tenant-scoped, and admins only. No write policy of any kind:
-- every insert goes through a SECURITY DEFINER function or the service role.
CREATE POLICY "tenant admins read the audit log" ON public.audit_log
  FOR SELECT USING (
    public.has_tenant_role(tenant_id, 'admin') OR public.is_platform_admin()
  );

-- login_attempts and account_lockouts get no policies at all: RLS is enabled
-- and nothing matches, so `authenticated` sees an empty table. Only the
-- service role (which bypasses RLS) and the definer functions below touch
-- them. Exposing them would leak whether an address is registered.

REVOKE ALL ON public.login_attempts, public.account_lockouts FROM anon, authenticated;

-- The audit log is written by SECURITY DEFINER triggers and the service role,
-- never by a browser. INSERT is revoked as well as UPDATE/DELETE so a
-- compromised session cannot forge entries to bury a real one in noise.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_log FROM anon, authenticated;

-- Row-level triggers do not fire on TRUNCATE, so the append-only trigger
-- above does not cover it. This statement-level trigger closes that gap for
-- anyone who reaches the table with TRUNCATE rights.
CREATE OR REPLACE FUNCTION public.audit_log_no_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (attempted TRUNCATE)'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON public.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_log_no_truncate();

-- ═══════════════════════════════════════════════════════════════════════
-- 8. Brute-force protection (layer 3 — per-account, survives IP rotation)
--
-- The edge rate limiter caps requests per IP and per address. It cannot stop
-- a distributed attack that rotates IPs against one account, which is what
-- credential-stuffing actually looks like. This layer is keyed only on the
-- account, so rotating IPs buys the attacker nothing.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.hash_email(p_email text)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
SET search_path = extensions, pg_temp
AS $$
  SELECT extensions.digest(lower(trim(p_email)), 'sha256');
$$;

-- Returns the lockout expiry if the account is currently locked, else NULL.
CREATE OR REPLACE FUNCTION public.check_login_lockout(p_email text)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT locked_until
    FROM public.account_lockouts
   WHERE email_hash = public.hash_email(p_email)
     AND locked_until IS NOT NULL
     AND locked_until > now();
$$;

-- Records an attempt and applies exponential backoff. Returns the lockout
-- expiry when this attempt triggered or extended a lock.
CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_email        text,
  p_ip           inet,
  p_succeeded    boolean,
  p_failure_kind text DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash   bytea := public.hash_email(p_email);
  v_count  int;
  v_locked timestamptz;
BEGIN
  INSERT INTO public.login_attempts (email_hash, ip, succeeded, failure_kind)
  VALUES (v_hash, p_ip, p_succeeded, p_failure_kind);

  IF p_succeeded THEN
    -- A correct password clears the streak. Deliberately unconditional: a
    -- legitimate user who remembers their password should not stay locked.
    DELETE FROM public.account_lockouts WHERE email_hash = v_hash;
    RETURN NULL;
  END IF;

  INSERT INTO public.account_lockouts (email_hash, failed_count, last_failure)
  VALUES (v_hash, 1, now())
  ON CONFLICT (email_hash) DO UPDATE
    SET failed_count = public.account_lockouts.failed_count + 1,
        last_failure = now()
  RETURNING failed_count INTO v_count;

  v_locked := CASE
    WHEN v_count < 5 THEN NULL
    WHEN v_count = 5 THEN now() + interval '1 minute'
    WHEN v_count = 6 THEN now() + interval '5 minutes'
    WHEN v_count = 7 THEN now() + interval '15 minutes'
    ELSE now() + interval '1 hour'
  END;

  IF v_locked IS NOT NULL THEN
    UPDATE public.account_lockouts
       SET locked_until = v_locked
     WHERE email_hash = v_hash;
  END IF;

  RETURN v_locked;
END;
$$;

-- Sliding-window counter used as the fallback limiter when Upstash is not
-- configured, so local development exercises the same code path as prod.
CREATE OR REPLACE FUNCTION public.count_recent_attempts(
  p_email  text,
  p_ip     inet,
  p_window interval
)
RETURNS TABLE (by_email bigint, by_ip bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT
    count(*) FILTER (WHERE email_hash = public.hash_email(p_email)),
    count(*) FILTER (WHERE p_ip IS NOT NULL AND ip = p_ip)
  FROM public.login_attempts
 WHERE attempted_at > now() - p_window
   AND NOT succeeded;
$$;

-- Retention: attempt rows are operational telemetry, not history. Anything
-- older than the longest lockout window is noise, and keeping hashed
-- addresses indefinitely is a liability with no upside.
CREATE OR REPLACE FUNCTION public.prune_login_attempts()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM public.login_attempts WHERE attempted_at < now() - interval '30 days';
  DELETE FROM public.account_lockouts
   WHERE last_failure < now() - interval '30 days'
     AND (locked_until IS NULL OR locked_until < now());
$$;

-- These functions run with definer rights over the lockout tables, so they
-- must not be callable directly by a browser: `authenticated` could otherwise
-- probe check_login_lockout() as an account-existence oracle, or spam
-- record_login_attempt() to lock a victim out of their own account.
REVOKE EXECUTE ON FUNCTION public.check_login_lockout(text)                    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_login_attempt(text, inet, boolean, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.count_recent_attempts(text, inet, interval)  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prune_login_attempts()                       FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 8b. Session registry writer
--
-- Called by the client on sign-in. Keyed on the `session_id` claim in the
-- caller's own JWT rather than on a parameter, so a caller cannot forge rows
-- for another session or flood the table: one row per real GoTrue session,
-- and repeat calls only refresh last_seen_at.
--
-- SECURITY DEFINER because user_sessions deliberately has no INSERT policy —
-- inserts are shaped entirely by this function, not by the client.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.record_user_session(
  p_user_agent text DEFAULT NULL,
  p_ip         inet DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id    uuid := (SELECT auth.uid());
  v_session_id uuid;
  v_expires    timestamptz;
  v_row_id     uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- session_id is minted by GoTrue and is not client-controlled.
  v_session_id := nullif((SELECT auth.jwt() ->> 'session_id'), '')::uuid;
  IF v_session_id IS NULL THEN
    RETURN NULL; -- token predates session tracking; nothing to record
  END IF;

  v_expires := to_timestamp(((SELECT auth.jwt() ->> 'exp'))::bigint);

  INSERT INTO public.user_sessions AS s
    (gotrue_session_id, user_id, user_agent, ip, expires_at)
  VALUES
    (v_session_id, v_user_id, left(p_user_agent, 400), p_ip, v_expires)
  -- The index on gotrue_session_id is partial (it excludes NULLs), and
  -- Postgres will only infer a partial index when the ON CONFLICT clause
  -- restates its predicate. Without the WHERE below this raises 42P10.
  ON CONFLICT (gotrue_session_id) WHERE gotrue_session_id IS NOT NULL DO UPDATE
    SET last_seen_at = now(),
        expires_at   = excluded.expires_at
  RETURNING s.id INTO v_row_id;

  RETURN v_row_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_user_session(text, inet) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.record_user_session(text, inet) FROM anon;

-- ═══════════════════════════════════════════════════════════════════════
-- 9. Signup: provision profile + personal tenant + ownership atomically
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_callsign  text := 'Operator-' || substr(md5(random()::text), 1, 6);
  v_tenant_id uuid;
BEGIN
  INSERT INTO public.tenants (name, slug, kind)
  VALUES (v_callsign, 'u-' || replace(new.id::text, '-', ''), 'personal')
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (v_tenant_id, new.id, 'owner');

  INSERT INTO public.profiles (id, callsign, default_tenant_id)
  VALUES (new.id, v_callsign, v_tenant_id);

  INSERT INTO public.audit_log (actor_id, tenant_id, action, target_type, target_id, metadata)
  VALUES (
    new.id, v_tenant_id, 'auth.user_created', 'user', new.id::text,
    jsonb_build_object('provider', new.raw_app_meta_data ->> 'provider')
  );

  RETURN new;
END;
$$;

-- Audit account removal. The FK cascade wipes the user's rows, so this fires
-- BEFORE delete, and actor_id/tenant_id are left NULL because their targets
-- are about to disappear.
CREATE OR REPLACE FUNCTION public.handle_user_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.audit_log (action, target_type, target_id, metadata)
  VALUES (
    'auth.user_deleted', 'user', old.id::text,
    jsonb_build_object('email_hash', encode(public.hash_email(old.email), 'hex'))
  );
  RETURN old;
END;
$$;

CREATE TRIGGER on_auth_user_deleted
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_deleted();

CREATE TRIGGER handle_updated_at_tenants
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
-- 10. Grants + final RLS coverage assertion
-- ═══════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants, public.tenant_members TO authenticated;
GRANT SELECT, UPDATE ON public.user_sessions TO authenticated;
GRANT SELECT ON public.audit_log TO authenticated;

-- ── Strip the privileges RLS cannot police ─────────────────────────────
--
-- TRUNCATE is the important one: it is NOT filtered by row-level security.
-- A logged-in user holding TRUNCATE on `transactions` can erase every
-- tenant's data in one statement, policies and all. Supabase's own bootstrap
-- grants ALL on public tables to `authenticated`, so this has to be revoked
-- explicitly — and here, at the end of the last migration, so it also covers
-- tables created by earlier migrations.
--
-- REFERENCES and TRIGGER are removed for the same reason: neither is needed
-- by PostgREST, and both let a role attach objects to a table it does not own.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

-- ── service_role ──────────────────────────────────────────────────────
--
-- The trusted server-side identity: Edge Functions use it to write audit
-- entries and to run the few operations that must cross tenant boundaries.
-- It bypasses RLS, so every query made with it has to be scoped by hand.
--
-- Granted explicitly rather than inherited from Supabase's bootstrap
-- defaults, so the privilege set is stated in the schema instead of depending
-- on what the platform happens to set up.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

-- Even the trusted role gets no TRUNCATE, and the audit log stays
-- append-only for it too: Edge Functions insert entries and never revise
-- them, so anything more is a capability with no caller.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_log FROM service_role;

-- Re-assert the anon revocation last: tables created after the Phase 0
-- migration pick up Supabase's built-in default privileges again.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- Verify, rather than assume, that the grants and revocations above landed.
DO $$
DECLARE
  leaked  text;
  missing text;
BEGIN
  SELECT string_agg(format('%s:%s/%s', grantee, table_name, privilege_type), ', ')
    INTO leaked
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND (
       (grantee = 'anon')
       OR (grantee IN ('authenticated', 'service_role')
           AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER'))
       OR (grantee = 'authenticated'
           AND table_name = 'audit_log'
           AND privilege_type <> 'SELECT')
       OR (grantee = 'service_role'
           AND table_name = 'audit_log'
           AND privilege_type NOT IN ('SELECT', 'INSERT'))
     );

  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected grants remain: %', leaked;
  END IF;

  -- The inverse check. Audit writes fail silently by design (an audit write
  -- must never break the request it describes), so a missing INSERT here
  -- would otherwise show up only as a quietly empty audit log.
  SELECT string_agg(t.relname, ', ')
    INTO missing
    FROM pg_class t
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = 'public' AND t.relkind = 'r'
     AND NOT has_table_privilege('service_role', t.oid, 'INSERT');

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'service_role is missing INSERT on: %', missing;
  END IF;
END $$;

-- This assertion is intentionally the last statement in the last migration:
-- it is the check that every table added from here on stays behind RLS.
DO $$
DECLARE
  unprotected text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO unprotected
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND NOT c.relrowsecurity;

  IF unprotected IS NOT NULL THEN
    RAISE EXCEPTION 'Tables in public without RLS enabled: %', unprotected;
  END IF;
END $$;
