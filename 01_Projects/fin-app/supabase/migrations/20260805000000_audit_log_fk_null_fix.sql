-- ═══════════════════════════════════════════════════════════════════════
-- Fix: audit_log's append-only trigger blocked its own foreign keys.
--
-- audit_log.actor_id and audit_log.tenant_id are both
-- `REFERENCES ... ON DELETE SET NULL` (20260804000000_auth_hardening.sql:204-205)
-- — deleting a user or tenant is supposed to anonymise their audit rows
-- rather than cascade-delete history. But the append-only trigger installed
-- in that same migration raises on EVERY UPDATE unconditionally, including
-- the UPDATE Postgres issues internally to perform that SET NULL. The result:
-- deleting a user whose actions appear in audit_log fails outright, which
-- means the actual account-deletion path (delete-user-account) was broken.
--
-- The two FKs fire independently, not together: deleting a user nulls only
-- actor_id (the row's tenant_id is untouched, since the tenant itself is not
-- deleted); deleting a tenant nulls only tenant_id. A first version of this
-- fix required BOTH to go null in the same statement, which matched neither
-- real case and still blocked the delete. Each column is now evaluated on
-- its own: either unchanged, or moving from non-null to null.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.audit_log_is_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor_ok  boolean;
  tenant_ok boolean;
  any_nulled boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    actor_ok  := (NEW.actor_id  IS NOT DISTINCT FROM OLD.actor_id)
              OR (OLD.actor_id  IS NOT NULL AND NEW.actor_id  IS NULL);
    tenant_ok := (NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id)
              OR (OLD.tenant_id IS NOT NULL AND NEW.tenant_id IS NULL);
    any_nulled := (OLD.actor_id IS NOT NULL AND NEW.actor_id IS NULL)
               OR (OLD.tenant_id IS NOT NULL AND NEW.tenant_id IS NULL);

    IF actor_ok AND tenant_ok AND any_nulled
       AND OLD.id = NEW.id
       AND OLD.occurred_at = NEW.occurred_at
       AND OLD.action = NEW.action
       AND OLD.target_type IS NOT DISTINCT FROM NEW.target_type
       AND OLD.target_id IS NOT DISTINCT FROM NEW.target_id
       AND OLD.ip IS NOT DISTINCT FROM NEW.ip
       AND OLD.user_agent IS NOT DISTINCT FROM NEW.user_agent
       AND OLD.metadata = NEW.metadata
    THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'audit_log is append-only (attempted %)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

-- Grants are unchanged: authenticated/service_role still hold no UPDATE
-- privilege on audit_log at all (revoked in 20260804000000_auth_hardening.sql).
-- A privileged caller attempting this UPDATE by hand is rejected by the grant
-- before ever reaching this trigger — only the FK's own SET NULL action,
-- which runs independently of table grants, can take this path.
