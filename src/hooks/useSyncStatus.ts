import { useSyncExternalStore } from 'react';
import { syncEngine, type SyncStatus } from '@/lib/sync-engine';

function subscribe(callback: () => void): () => void {
  return syncEngine.subscribe(callback);
}

function getSnapshot(): SyncStatus {
  return syncEngine.getStatus();
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, getSnapshot);
}
