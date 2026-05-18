// Resolve the current Cupboard tenant from the host.
//
// Tenant zero (St. Mark) and all dev/preview hosts return null — these keep the
// original device-password-only flow with ZERO behavior change. Only a real
// `{slug}.cupboard.cc` host with slug !== 'stmark' is treated as a remote tenant
// that may require Supabase auth.

export function tenantSlugFromHost(host: string = window.location.hostname): string | null {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local')) return null;
  if (h.endsWith('.vercel.app')) return null;
  const m = h.match(/^([a-z0-9-]+)\.cupboard\.cc$/);
  if (!m) return null;
  const slug = m[1];
  if (slug === 'stmark' || slug === 'www') return null;
  return slug;
}

// Synchronous: true when this is tenant zero / dev / preview (no remote tenant).
// Used to short-circuit the auth gate with no network call and no render flash.
export function isTenantZero(host?: string): boolean {
  return tenantSlugFromHost(host) === null;
}

export interface TenantConfig {
  slug: string;
  name: string;
  requiresAuth: boolean;
  // Raw DB vocabulary ('anonymous', 'prepared_meals', …) — mapped to client
  // enums in tenant-settings.ts, not here.
  complianceMode: string;
  intakeModes: string[];
  distributions: string[];
}

// Fail-safe: any error / unknown tenant => requiresAuth false, so a misconfigured
// or not-yet-provisioned tenant degrades to the device gate rather than locking out.
export async function fetchTenantConfig(slug: string): Promise<TenantConfig> {
  try {
    const res = await fetch(`/api/tenant-config?slug=${encodeURIComponent(slug)}`);
    const safe: TenantConfig = {
      slug, name: slug, requiresAuth: false,
      complianceMode: 'standalone', intakeModes: ['household'], distributions: ['groceries'],
    };
    if (!res.ok) return safe;
    const data = (await res.json()) as Partial<TenantConfig>;
    return {
      slug,
      name: data.name ?? slug,
      requiresAuth: data.requiresAuth === true,
      complianceMode: data.complianceMode ?? 'standalone',
      intakeModes: Array.isArray(data.intakeModes) ? data.intakeModes : ['household'],
      distributions: Array.isArray(data.distributions) ? data.distributions : ['groceries'],
    };
  } catch {
    return {
      slug, name: slug, requiresAuth: false,
      complianceMode: 'standalone', intakeModes: ['household'], distributions: ['groceries'],
    };
  }
}
