import type { Client, Visit } from '@/types'

export type AgeBucket = '<18' | '18-59' | '60+'

function parseYMD(s: string): [number, number, number] {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return [y, m, d]
}

/**
 * Whole years old on `onDate` (both args 'YYYY-MM-DD'). Parsed as plain
 * calendar parts — never via Date — so timezone never shifts the result.
 * This is the compliance-critical primitive: age is always evaluated
 * as-of the visit date, never as-of report-generation time.
 */
export function ageOnDate(dob: string, onDate: string): number {
  const [by, bm, bd] = parseYMD(dob)
  const [yy, ym, yd] = parseYMD(onDate)
  let age = yy - by
  if (ym < bm || (ym === bm && yd < bd)) age -= 1
  return age
}

export function ageBucket(age: number): AgeBucket {
  if (age < 18) return '<18'
  if (age < 60) return '18-59'
  return '60+'
}

export interface AgeTally {
  '<18': number
  '18-59': number
  '60+': number
  unknownAge: number
}

export interface MonthlyReport {
  year: number
  month: number // 1-12
  monthLabel: string
  totalVisits: number
  uniqueHouseholds: number
  totalIndividualVisits: number
  /** Visit-weighted: every person is re-bucketed on each visit's own date. */
  ageBuckets: AgeTally
  /** Households served whose roster includes an estimated (age-derived) DOB. */
  householdsWithEstimatedDob: number
  /** Person-visit slots with no DOB on file (pre-migration / not collected). */
  missingDobCount: number
}

function emptyTally(): AgeTally {
  return { '<18': 0, '18-59': 0, '60+': 0, unknownAge: 0 }
}

function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}

/**
 * Standalone-mode monthly report. Pure: takes the visit/client arrays (not the
 * db) so it is unit-testable without IndexedDB. Each person is bucketed by
 * their age **on the date of each visit**, so a birthday crossing 18 or 60
 * within the month moves the person between buckets across visits in the same
 * report — see monthly-report.test.ts.
 */
export function generateMonthlyReport(
  visits: Visit[],
  clients: Client[],
  year: number,
  month: number, // 1-12
): MonthlyReport {
  const mm = String(month).padStart(2, '0')
  const prefix = `${year}-${mm}`
  const clientById = new Map(clients.map((c) => [c.id, c]))

  const monthVisits = visits.filter((v) => v.date.startsWith(prefix))
  const households = new Set<string>()
  const householdsEstDob = new Set<string>()
  const ageBuckets = emptyTally()
  let totalVisits = 0
  let totalIndividualVisits = 0
  let missingDobCount = 0

  for (const v of monthVisits) {
    const client = clientById.get(v.clientId)
    if (!client) continue // orphaned visit (client deleted) — not counted
    totalVisits += 1
    households.add(client.id)

    const people: Array<{ dob?: string; estimated?: boolean }> = [
      { dob: client.dateOfBirth },
      ...(client.familyMembers ?? []).map((m) => ({
        dob: m.dateOfBirth,
        estimated: m.dobEstimated,
      })),
    ]
    totalIndividualVisits += people.length

    for (const p of people) {
      if (p.estimated) householdsEstDob.add(client.id)
      if (!p.dob) {
        ageBuckets.unknownAge += 1
        missingDobCount += 1
        continue
      }
      ageBuckets[ageBucket(ageOnDate(p.dob, v.date))] += 1
    }
  }

  return {
    year,
    month,
    monthLabel: monthLabel(year, month),
    totalVisits,
    uniqueHouseholds: households.size,
    totalIndividualVisits,
    ageBuckets,
    householdsWithEstimatedDob: householdsEstDob.size,
    missingDobCount,
  }
}
