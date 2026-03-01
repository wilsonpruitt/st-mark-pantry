import { useSyncStatus } from '@/hooks/useSyncStatus';

export function SyncIndicator() {
  const { state, online, pendingCount } = useSyncStatus();

  let dotColor: string;
  let label: string;

  if (!online) {
    dotColor = 'bg-gray-400';
    label = 'Offline';
  } else if (state === 'error') {
    dotColor = 'bg-red-500';
    label = 'Sync error';
  } else if (state === 'pushing' || state === 'pulling') {
    dotColor = 'bg-orange-400 animate-pulse';
    label = 'Syncing...';
  } else if (pendingCount > 0) {
    dotColor = 'bg-yellow-400';
    label = `${pendingCount} pending`;
  } else {
    dotColor = 'bg-green-400';
    label = 'Synced';
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${dotColor}`} />
      <span className="text-xs text-primary-foreground/70">{label}</span>
    </div>
  );
}
