export type ComplianceMode = 'standalone' | 'tefap'
export type IntakeMode = 'household' | 'anonymous-count'
export type Distribution = 'groceries' | 'prepared-meals'

export interface PantrySettings {
  // Pantry identity (drives report headers + state-based FPL lookup)
  pantryName: string
  state: string

  // Product mode toggles (set during onboarding, changeable here)
  complianceMode: ComplianceMode
  intakeModes: IntakeMode[]
  distributions: Distribution[]
  fplYear: string

  // Existing optional features (preserved)
  inventoryEnabled: boolean
  notificationsEnabled: boolean
}

export const DEFAULT_SETTINGS: PantrySettings = {
  pantryName: 'St. Mark Legacy Food Pantry',
  state: 'TX',
  complianceMode: 'standalone',
  intakeModes: ['household'],
  distributions: ['groceries'],
  fplYear: 'FY2026',
  inventoryEnabled: false,
  notificationsEnabled: false,
}

const STORAGE_KEY = 'pantry-settings'

export function loadSettings(): PantrySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
    }
  } catch {
    // ignore corrupt data
  }
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(settings: PantrySettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}
