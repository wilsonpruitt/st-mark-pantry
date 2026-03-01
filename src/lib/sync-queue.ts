import { db } from '@/db/database';
import type { SyncQueueEntry } from '@/types';

export async function enqueue(
  tableName: string,
  recordId: string,
  action: 'upsert' | 'delete',
  payload?: Record<string, unknown>
): Promise<void> {
  const entry: SyncQueueEntry = {
    tableName,
    recordId,
    action,
    payload,
    createdAt: new Date().toISOString(),
  };
  await db.syncQueue.add(entry);
}

export async function getPending(): Promise<SyncQueueEntry[]> {
  return db.syncQueue.orderBy('seqNo').toArray();
}

export async function removeBatch(seqNos: number[]): Promise<void> {
  await db.syncQueue.bulkDelete(seqNos);
}

export async function pendingCount(): Promise<number> {
  return db.syncQueue.count();
}
