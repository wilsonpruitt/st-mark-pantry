import { db } from '@/db/database'
import fy2026 from '@/data/fpl/FY2026.json'
import txConfig from '@/data/states/TX.json'

export type FPLRegion = 'contiguous' | 'alaska' | 'hawaii'

export interface FPLTable {
  year: string
  region: FPLRegion
  effectiveFrom: string
  source?: string
  thresholds: Record<string, number>
  perAdditionalPerson: number
}

export interface StateConfig {
  state: string
  name: string
  fplMultiplier: number
  fplYear: string
  tefapAdministrator?: string
  categoricalPrograms: string[]
  categoricalProgramsVerified: boolean
  stateAgencyUrl?: string
  notes?: string
}

const BUNDLED_FPL: FPLTable[] = [fy2026 as FPLTable]
const BUNDLED_STATES: Record<string, StateConfig> = {
  TX: txConfig as StateConfig,
}

// Bump when bundled compliance data changes so ensureSeedData re-applies it
// after a PWA update without requiring the user to clear storage.
const SEED_VERSION = '2026-05-15.1'
const SEED_VERSION_KEY = 'pantry-seed-version'

/**
 * Loads bundled FPL tables into Dexie. Runs on first launch and after every
 * app update (version-keyed). Idempotent and offline — data is bundled, not
 * fetched. State configs stay static (see getStateConfig); only FPL is stored
 * because reports query it by year/region.
 */
export async function ensureSeedData(): Promise<void> {
  const seeded = localStorage.getItem(SEED_VERSION_KEY)
  if (seeded === SEED_VERSION) return

  await db.fplTables.bulkPut(BUNDLED_FPL)
  localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION)
}

export function getStateConfig(state: string): StateConfig | undefined {
  return BUNDLED_STATES[state.toUpperCase()]
}

export async function getFplTable(
  year: string,
  region: FPLRegion = 'contiguous',
): Promise<FPLTable | undefined> {
  return db.fplTables.get([year, region])
}

/**
 * Annual poverty threshold for a household of `size` under the given table.
 * Sizes beyond 8 extrapolate via perAdditionalPerson, per the HHS guidelines.
 */
export function povertyThreshold(table: FPLTable, size: number): number {
  if (size < 1) return 0
  if (size <= 8) return table.thresholds[String(size)]
  return table.thresholds['8'] + (size - 8) * table.perAdditionalPerson
}

/** Income eligibility ceiling = poverty threshold × state FPL multiplier. */
export function incomeEligibilityLimit(
  table: FPLTable,
  size: number,
  fplMultiplier: number,
): number {
  return Math.round(povertyThreshold(table, size) * fplMultiplier)
}
