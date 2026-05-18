// Isolated public demo mode for the marketing site (demo.cupboard.cc).
//
// The real PWA, but: device/Supabase gates bypassed, cloud sync OFF, and a
// fresh seeded sample dataset on every load. IndexedDB is per-origin so
// demo.cupboard.cc is naturally isolated from stmark.cupboard.cc and every
// real tenant — a visitor cannot touch production data. Tenant zero / St. Mark
// never enter this path.

import { db } from '@/db/database'
import { saveSettings, DEFAULT_SETTINGS } from '@/lib/settings'
import type { Client, Visit, Volunteer, VolunteerShift, PantryDay } from '@/types'

const DEMO_HOST = 'demo.cupboard.cc'
const AUTH_KEY = 'pantry-auth'

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname.toLowerCase()
  if (h === DEMO_HOST) return true
  // Dev affordance: ?demo=1 (sticky for the session) on localhost/preview only.
  const isLocalish = h === 'localhost' || h === '127.0.0.1' || h.endsWith('.vercel.app')
  if (!isLocalish) return false
  if (new URLSearchParams(window.location.search).get('demo') === '1') {
    sessionStorage.setItem('pantry-demo', '1')
  }
  return sessionStorage.getItem('pantry-demo') === '1'
}

// Fictional pantry shown throughout the demo (one place to rename it).
export const DEMO_PANTRY_NAME = 'Riverside Community Pantry'

// Synchronous demo priming — MUST run before React renders so SettingsProvider
// (which reads localStorage once at mount) and the header show the demo name
// from the first paint, not the real St. Mark name. Heavy Dexie reseed stays
// async in ensureDemoSeed(). No-op unless demo mode.
export function primeDemoEnv(): void {
  if (!isDemoMode()) return
  saveSettings({
    ...DEFAULT_SETTINGS,
    pantryName: DEMO_PANTRY_NAME,
    complianceMode: 'standalone',
  })
  localStorage.setItem(AUTH_KEY, 'true') // bypass the device gate (no server)
  document.title = DEMO_PANTRY_NAME
}

// Recent real Mon/Fri/Sat dates (the pantry's serving days), newest first.
function recentPantryDates(count: number): { date: string; dayOfWeek: PantryDay }[] {
  const map: Record<number, PantryDay> = { 1: 'Monday', 5: 'Friday', 6: 'Saturday' }
  const out: { date: string; dayOfWeek: PantryDay }[] = []
  const d = new Date()
  for (let i = 0; i < 120 && out.length < count; i++) {
    const day = map[d.getDay()]
    if (day) out.push({ date: d.toISOString().slice(0, 10), dayOfWeek: day })
    d.setDate(d.getDate() - 1)
  }
  return out
}

function iso(yearsAgo: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - yearsAgo)
  return d.toISOString().slice(0, 10)
}

function buildClients(): Client[] {
  const now = new Date().toISOString()
  const base = (
    firstName: string,
    lastName: string,
    city: string,
    family: Client['familyMembers'],
    extra: Partial<Client> = {},
  ): Client => ({
    id: crypto.randomUUID(),
    firstName,
    lastName,
    address: { street: '', city, state: 'TX', zip: '78704' },
    familyMembers: family,
    numberInFamily: family.length + 1,
    createdAt: now,
    updatedAt: now,
    ...extra,
  })

  return [
    base('Maria', 'Delgado', 'Austin', [
      { name: 'Sofia Delgado', relationship: 'Child', dateOfBirth: iso(9) },
      { name: 'Mateo Delgado', relationship: 'Child', dateOfBirth: iso(6) },
    ], { phone: '512-555-0142', dateOfBirth: iso(34) }),
    base('James', 'Carter', 'Austin', [], { phone: '512-555-0177', dateOfBirth: iso(67), acceptsPerishables: true }),
    base('Aaliyah', 'Brooks', 'Del Valle', [
      { name: 'Jordan Brooks', relationship: 'Child', dateOfBirth: iso(13) },
    ], { dateOfBirth: iso(29) }),
    base('Hong', 'Tran', 'Austin', [
      { name: 'Linh Tran', relationship: 'Spouse', dateOfBirth: iso(58) },
      { name: 'An Tran', relationship: 'Parent', dateOfBirth: iso(81) },
    ], { phone: '512-555-0103', dateOfBirth: iso(61) }),
    base('Robert', 'Nguyen', 'Austin', [], { dateOfBirth: iso(72), notes: 'Prefers Saturday pickup.' }),
    base('Tanya', 'Williams', 'Manor', [
      { name: 'Destiny Williams', relationship: 'Child', dateOfBirth: iso(4) },
      { name: 'Marcus Williams', relationship: 'Child', dateOfBirth: iso(2) },
    ], { phone: '512-555-0189', dateOfBirth: iso(31) }),
  ]
}

function buildVolunteers(): Volunteer[] {
  const now = new Date().toISOString()
  const v = (firstName: string, lastName: string, slots: string[]): Volunteer => ({
    id: crypto.randomUUID(),
    firstName,
    lastName,
    recurringSlots: slots,
    createdAt: now,
    updatedAt: now,
  })
  return [
    v('Susan', 'Park', ['every-Monday']),
    v('David', 'Okafor', ['every-Saturday']),
    v('Grace', 'Lin', ['1st-Friday', '3rd-Friday']),
  ]
}

export async function ensureDemoSeed(): Promise<void> {
  await db.open()

  // Fresh sandbox each load — clear domain data (keep bundled fplTables).
  await db.transaction(
    'rw',
    [db.clients, db.visits, db.volunteers, db.volunteerShifts, db.volunteerSignups, db.syncQueue],
    async () => {
      await Promise.all([
        db.clients.clear(),
        db.visits.clear(),
        db.volunteers.clear(),
        db.volunteerShifts.clear(),
        db.volunteerSignups.clear(),
        db.syncQueue.clear(),
      ])

      const clients = buildClients()
      const volunteers = buildVolunteers()
      const dates = recentPantryDates(8)
      const now = new Date().toISOString()

      const visits: Visit[] = []
      clients.forEach((c, ci) => {
        // Each client visited on a few of the recent serving days.
        dates.slice(0, 3 + (ci % 3)).forEach((d) => {
          visits.push({
            id: crypto.randomUUID(),
            clientId: c.id,
            date: d.date,
            dayOfWeek: d.dayOfWeek,
            checkedInAt: `${d.date}T15:30:00.000Z`,
            servedBy: volunteers[ci % volunteers.length].firstName,
            updatedAt: now,
          })
        })
      })

      const shifts: VolunteerShift[] = volunteers.flatMap((vol) =>
        dates.slice(0, 3).map((d) => ({
          id: crypto.randomUUID(),
          volunteerId: vol.id,
          date: d.date,
          dayOfWeek: d.dayOfWeek,
          hoursWorked: 3,
          updatedAt: now,
        })),
      )

      await db.clients.bulkAdd(clients)
      await db.visits.bulkAdd(visits)
      await db.volunteers.bulkAdd(volunteers)
      await db.volunteerShifts.bulkAdd(shifts)
    },
  )
  // Identity / gate bypass is handled synchronously by primeDemoEnv() in main.tsx.
}
