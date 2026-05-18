import { describe, it, expect } from 'vitest'
import { findDuplicateGroups, mergeClientData, normName } from './dedupe'
import type { Client } from '@/types'

function client(p: Partial<Client> & { id: string; firstName: string; lastName: string }): Client {
  return {
    phone: undefined,
    email: undefined,
    address: { street: '', city: '', state: '', zip: '' },
    familyMembers: [],
    numberInFamily: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...p,
  }
}

describe('normName', () => {
  it('lowercases, trims, strips punctuation and diacritics', () => {
    expect(normName('  José  ')).toBe('jose')
    expect(normName("O'Brien")).toBe('o brien')
    expect(normName('JOHN')).toBe(normName('john'))
  })
})

describe('findDuplicateGroups (strict)', () => {
  it('flags same name + same phone (different formatting)', () => {
    const g = findDuplicateGroups([
      client({ id: 'a', firstName: 'Maria', lastName: 'Lopez', phone: '(512) 555-0142' }),
      client({ id: 'b', firstName: 'maria', lastName: 'LOPEZ', phone: '5125550142' }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].map((c) => c.id).sort()).toEqual(['a', 'b'])
  })

  it('flags same name + same DOB with no phone', () => {
    const g = findDuplicateGroups([
      client({ id: 'a', firstName: 'Sam', lastName: 'Lee', dateOfBirth: '1990-04-02' }),
      client({ id: 'b', firstName: 'Sam', lastName: 'Lee', dateOfBirth: '1990-04-02' }),
    ])
    expect(g).toHaveLength(1)
  })

  it('does NOT flag same name alone (no shared phone or DOB)', () => {
    const g = findDuplicateGroups([
      client({ id: 'a', firstName: 'John', lastName: 'Smith', phone: '111' }),
      client({ id: 'b', firstName: 'John', lastName: 'Smith', phone: '222' }),
    ])
    expect(g).toHaveLength(0)
  })

  it('does NOT flag different names even with same phone', () => {
    const g = findDuplicateGroups([
      client({ id: 'a', firstName: 'John', lastName: 'Smith', phone: '555' }),
      client({ id: 'b', firstName: 'Jane', lastName: 'Doe', phone: '555' }),
    ])
    expect(g).toHaveLength(0)
  })

  it('unions a 3-way group through a transitive shared signal', () => {
    const g = findDuplicateGroups([
      client({ id: 'a', firstName: 'Ann', lastName: 'Kim', phone: '700' }),
      client({ id: 'b', firstName: 'Ann', lastName: 'Kim', phone: '700', dateOfBirth: '1980-01-01' }),
      client({ id: 'c', firstName: 'Ann', lastName: 'Kim', dateOfBirth: '1980-01-01' }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0]).toHaveLength(3)
  })

  it('ignores empty phone strings as a match signal', () => {
    const g = findDuplicateGroups([
      client({ id: 'a', firstName: 'Pat', lastName: 'Ng', phone: '' }),
      client({ id: 'b', firstName: 'Pat', lastName: 'Ng', phone: '' }),
    ])
    expect(g).toHaveLength(0)
  })
})

describe('mergeClientData (keeper + auto-fill)', () => {
  const keeper = client({
    id: 'k',
    firstName: 'Maria',
    lastName: 'Lopez',
    phone: '5125550142',
    familyMembers: [{ name: 'Sofia', dateOfBirth: '2017-01-01' }],
    notes: 'prefers Saturday',
  })
  const dup = client({
    id: 'd',
    firstName: 'Maria',
    lastName: 'Lopez',
    email: 'maria@example.org',
    dateOfBirth: '1990-05-05',
    address: { street: '1 Main', city: 'Austin', state: 'TX', zip: '78704' },
    familyMembers: [
      { name: 'Sofia', dateOfBirth: '2017-01-01' },
      { name: 'Mateo', dateOfBirth: '2020-02-02' },
    ],
    notes: 'no pork',
    tefap: { lastCertifiedAt: 'x', certifiedFor: 'FY2026', eligibilityBasis: { type: 'income-attestation' }, residencyConfirmed: true, signaturePng: '', signedByName: 'Maria', signedAt: 'x', signatureMethod: 'verbal-attestation' },
  })

  it('keeps keeper values, fills blanks from duplicate', () => {
    const m = mergeClientData(keeper, dup)
    expect(m.phone).toBe('5125550142') // keeper wins
    expect(m.email).toBe('maria@example.org') // filled from dup
    expect(m.dateOfBirth).toBe('1990-05-05') // filled from dup
    expect(m.address.city).toBe('Austin') // filled from dup
    expect(m.tefap?.certifiedFor).toBe('FY2026') // filled from dup
  })

  it('unions family members and recomputes numberInFamily', () => {
    const m = mergeClientData(keeper, dup)
    expect(m.familyMembers).toHaveLength(2) // Sofia deduped
    expect(m.numberInFamily).toBe(3)
  })

  it('concatenates distinct notes', () => {
    const m = mergeClientData(keeper, dup)
    expect(m.notes).toBe('prefers Saturday — no pork')
  })

  it('keeps keeper id and bumps updatedAt', () => {
    const m = mergeClientData(keeper, dup)
    expect(m.id).toBe('k')
    expect(Date.parse(m.updatedAt)).toBeGreaterThan(Date.parse('2026-01-01T00:00:00.000Z'))
  })
})
