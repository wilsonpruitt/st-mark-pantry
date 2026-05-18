-- Cupboard waitlist persistence: cupboard_interest table.
-- Project: oghneyjipbhyiffihewo. Run in the Supabase SQL Editor. Idempotent.
-- Not tenant-scoped: these are prospective tenants (pre-signup leads), no tenant_id.

CREATE TABLE IF NOT EXISTS cupboard_interest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  organization TEXT,
  program TEXT,
  notes TEXT,
  emailed BOOLEAN NOT NULL DEFAULT false,  -- did the Resend notification succeed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cupboard_interest_created_at ON cupboard_interest (created_at DESC);

-- Lock down: service key (used by the API route) bypasses RLS; with RLS on and
-- no policies, anon/authenticated clients cannot read these leads directly.
ALTER TABLE cupboard_interest ENABLE ROW LEVEL SECURITY;

-- Verify
SELECT count(*) AS rows FROM cupboard_interest;
