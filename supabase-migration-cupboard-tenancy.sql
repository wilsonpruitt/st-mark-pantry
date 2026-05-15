-- Cupboard multi-tenancy: tenants schema + backfill St. Mark as tenant zero.
-- Run against the st-mark-pantry Supabase project.
-- Safe to re-run: every step is idempotent.

-- 1. Tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  gate_password TEXT,
  compliance_mode TEXT NOT NULL DEFAULT 'standalone',  -- 'standalone' | 'tefap'
  intake_modes JSONB NOT NULL DEFAULT '["household"]'::jsonb,  -- ['household','anonymous']
  distributions JSONB NOT NULL DEFAULT '["groceries"]'::jsonb, -- ['groceries','prepared_meals']
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tenant members (user_id ↔ tenant_id, role)
CREATE TABLE IF NOT EXISTS tenant_members (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'staff',  -- 'admin' | 'staff'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_id ON tenant_members (tenant_id);

-- 3. Seed St. Mark as tenant zero
INSERT INTO tenants (slug, name, gate_password)
  VALUES ('stmark', 'St. Mark Legacy Food Pantry', 'stmark')
  ON CONFLICT (slug) DO NOTHING;

-- 4. Add tenant_id to all domain tables (nullable for now, backfill, then NOT NULL)
DO $$
DECLARE
  tbl TEXT;
  stmark_id UUID;
BEGIN
  SELECT id INTO stmark_id FROM tenants WHERE slug = 'stmark';
  IF stmark_id IS NULL THEN
    RAISE EXCEPTION 'stmark tenant not found — seed step failed';
  END IF;

  FOREACH tbl IN ARRAY ARRAY[
    'pantry_clients',
    'pantry_visits',
    'pantry_volunteer_shifts',
    'volunteers',
    'signups',
    'report_recipients'
  ]
  LOOP
    -- Add column if missing
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)', tbl);
    -- Backfill to St. Mark
    EXECUTE format('UPDATE %I SET tenant_id = $1 WHERE tenant_id IS NULL', tbl) USING stmark_id;
    -- Enforce NOT NULL
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', tbl);
    -- Index for tenant-scoped queries
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tenant_id ON %I (tenant_id)', tbl, tbl);
  END LOOP;
END $$;

-- 5. RLS on new tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;

-- Policy: a user can read their own tenant memberships
DROP POLICY IF EXISTS "members read own memberships" ON tenant_members;
CREATE POLICY "members read own memberships"
  ON tenant_members FOR SELECT
  USING (user_id = auth.uid());

-- Policy: a user can read tenants they belong to
DROP POLICY IF EXISTS "members read own tenants" ON tenants;
CREATE POLICY "members read own tenants"
  ON tenants FOR SELECT
  USING (id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

-- NOTE: existing RLS on pantry_* / volunteers / signups / report_recipients is NOT modified
-- in this migration. The app currently uses SUPABASE_SERVICE_KEY for sync (bypasses RLS), so
-- adding tenant_id without tightening per-tenant policies is safe — nothing breaks today.
-- A follow-up migration will add per-tenant RLS policies once the app starts authenticating
-- end-users (instead of using service key only).
