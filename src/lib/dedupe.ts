// Client de-duplication: strict detection + keeper/auto-fill merge.
//
// Detection is conservative on purpose (the user reviews every pair before
// anything is written): a candidate requires an exact normalized full-name
// match AND a shared phone or date of birth. The merge reassigns the
// duplicate's visits to the keeper, fills the keeper's blanks from the
// duplicate, then deletes the now-visitless duplicate — all through the
// existing enqueue() path so it stays correct across the Chromebook + cloud.

import { db } from '@/db/database'
import { enqueue } from '@/lib/sync-queue'
import type { Client, FamilyMember } from '@/types'

export function normName(s: string | undefined): string {
  return (s ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function normPhone(p: string | undefined): string {
  return (p ?? '').replace(/\D/g, '')
}

function nameKey(c: Client): string {
  return `${normName(c.firstName)} ${normName(c.lastName)}`
}

// Strict: within an identical-name bucket, link records that share a
// non-empty phone or a non-empty exact date of birth (union-find), and
// return only the resulting components with 2+ members.
export function findDuplicateGroups(clients: Client[]): Client[][] {
  const byName = new Map<string, Client[]>()
  for (const c of clients) {
    const k = nameKey(c)
    const arr = byName.get(k)
    if (arr) arr.push(c)
    else byName.set(k, [c])
  }

  const groups: Client[][] = []
  for (const bucket of byName.values()) {
    if (bucket.length < 2) continue

    const parent = bucket.map((_, i) => i)
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]]
        i = parent[i]
      }
      return i
    }
    const union = (a: number, b: number) => {
      parent[find(a)] = find(b)
    }

    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i]
        const b = bucket[j]
        const phoneA = normPhone(a.phone)
        const phoneB = normPhone(b.phone)
        const sharePhone = phoneA.length > 0 && phoneA === phoneB
        const shareDob = !!a.dateOfBirth && a.dateOfBirth === b.dateOfBirth
        if (sharePhone || shareDob) union(i, j)
      }
    }

    const comps = new Map<number, Client[]>()
    for (let i = 0; i < bucket.length; i++) {
      const r = find(i)
      const arr = comps.get(r)
      if (arr) arr.push(bucket[i])
      else comps.set(r, [bucket[i]])
    }
    for (const comp of comps.values()) {
      if (comp.length >= 2) {
        comp.sort((x, y) => x.createdAt.localeCompare(y.createdAt))
        groups.push(comp)
      }
    }
  }
  return groups
}

// Stable identity for a group (sorted ids) — used to remember dismissals.
export function groupKey(group: Client[]): string {
  return group
    .map((c) => c.id)
    .slice()
    .sort()
    .join('|')
}

function mergeFamily(keeper: FamilyMember[], dup: FamilyMember[]): FamilyMember[] {
  const seen = new Set<string>()
  const out: FamilyMember[] = []
  for (const m of [...keeper, ...dup]) {
    const k = `${normName(m.name)} ${m.dateOfBirth ?? ''}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(m)
  }
  return out
}

// Pure: keeper's values win; its blanks are filled from the duplicate.
export function mergeClientData(keeper: Client, dup: Client): Client {
  const addr = { ...keeper.address }
  for (const f of ['street', 'city', 'state', 'zip'] as const) {
    if (!addr[f]?.trim() && dup.address?.[f]?.trim()) addr[f] = dup.address[f]
  }

  const notes = [keeper.notes?.trim(), dup.notes?.trim()]
    .filter((n): n is string => !!n)
    .filter((n, i, a) => a.indexOf(n) === i)
    .join(' — ')

  const familyMembers = mergeFamily(keeper.familyMembers ?? [], dup.familyMembers ?? [])

  return {
    ...keeper,
    phone: keeper.phone?.trim() || dup.phone || undefined,
    email: keeper.email?.trim() || dup.email || undefined,
    dateOfBirth: keeper.dateOfBirth || dup.dateOfBirth,
    acceptsPerishables: keeper.acceptsPerishables ?? dup.acceptsPerishables,
    tefap: keeper.tefap ?? dup.tefap,
    address: addr,
    notes: notes || undefined,
    familyMembers,
    numberInFamily: 1 + familyMembers.length,
    updatedAt: new Date().toISOString(),
  }
}

// Reassign the duplicate's visits to the keeper, write the merged keeper,
// then delete the (now visitless) duplicate. Each step enqueues its sync
// mutation. Order matters: visits first so the duplicate has none when it
// is deleted (otherwise the cascade would drop real visits).
export async function mergeClients(keeperId: string, dupId: string): Promise<void> {
  const keeper = await db.clients.get(keeperId)
  const dup = await db.clients.get(dupId)
  if (!keeper || !dup) throw new Error('Client not found')

  const now = new Date().toISOString()
  const movedVisits = await db.visits.where('clientId').equals(dupId).toArray()
  const merged = mergeClientData(keeper, dup)

  await db.transaction('rw', [db.clients, db.visits], async () => {
    for (const v of movedVisits) {
      await db.visits.put({ ...v, clientId: keeperId, updatedAt: now })
    }
    await db.clients.put(merged)
    await db.clients.delete(dupId)
  })

  for (const v of movedVisits) {
    const updated = await db.visits.get(v.id)
    if (updated) {
      await enqueue('visits', v.id, 'upsert', updated as unknown as Record<string, unknown>)
    }
  }
  await enqueue('clients', keeperId, 'upsert', merged as unknown as Record<string, unknown>)
  await enqueue('clients', dupId, 'delete')
}
