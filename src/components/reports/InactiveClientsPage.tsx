import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { exportToExcel } from '@/lib/excel';
import { ArrowLeft, Download, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getTodayISO, getDaysAgoISO, formatDate, parseLocalDate } from '@/utils/dateHelpers';

const THRESHOLDS = [30, 60, 90] as const;

export function InactiveClientsPage() {
  const navigate = useNavigate();
  const [threshold, setThreshold] = useState<number>(30);

  const today = getTodayISO();
  const cutoff = getDaysAgoISO(threshold);

  const clients = useLiveQuery(() => db.clients.toArray());
  const visits = useLiveQuery(() => db.visits.toArray());

  // Build map of clientId → last visit date
  const lastVisitMap = useMemo(() => {
    if (!visits) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const v of visits) {
      const existing = map.get(v.clientId);
      if (!existing || v.date > existing) {
        map.set(v.clientId, v.date);
      }
    }
    return map;
  }, [visits]);

  // Filter clients who haven't visited since cutoff
  const inactiveClients = useMemo(() => {
    if (!clients) return [];
    return clients
      .filter((c) => {
        const lastVisit = lastVisitMap.get(c.id);
        return !lastVisit || lastVisit < cutoff;
      })
      .map((c) => {
        const lastVisit = lastVisitMap.get(c.id);
        const daysSince = lastVisit
          ? Math.floor(
              (parseLocalDate(today).getTime() - parseLocalDate(lastVisit).getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : null;
        return { ...c, lastVisit, daysSince };
      })
      .sort((a, b) => {
        // Never visited first, then by longest absence
        if (!a.lastVisit && !b.lastVisit) return 0;
        if (!a.lastVisit) return -1;
        if (!b.lastVisit) return 1;
        return a.lastVisit.localeCompare(b.lastVisit);
      });
  }, [clients, lastVisitMap, cutoff, today]);

  const handleExport = async () => {
    if (inactiveClients.length === 0) return;
    const rows = inactiveClients.map((c) => ({
      'First Name': c.firstName,
      'Last Name': c.lastName,
      'Family Size': c.numberInFamily,
      Phone: c.phone || '',
      'Last Visit': c.lastVisit ? formatDate(c.lastVisit) : 'Never',
      'Days Since Visit': c.daysSince ?? 'N/A',
    }));
    await exportToExcel(rows, `inactive-clients-${threshold}d-${today}.xlsx`, 'Inactive Clients');
  };

  const isLoading = clients === undefined || visits === undefined;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Inactive Clients</h1>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2">
        {THRESHOLDS.map((days) => (
          <button
            key={days}
            type="button"
            onClick={() => setThreshold(days)}
            aria-pressed={threshold === days}
            aria-label={`Show clients inactive for ${days} days`}
            className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
              threshold === days
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {days} days
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-sm px-3 py-1">
          <Users className="size-3.5 mr-1.5" />
          {inactiveClients.length} client{inactiveClients.length !== 1 ? 's' : ''} haven&apos;t
          visited in {threshold}+ days
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={inactiveClients.length === 0}
        >
          <Download className="size-4" />
          Export
        </Button>
      </div>

      {/* Client list */}
      {inactiveClients.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No inactive clients for this period.
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0 overflow-hidden">
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {inactiveClients.map((client) => (
                <li key={client.id}>
                  <Link
                    to={`/clients/${client.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent transition-colors"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium truncate">
                        {client.firstName} {client.lastName}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          Family: {client.numberInFamily}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {client.lastVisit
                            ? `Last visit: ${formatDate(client.lastVisit)}`
                            : 'Never visited'}
                        </span>
                      </div>
                    </div>
                    {client.daysSince !== null ? (
                      <Badge
                        variant={client.daysSince >= 90 ? 'destructive' : 'outline'}
                        className="shrink-0"
                      >
                        {client.daysSince}d
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="shrink-0">
                        Never
                      </Badge>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
