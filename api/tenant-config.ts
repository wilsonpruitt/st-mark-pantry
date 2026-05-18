import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../lib/supabase.js';

// PUBLIC (pre-login) — returns only non-sensitive tenant flags so the client can
// decide whether to require Supabase auth before showing anything. Never returns
// gate_password or member data. Unknown slug => requiresAuth:false (fail-safe to
// the device gate, no lockout).

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const slug = String(req.query.slug ?? '').trim().toLowerCase();
  if (!slug || !SLUG_RE.test(slug)) {
    return res.status(400).json({ error: 'Invalid slug' });
  }

  try {
    const { data, error } = await getSupabase()
      .from('tenants')
      .select('slug, name, requires_auth, compliance_mode, intake_modes, distributions')
      .eq('slug', slug)
      .maybeSingle();

    const fallback = {
      slug,
      name: slug,
      requiresAuth: false,
      complianceMode: 'standalone',
      intakeModes: ['household'],
      distributions: ['groceries'],
    };

    if (error) {
      console.error('tenant-config query error:', error);
      // Fail safe: degrade to device gate rather than locking a pantry out.
      return res.status(200).json(fallback);
    }
    if (!data) {
      return res.status(200).json(fallback);
    }
    return res.status(200).json({
      slug: data.slug,
      name: data.name,
      requiresAuth: data.requires_auth === true,
      complianceMode: data.compliance_mode ?? 'standalone',
      intakeModes: Array.isArray(data.intake_modes) ? data.intake_modes : ['household'],
      distributions: Array.isArray(data.distributions) ? data.distributions : ['groceries'],
    });
  } catch (err) {
    console.error('tenant-config error:', err);
    return res.status(200).json({
      slug,
      name: slug,
      requiresAuth: false,
      complianceMode: 'standalone',
      intakeModes: ['household'],
      distributions: ['groceries'],
    });
  }
}
