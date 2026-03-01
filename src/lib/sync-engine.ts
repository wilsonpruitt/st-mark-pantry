import { db } from '@/db/database';
import { getPending, removeBatch, pendingCount } from '@/lib/sync-queue';

export type SyncState = 'idle' | 'pushing' | 'pulling' | 'error';

export interface SyncStatus {
  state: SyncState;
  lastSyncAt: string | null;
  pendingCount: number;
  online: boolean;
  error?: string;
}

type Listener = () => void;

const LAST_SYNC_KEY = 'pantry-last-sync';
const SEEDED_KEY = 'pantry-cloud-seeded';

class SyncEngine {
  private status: SyncStatus = {
    state: 'idle',
    lastSyncAt: localStorage.getItem(LAST_SYNC_KEY),
    pendingCount: 0,
    online: navigator.onLine,
  };

  private listeners = new Set<Listener>();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private syncing = false;

  constructor() {
    window.addEventListener('online', () => {
      this.status = { ...this.status, online: true };
      this.notify();
      this.sync().catch(() => {});
    });

    window.addEventListener('offline', () => {
      this.status = { ...this.status, online: false };
      this.notify();
    });

    // Initialize pending count
    pendingCount().then((count) => {
      this.status = { ...this.status, pendingCount: count };
      this.notify();
    });
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = localStorage.getItem('pantry-api-key');
    if (apiKey) headers['x-api-key'] = apiKey;
    return headers;
  }

  async sync(): Promise<void> {
    if (this.syncing || !navigator.onLine) return;
    this.syncing = true;

    try {
      // One-time initial seed: push all local data on first sync
      if (!localStorage.getItem(SEEDED_KEY)) {
        await this.seedInitialData();
        localStorage.setItem(SEEDED_KEY, '1');
      }

      await this.push();
      await this.pull();

      const count = await pendingCount();
      this.status = {
        ...this.status,
        state: 'idle',
        pendingCount: count,
        error: undefined,
      };
      this.notify();
    } catch (err) {
      const count = await pendingCount().catch(() => 0);
      this.status = {
        ...this.status,
        state: 'error',
        pendingCount: count,
        error: err instanceof Error ? err.message : 'Sync failed',
      };
      this.notify();
    } finally {
      this.syncing = false;
    }
  }

  private async push(): Promise<void> {
    const entries = await getPending();
    if (entries.length === 0) return;

    this.status = { ...this.status, state: 'pushing' };
    this.notify();

    // Deduplicate: for same table+id, keep the latest entry
    const deduped = new Map<string, typeof entries[0]>();
    for (const entry of entries) {
      const key = `${entry.tableName}:${entry.recordId}`;
      deduped.set(key, entry);
    }

    const mutations = Array.from(deduped.values()).map((entry) => ({
      table: entry.tableName,
      id: entry.recordId,
      action: entry.action,
      payload: entry.payload,
    }));

    const res = await fetch('/api/sync/push', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ mutations }),
    });

    if (!res.ok) {
      throw new Error(`Push failed: ${res.status}`);
    }

    // Remove all processed entries
    const seqNos = entries.map((e) => e.seqNo!).filter(Boolean);
    if (seqNos.length > 0) {
      await removeBatch(seqNos);
    }
  }

  private async pull(): Promise<void> {
    this.status = { ...this.status, state: 'pulling' };
    this.notify();

    const since = this.status.lastSyncAt;
    const url = since
      ? `/api/sync/pull?since=${encodeURIComponent(since)}`
      : '/api/sync/pull';

    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) {
      throw new Error(`Pull failed: ${res.status}`);
    }

    const data = await res.json() as {
      ok: boolean;
      clients: Record<string, unknown>[];
      visits: Record<string, unknown>[];
      volunteers: Record<string, unknown>[];
      volunteerShifts: Record<string, unknown>[];
      volunteerSignups: Record<string, unknown>[];
      syncedAt: string;
    };

    if (!data.ok) throw new Error('Pull response not ok');

    // Apply remote changes directly to Dexie (bypass hooks → no re-enqueue)
    await this.applyRemoteChanges('clients', data.clients, db.clients);
    await this.applyRemoteChanges('visits', data.visits, db.visits);
    await this.applyRemoteChanges('volunteers', data.volunteers, db.volunteers);
    await this.applyRemoteChanges('volunteerShifts', data.volunteerShifts, db.volunteerShifts);
    await this.applyRemoteChanges('volunteerSignups', data.volunteerSignups, db.volunteerSignups);

    this.status = { ...this.status, lastSyncAt: data.syncedAt };
    localStorage.setItem(LAST_SYNC_KEY, data.syncedAt);
  }

  private async applyRemoteChanges(
    _tableName: string,
    records: Record<string, unknown>[],
    table: import('dexie').Table
  ): Promise<void> {
    if (!records || records.length === 0) return;

    for (const record of records) {
      const id = record.id as string;
      if (!id) continue;

      // Soft-deleted remotely → delete locally
      if (record.deletedAt) {
        await table.delete(id).catch(() => {});

        // For clients, also cascade-delete visits
        if (_tableName === 'clients') {
          await db.visits.where('clientId').equals(id).delete().catch(() => {});
        }
        continue;
      }

      // Remove the deletedAt field before storing locally
      const { deletedAt: _, ...cleanRecord } = record;

      // Last-write-wins: only apply if remote is newer
      const local = await table.get(id);
      if (local) {
        const localUpdated = (local as Record<string, unknown>).updatedAt as string | undefined;
        const remoteUpdated = cleanRecord.updatedAt as string | undefined;

        if (localUpdated && remoteUpdated && localUpdated >= remoteUpdated) {
          continue; // Local is newer or equal, skip
        }
      }

      // Direct put — bypasses hooks so no re-enqueue
      await table.put(cleanRecord);
    }
  }

  private async seedInitialData(): Promise<void> {
    const { enqueue } = await import('@/lib/sync-queue');

    const clients = await db.clients.toArray();
    for (const client of clients) {
      await enqueue('clients', client.id, 'upsert', client as unknown as Record<string, unknown>);
    }

    const visits = await db.visits.toArray();
    for (const visit of visits) {
      await enqueue('visits', visit.id, 'upsert', visit as unknown as Record<string, unknown>);
    }

    const volunteers = await db.volunteers.toArray();
    for (const vol of volunteers) {
      await enqueue('volunteers', vol.id, 'upsert', vol as unknown as Record<string, unknown>);
    }

    const shifts = await db.volunteerShifts.toArray();
    for (const shift of shifts) {
      await enqueue('volunteerShifts', shift.id, 'upsert', shift as unknown as Record<string, unknown>);
    }

    const signups = await db.volunteerSignups.toArray();
    for (const signup of signups) {
      await enqueue('volunteerSignups', signup.id, 'upsert', signup as unknown as Record<string, unknown>);
    }
  }

  startPolling(intervalMs: number = 30_000): void {
    this.stopPolling();
    this.pollInterval = setInterval(() => {
      this.sync().catch(() => {});
    }, intervalMs);
  }

  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /** Force a full re-sync by clearing the lastSyncAt timestamp */
  resetLastSync(): void {
    localStorage.removeItem(LAST_SYNC_KEY);
    this.status = { ...this.status, lastSyncAt: null };
    this.notify();
  }
}

export const syncEngine = new SyncEngine();
