// Reconcile a remote tenant's `tenants` row into local PantrySettings.
//
// Seed-once per tenant slug: on first load we map the tenant row onto local
// settings; afterward local is authoritative so an admin's Settings-page edits
// are never clobbered on reload. Tenant zero (St. Mark) never calls this — its
// local settings are untouched.

import type { TenantConfig } from './tenant'
import {
  loadSettings,
  saveSettings,
  type ComplianceMode,
  type IntakeMode,
  type Distribution,
} from './settings'

const seededKey = (slug: string) => `pantry-tenant-seeded:${slug}`

// DB vocabulary -> client enums (they intentionally differ).
function mapIntake(values: string[]): IntakeMode[] {
  const out: IntakeMode[] = []
  for (const v of values) {
    if (v === 'household') out.push('household')
    else if (v === 'anonymous' || v === 'anonymous-count') out.push('anonymous-count')
  }
  return out
}

function mapDistributions(values: string[]): Distribution[] {
  const out: Distribution[] = []
  for (const v of values) {
    if (v === 'groceries') out.push('groceries')
    else if (v === 'prepared_meals' || v === 'prepared-meals') out.push('prepared-meals')
  }
  return out
}

function mapCompliance(value: string): ComplianceMode {
  return value === 'tefap' ? 'tefap' : 'standalone'
}

export function maybeSeedSettingsFromTenant(cfg: TenantConfig): void {
  try {
    if (localStorage.getItem(seededKey(cfg.slug))) return // already seeded; local wins

    const s = loadSettings()
    s.pantryName = cfg.name || s.pantryName
    s.complianceMode = mapCompliance(cfg.complianceMode)

    const intake = mapIntake(cfg.intakeModes)
    if (intake.length > 0) s.intakeModes = intake

    const dist = mapDistributions(cfg.distributions)
    if (dist.length > 0) s.distributions = dist

    saveSettings(s)
    localStorage.setItem(seededKey(cfg.slug), new Date().toISOString())
  } catch {
    // Non-fatal: a storage failure must not block the app from loading.
  }
}
