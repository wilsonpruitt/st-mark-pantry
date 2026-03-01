-- Cloud Sync Migration: Create new tables + alter existing ones
-- Run this against the St. Mark Supabase project

-- 1. pantry_clients (mirrors Client type)
CREATE TABLE IF NOT EXISTS pantry_clients (
  id UUID PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  family_members JSONB NOT NULL DEFAULT '[]'::jsonb,
  number_in_family INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  accepts_perishables BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pantry_clients_updated_at ON pantry_clients (updated_at);

-- 2. pantry_visits (mirrors Visit type)
CREATE TABLE IF NOT EXISTS pantry_visits (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES pantry_clients(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  day_of_week TEXT NOT NULL,
  items_received TEXT,
  served_by TEXT,
  notes TEXT,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pantry_visits_updated_at ON pantry_visits (updated_at);
CREATE INDEX IF NOT EXISTS idx_pantry_visits_client_id ON pantry_visits (client_id);

-- 3. pantry_volunteer_shifts (mirrors VolunteerShift type)
CREATE TABLE IF NOT EXISTS pantry_volunteer_shifts (
  id UUID PRIMARY KEY,
  volunteer_id UUID NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  day_of_week TEXT NOT NULL,
  hours_worked NUMERIC,
  role TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pantry_volunteer_shifts_updated_at ON pantry_volunteer_shifts (updated_at);

-- 4. ALTER volunteers — add updated_at and deleted_at
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_volunteers_updated_at ON volunteers (updated_at);

-- 5. ALTER signups — add updated_at and deleted_at
ALTER TABLE signups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE signups ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_signups_updated_at ON signups (updated_at);
