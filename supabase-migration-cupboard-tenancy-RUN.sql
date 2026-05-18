-- Cupboard tenancy migration — guided run for the Supabase SQL Editor.
-- Project: oghneyjipbhyiffihewo (LIVE St. Mark, Cloud-synced — handle with care).
-- Run STEP 1, copy the output back. Then run STEP 2, copy that output back.

-- ============================================================
-- STEP 1 — PRE-FLIGHT SNAPSHOT (run alone first, save the result)
-- ============================================================
SELECT 'pantry_clients'          AS tbl, count(*) AS rows FROM pantry_clients
UNION ALL SELECT 'pantry_visits',           count(*) FROM pantry_visits
UNION ALL SELECT 'pantry_volunteer_shifts', count(*) FROM pantry_volunteer_shifts
UNION ALL SELECT 'volunteers',              count(*) FROM volunteers
UNION ALL SELECT 'signups',                 count(*) FROM signups
UNION ALL SELECT 'report_recipients',       count(*) FROM report_recipients
ORDER BY tbl;


-- ============================================================
-- STEP 2 — MIGRATION + POST-FLIGHT VERIFY (run as one block)
-- ============================================================

-- 1. Tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  gate_password TEXT,
  compliance_mode TEXT NOT NULL DEFAULT 'standalone',
  intake_modes JSONB NOT NULL DEFAULT '["household"]'::jsonb,
  distributions JSONB NOT NULL DEFAULT '["groceries"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tenant members
CREATE TABLE IF NOT EXISTS tenant_members (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_id ON tenant_members (tenant_id);

-- 3. Seed St. Mark as tenant zero
INSERT INTO tenants (slug, name, gate_password)
  VALUES ('stmark', 'St. Mark Legacy Food Pantry', 'stmark')
  ON CONFLICT (slug) DO NOTHING;

-- 4. Add tenant_id to all domain tables, backfill to St. Mark, enforce NOT NULL
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
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)', tbl);
    EXECUTE format('UPDATE %I SET tenant_id = $1 WHERE tenant_id IS NULL', tbl) USING stmark_id;
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tenant_id ON %I (tenant_id)', tbl, tbl);
  END LOOP;
END $$;

-- 5. RLS on new tables only (existing pantry_* RLS untouched; sync uses service key)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read own memberships" ON tenant_members;
CREATE POLICY "members read own memberships"
  ON tenant_members FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "members read own tenants" ON tenants;
CREATE POLICY "members read own tenants"
  ON tenants FOR SELECT
  USING (id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

-- 6. POST-FLIGHT VERIFICATION (final SELECT — this is the output that matters)
SELECT t.tbl,
       t.total,
       t.null_tenant,                              -- must be 0 for every row
       t.stmark_rows                               -- should equal total
FROM (
  SELECT 'pantry_clients' AS tbl, count(*) AS total,
         count(*) FILTER (WHERE tenant_id IS NULL) AS null_tenant,
         count(*) FILTER (WHERE tenant_id = (SELECT id FROM tenants WHERE slug='stmark')) AS stmark_rows
    FROM pantry_clients
  UNION ALL SELECT 'pantry_visits', count(*),
         count(*) FILTER (WHERE tenant_id IS NULL),
         count(*) FILTER (WHERE tenant_id = (SELECT id FROM tenants WHERE slug='stmark'))
    FROM pantry_visits
  UNION ALL SELECT 'pantry_volunteer_shifts', count(*),
         count(*) FILTER (WHERE tenant_id IS NULL),
         count(*) FILTER (WHERE tenant_id = (SELECT id FROM tenants WHERE slug='stmark'))
    FROM pantry_volunteer_shifts
  UNION ALL SELECT 'volunteers', count(*),
         count(*) FILTER (WHERE tenant_id IS NULL),
         count(*) FILTER (WHERE tenant_id = (SELECT id FROM tenants WHERE slug='stmark'))
    FROM volunteers
  UNION ALL SELECT 'signups', count(*),
         count(*) FILTER (WHERE tenant_id IS NULL),
         count(*) FILTER (WHERE tenant_id = (SELECT id FROM tenants WHERE slug='stmark'))
    FROM signups
  UNION ALL SELECT 'report_recipients', count(*),
         count(*) FILTER (WHERE tenant_id IS NULL),
         count(*) FILTER (WHERE tenant_id = (SELECT id FROM tenants WHERE slug='stmark'))
    FROM report_recipients
) t
ORDER BY t.tbl;
