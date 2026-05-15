import type { FamilyMember } from '@/types'

/**
 * Synthetic Jan-1 DOB for an age that was accurate as of `asOfYear`.
 * Used when only an age was collected (standalone intake) — flagged
 * dobEstimated so reports can surface the approximation.
 */
export function ageToDob(age: number, asOfYear: number): string {
  return `${asOfYear - age}-01-01`
}

/** Whole years between a DOB and a reference date (default: today). */
export function approxAgeFromDob(dob: string, ref: Date = new Date()): number {
  const birth = new Date(dob)
  let age = ref.getFullYear() - birth.getFullYear()
  const m = ref.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age -= 1
  return age
}

/**
 * Converts a legacy `{ age }` family member to the DOB-based shape.
 * Deterministic: the synthetic DOB is anchored to `asOfYear` (the year the
 * age was recorded), not to "now", so every device/sync path that runs this
 * on the same source record produces the same DOB. Idempotent.
 */
export function normalizeFamilyMember(
  raw: Record<string, unknown>,
  asOfYear: number,
): FamilyMember {
  const { age, ...rest } = raw as { age?: unknown } & Record<string, unknown>
  const member = rest as unknown as FamilyMember
  if (member.dateOfBirth == null && typeof age === 'number' && age >= 0) {
    member.dateOfBirth = ageToDob(age, asOfYear)
    member.dobEstimated = true
  }
  return member
}

/** Year an age was recorded, inferred from a record's timestamps. */
export function recordYear(record: { createdAt?: string; updatedAt?: string }): number {
  const stamp = record.createdAt || record.updatedAt
  const year = stamp ? new Date(stamp).getFullYear() : NaN
  return Number.isNaN(year) ? new Date().getFullYear() : year
}
