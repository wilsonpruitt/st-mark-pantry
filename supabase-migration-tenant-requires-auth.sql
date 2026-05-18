-- Cupboard #2: per-tenant Supabase-auth opt-in.
-- Project: oghneyjipbhyiffihewo. Run in the Supabase SQL Editor. Idempotent.
-- Default false => St. Mark (tenant zero) and every existing row are UNCHANGED;
-- only tenants explicitly flagged true require email-OTP login.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS requires_auth BOOLEAN NOT NULL DEFAULT false;

-- Verify: stmark must read false (no behavior change for the live pantry).
SELECT slug, name, plan, requires_auth FROM tenants ORDER BY created_at;
