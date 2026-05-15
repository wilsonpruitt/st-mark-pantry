import { describe, it, expect } from 'vitest'
import {
  ageOnDate,
  ageBucket,
  generateMonthlyReport,
} from './monthly-report'
import type { Client, Visit } from '@/types'

function client(p: Partial<Client> & { id: string }): Client {
  return {
    firstName: 'Head',
    lastName: 'Household',
    address: { street: '', city: '', state: 'TX', zip: '' },
    familyMembers: [],
    numberInFamily: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...p,
  }
}

function visit(clientId: string, date: string, id = `${clientId}-${date}`): Visit {
  return {
    id,
    clientId,
    date,
    dayOfWeek: 'Saturday',
    checkedInAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
  }
}

describe('ageOnDate', () => {
  it('is evaluated as-of the given date, not today', () => {
    // Born 2000-06-15. On 2018-06-14 still 17; on 2018-06-15 turns 18.
    expect(ageOnDate('2000-06-15', '2018-06-14')).toBe(17)
    expect(ageOnDate('2000-06-15', '2018-06-15')).toBe(18)
    expect(ageOnDate('2000-06-15', '2018-06-16')).toBe(18)
  })

  it('handles year/month boundaries', () => {
    expect(ageOnDate('2006-01-01', '2023-12-31')).toBe(17)
    expect(ageOnDate('2006-01-01', '2024-01-01')).toBe(18)
  })

  it('handles a Feb-29 birthday in a non-leap year (birthday effective Mar 1)', () => {
    expect(ageOnDate('2004-02-29', '2025-02-28')).toBe(20)
    expect(ageOnDate('2004-02-29', '2025-03-01')).toBe(21)
  })

  it('ignores any time component on the dates', () => {
    expect(ageOnDate('1960-03-10', '2026-03-10T23:59:59.000Z')).toBe(66)
  })
})

describe('ageBucket boundaries', () => {
  it('splits exactly at 18 and 60', () => {
    expect(ageBucket(0)).toBe('<18')
    expect(ageBucket(17)).toBe('<18')
    expect(ageBucket(18)).toBe('18-59')
    expect(ageBucket(59)).toBe('18-59')
    expect(ageBucket(60)).toBe('60+')
    expect(ageBucket(95)).toBe('60+')
  })
})

describe('generateMonthlyReport — as-of-visit-date bucketing', () => {
  it('moves a person across buckets when a birthday falls between two visits in the same month', () => {
    // Child turns 18 on 2026-03-15. Two March visits straddle the birthday.
    const c = client({
      id: 'h1',
      dateOfBirth: undefined, // head age unknown (standalone)
      numberInFamily: 2,
      familyMembers: [{ name: 'Kid', dateOfBirth: '2008-03-15' }],
    })
    const visits = [
      visit('h1', '2026-03-07'), // kid is 17 → <18
      visit('h1', '2026-03-21'), // kid is 18 → 18-59
    ]

    const r = generateMonthlyReport(visits, [c], 2026, 3)

    // 2 visits × 2 people = 4 person-visit slots.
    // Head has no DOB → unknownAge on both visits = 2.
    // Kid: visit 1 <18, visit 2 18-59.
    expect(r.totalVisits).toBe(2)
    expect(r.uniqueHouseholds).toBe(1)
    expect(r.totalIndividualVisits).toBe(4)
    expect(r.ageBuckets['<18']).toBe(1)
    expect(r.ageBuckets['18-59']).toBe(1)
    expect(r.ageBuckets.unknownAge).toBe(2)
    expect(r.missingDobCount).toBe(2)
  })

  it('moves a senior into 60+ on the visit after their 60th birthday', () => {
    const c = client({
      id: 'h2',
      dateOfBirth: '1966-04-20',
      familyMembers: [],
    })
    const visits = [
      visit('h2', '2026-04-10'), // 59 → 18-59
      visit('h2', '2026-04-25'), // 60 → 60+
    ]
    const r = generateMonthlyReport(visits, [c], 2026, 4)
    expect(r.ageBuckets['18-59']).toBe(1)
    expect(r.ageBuckets['60+']).toBe(1)
    expect(r.ageBuckets.unknownAge).toBe(0)
  })

  it('does not use report-generation time — old visits bucket by their own date', () => {
    // Person born 2010-01-01. A 2026 visit → age 16 (<18), regardless of
    // when this report runs.
    const c = client({ id: 'h3', dateOfBirth: '2010-01-01' })
    const r = generateMonthlyReport([visit('h3', '2026-02-05')], [c], 2026, 2)
    expect(r.ageBuckets['<18']).toBe(1)
  })

  it('flags estimated DOB and counts missing DOB', () => {
    const c = client({
      id: 'h4',
      dateOfBirth: undefined,
      numberInFamily: 2,
      familyMembers: [
        { name: 'Spouse', dateOfBirth: '1980-01-01', dobEstimated: true },
      ],
    })
    const r = generateMonthlyReport([visit('h4', '2026-05-02')], [c], 2026, 5)
    expect(r.householdsWithEstimatedDob).toBe(1)
    expect(r.ageBuckets['18-59']).toBe(1) // spouse, estimated but bucketed
    expect(r.ageBuckets.unknownAge).toBe(1) // head, no DOB
    expect(r.missingDobCount).toBe(1)
  })

  it('excludes visits outside the month and unknown clients', () => {
    const c = client({ id: 'h5', dateOfBirth: '1990-06-01' })
    const visits = [
      visit('h5', '2026-06-15'),
      visit('h5', '2026-07-01'), // next month — excluded
      visit('ghost', '2026-06-20'), // no matching client — skipped
    ]
    const r = generateMonthlyReport(visits, [c], 2026, 6)
    expect(r.totalVisits).toBe(1)
    expect(r.uniqueHouseholds).toBe(1)
    expect(r.ageBuckets['18-59']).toBe(1)
  })
})
