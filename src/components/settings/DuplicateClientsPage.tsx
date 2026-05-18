import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Users, Check } from 'lucide-react'
import { db } from '@/db/database'
import { findDuplicateGroups, groupKey, mergeClients } from '@/lib/dedupe'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Client } from '@/types'

const DISMISS_KEY = 'pantry-dedupe-dismissed'

function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

export function DuplicateClientsPage() {
  const clients = useLiveQuery(() => db.clients.toArray(), [])
  const visits = useLiveQuery(() => db.visits.toArray(), [])
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [keeperByGroup, setKeeperByGroup] = useState<Record<string, string>>({})

  const visitCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const v of visits ?? []) m.set(v.clientId, (m.get(v.clientId) ?? 0) + 1)
    return m
  }, [visits])

  const groups = useMemo(() => {
    if (!clients) return []
    return findDuplicateGroups(clients).filter((g) => !dismissed.has(groupKey(g)))
  }, [clients, dismissed])

  function persistDismissed(next: Set<string>) {
    setDismissed(next)
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...next]))
  }

  function defaultKeeper(group: Client[]): string {
    // Most visits wins; tie → earliest registered (group is createdAt-sorted).
    return [...group].sort(
      (a, b) => (visitCount.get(b.id) ?? 0) - (visitCount.get(a.id) ?? 0),
    )[0].id
  }

  async function handleMerge(group: Client[]) {
    const gKey = groupKey(group)
    const keeperId = keeperByGroup[gKey] ?? defaultKeeper(group)
    setBusyKey(gKey)
    try {
      for (const c of group) {
        if (c.id !== keeperId) await mergeClients(keeperId, c.id)
      }
    } finally {
      setBusyKey(null)
    }
  }

  if (!clients) {
    return <div className="p-4 text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div className="space-y-4">
      <Link
        to="/settings"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Settings
      </Link>

      <div>
        <h1 className="text-xl font-bold">Duplicate clients</h1>
        <p className="text-sm text-muted-foreground">
          Records with the same name and a shared phone or date of birth. Review each
          set, choose which record to keep, then merge. Visits move to the kept record;
          blank fields are filled in from the other.
        </p>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No likely duplicates found.
          </CardContent>
        </Card>
      ) : (
        groups.map((group) => {
          const gKey = groupKey(group)
          const keeperId = keeperByGroup[gKey] ?? defaultKeeper(group)
          const busy = busyKey === gKey
          return (
            <Card key={gKey}>
              <CardContent className="space-y-3 pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {group.map((c) => {
                    const isKeeper = c.id === keeperId
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setKeeperByGroup((p) => ({ ...p, [gKey]: c.id }))
                        }
                        className={`rounded-lg border p-3 text-left text-sm transition ${
                          isKeeper
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">
                            {c.firstName} {c.lastName}
                          </span>
                          {isKeeper && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                              <Check className="size-3" /> Keep
                            </span>
                          )}
                        </div>
                        <dl className="mt-1 space-y-0.5 text-muted-foreground">
                          <div>Phone: {c.phone || '—'}</div>
                          <div>DOB: {c.dateOfBirth || '—'}</div>
                          <div>
                            Address:{' '}
                            {[c.address?.street, c.address?.city]
                              .filter(Boolean)
                              .join(', ') || '—'}
                          </div>
                          <div>Visits: {visitCount.get(c.id) ?? 0}</div>
                          <div>Registered: {fmtDate(c.createdAt)}</div>
                        </dl>
                      </button>
                    )
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => handleMerge(group)} disabled={busy}>
                    {busy
                      ? 'Merging…'
                      : `Merge ${group.length} into kept record`}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      const next = new Set(dismissed)
                      next.add(gKey)
                      persistDismissed(next)
                    }}
                  >
                    Not duplicates
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })
      )}

      {dismissed.size > 0 && (
        <button
          type="button"
          onClick={() => persistDismissed(new Set())}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Users className="size-3" /> Reset {dismissed.size} dismissed set
          {dismissed.size === 1 ? '' : 's'}
        </button>
      )}
    </div>
  )
}
