import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { exportToExcel, exportMultiSheetExcel } from '@/lib/excel';
import { Download, Users, HandHeart, Calendar, Clock, UserX, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { StatCard } from '@/components/dashboard/StatCard';
import { useSettings } from '@/contexts/SettingsContext';
import { getTodayISO, getMonthRange, formatDate } from '@/utils/dateHelpers';
import { PrintVisitLog } from './PrintVisitLog';
import type { Client, Volunteer } from '@/types';

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ReportsPage() {
  const { settings } = useSettings();
  const today = getTodayISO();
  const { start: monthStart, end: monthEnd } = getMonthRange();

  // --- Live queries ---
  const clients = useLiveQuery(() => db.clients.toArray());
  const visits = useLiveQuery(() => db.visits.toArray());
  const volunteers = useLiveQuery(() => db.volunteers.toArray());
  const volunteerShifts = useLiveQuery(() => db.volunteerShifts.toArray());

  // --- Loading state ---
  const isLoading =
    clients === undefined ||
    visits === undefined ||
    volunteers === undefined ||
    volunteerShifts === undefined;

  // --- Today's stats ---
  const todayStats = useMemo(() => {
    if (!visits || !clients || !volunteerShifts) {
      return { clientsServed: 0, volunteersToday: 0, familyMembersServed: 0 };
    }

    const todaysVisits = visits.filter((v) => v.date === today);
    const todaysClientIds = new Set(todaysVisits.map((v) => v.clientId));

    const familyMembersServed = clients
      .filter((c) => todaysClientIds.has(c.id))
      .reduce((sum, c) => sum + c.numberInFamily, 0);

    const todaysShifts = volunteerShifts.filter((s) => s.date === today);
    const uniqueVolunteerIds = new Set(todaysShifts.map((s) => s.volunteerId));

    return {
      clientsServed: todaysClientIds.size,
      volunteersToday: uniqueVolunteerIds.size,
      familyMembersServed,
    };
  }, [visits, clients, volunteerShifts, today]);

  // --- Monthly stats ---
  const monthlyStats = useMemo(() => {
    if (!visits || !volunteerShifts) {
      return { uniqueClients: 0, totalVisits: 0, totalShifts: 0, totalHours: 0 };
    }

    const monthVisits = visits.filter(
      (v) => v.date >= monthStart && v.date <= monthEnd
    );
    const uniqueClientIds = new Set(monthVisits.map((v) => v.clientId));

    const monthShifts = volunteerShifts.filter(
      (s) => s.date >= monthStart && s.date <= monthEnd
    );
    const totalHours = monthShifts.reduce(
      (sum, s) => sum + (s.hoursWorked ?? 0),
      0
    );

    return {
      uniqueClients: uniqueClientIds.size,
      totalVisits: monthVisits.length,
      totalShifts: monthShifts.length,
      totalHours: Math.round(totalHours * 10) / 10,
    };
  }, [visits, volunteerShifts, monthStart, monthEnd]);

  // --- Monthly chart data (last 12 months) ---
  const monthlyData = useMemo(() => {
    if (!visits) return [];
    const now = new Date();
    const months: { label: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const count = visits.filter((v) => v.date.startsWith(yearMonth)).length;
      months.push({ label, count });
    }
    return months;
  }, [visits]);

  const maxCount = useMemo(
    () => Math.max(...monthlyData.map((m) => m.count), 0),
    [monthlyData]
  );

  // --- Items distributed this month (when inventory enabled) ---
  const itemsDistributed = useMemo(() => {
    if (!settings.inventoryEnabled || !visits || !clients) return [];
    const clientMap = new Map(clients.map((c) => [c.id, c]));
    return visits
      .filter(
        (v) =>
          v.date >= monthStart &&
          v.date <= monthEnd &&
          v.itemsReceived
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((v) => {
        const client = clientMap.get(v.clientId);
        return {
          id: v.id,
          name: client ? `${client.firstName} ${client.lastName}` : 'Unknown',
          date: v.date,
          items: v.itemsReceived!,
        };
      });
  }, [settings.inventoryEnabled, visits, clients, monthStart, monthEnd]);

  // --- Current month label ---
  const currentMonthLabel = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  // --- Export handlers ---
  const handleExportClients = async () => {
    if (!clients) return;
    const rows = clients.map((c) => ({
      ID: c.id,
      'First Name': c.firstName,
      'Last Name': c.lastName,
      Phone: c.phone || '',
      Email: c.email || '',
      Street: c.address?.street ?? '',
      City: c.address?.city ?? '',
      State: c.address?.state ?? '',
      ZIP: c.address?.zip ?? '',
      'Family Size': c.numberInFamily,
      Notes: c.notes || '',
      'Created At': c.createdAt ?? '',
    }));
    await exportToExcel(rows, `clients-${today}.xlsx`, 'Clients');
  };

  const handleExportVisits = async () => {
    if (!visits || !clients) return;
    const clientMap = new Map<string, Client>();
    for (const c of clients) {
      clientMap.set(c.id, c);
    }
    const rows = visits.map((v) => {
      const client = clientMap.get(v.clientId);
      return {
        Date: v.date,
        'Day of Week': v.dayOfWeek,
        'Client First Name': client?.firstName || 'Unknown',
        'Client Last Name': client?.lastName || 'Unknown',
        'Family Size': client?.numberInFamily ?? '',
        'Served By': v.servedBy || '',
        'Items Received': v.itemsReceived || '',
        Notes: v.notes || '',
        'Checked In At': v.checkedInAt,
      };
    });
    await exportToExcel(rows, `visit-log-${today}.xlsx`, 'Visits');
  };

  const handleExportVolunteers = async () => {
    if (!volunteers || !volunteerShifts) return;
    const volunteerMap = new Map<string, Volunteer>();
    for (const v of volunteers) {
      volunteerMap.set(v.id, v);
    }
    const volunteerRows = volunteers.map((v) => ({
      ID: v.id,
      'First Name': v.firstName,
      'Last Name': v.lastName,
      Phone: v.phone || '',
      Email: v.email || '',
      Notes: v.notes || '',
      'Created At': v.createdAt,
    }));
    const shiftRows = volunteerShifts.map((s) => {
      const vol = volunteerMap.get(s.volunteerId);
      return {
        Date: s.date,
        'Day of Week': s.dayOfWeek,
        'Volunteer Name': vol
          ? `${vol.firstName} ${vol.lastName}`
          : 'Unknown',
        Role: s.role || '',
        'Hours Worked': s.hoursWorked ?? '',
        Notes: s.notes || '',
      };
    });
    await exportMultiSheetExcel(
      [
        { name: 'Volunteers', data: volunteerRows },
        { name: 'Shifts', data: shiftRows },
      ],
      `volunteer-log-${today}.xlsx`
    );
  };

  // --- Render ---
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-24">
      <h1 className="text-2xl font-bold tracking-tight">Reports</h1>

      {/* ---- Today's Summary ---- */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Today
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            icon={Users}
            label="Clients Served"
            value={todayStats.clientsServed}
          />
          <StatCard
            icon={HandHeart}
            label="Volunteers"
            value={todayStats.volunteersToday}
          />
          <StatCard
            icon={Users}
            label="Family Members"
            value={todayStats.familyMembersServed}
          />
        </div>
      </section>

      <Separator />

      {/* ---- Monthly Summary ---- */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {currentMonthLabel}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={Users}
            label="Unique Clients"
            value={monthlyStats.uniqueClients}
          />
          <StatCard
            icon={Calendar}
            label="Total Visits"
            value={monthlyStats.totalVisits}
          />
          <StatCard
            icon={HandHeart}
            label="Volunteer Shifts"
            value={monthlyStats.totalShifts}
          />
          <StatCard
            icon={Clock}
            label="Volunteer Hours"
            value={monthlyStats.totalHours}
          />
        </div>
      </section>

      {/* ---- Inactive Clients Link ---- */}
      <Link
        to="/reports/inactive"
        className="flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-accent"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-yellow-100 dark:bg-yellow-900">
          <UserX className="size-5 text-yellow-700 dark:text-yellow-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Inactive Clients</p>
          <p className="text-xs text-muted-foreground">
            Clients not visited in 30/60/90 days
          </p>
        </div>
        <ChevronRight className="size-5 text-muted-foreground shrink-0" />
      </Link>

      {/* ---- Items Distributed (when inventory enabled) ---- */}
      {settings.inventoryEnabled && (
        <Card>
          <CardHeader>
            <CardTitle>Items Distributed</CardTitle>
            <CardDescription>{currentMonthLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            {itemsDistributed.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No items recorded this month.
              </p>
            ) : (
              <div className="space-y-2">
                {itemsDistributed.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-md border px-3 py-2 space-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(item.date)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.items}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* ---- Monthly Visits Chart ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Visits per Month</CardTitle>
          <CardDescription>Last 12 months</CardDescription>
        </CardHeader>
        <CardContent>
          {monthlyData.every((m) => m.count === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No visit data yet.
            </p>
          ) : (
            <>
              <div className="space-y-2" aria-hidden="true">
                {monthlyData.map((m) => (
                  <div key={m.label} className="flex items-center gap-2">
                    <span className="w-16 text-xs text-right text-muted-foreground shrink-0">
                      {m.label}
                    </span>
                    <div className="flex-1 h-6 bg-muted rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-sm flex items-center px-2 transition-all duration-300"
                        style={{
                          width:
                            maxCount > 0
                              ? `${(m.count / maxCount) * 100}%`
                              : '0%',
                          minWidth: m.count > 0 ? '2rem' : 0,
                        }}
                      >
                        {m.count > 0 && (
                          <span className="text-xs text-primary-foreground font-medium">
                            {m.count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Screen-reader accessible data table */}
              <table className="sr-only">
                <caption>Visits per month, last 12 months</caption>
                <thead>
                  <tr><th>Month</th><th>Visits</th></tr>
                </thead>
                <tbody>
                  {monthlyData.map((m) => (
                    <tr key={m.label}><td>{m.label}</td><td>{m.count}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* ---- Print Visit Log ---- */}
      <PrintVisitLog />

      <Separator />

      {/* ---- Export Section ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="size-5" />
            Export Data
          </CardTitle>
          <CardDescription>
            Download reports as Excel spreadsheets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleExportClients}
            disabled={!clients || clients.length === 0}
          >
            <Download className="size-4" />
            Export Client List (Excel)
            {clients && clients.length > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {clients.length}
              </Badge>
            )}
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleExportVisits}
            disabled={!visits || visits.length === 0}
          >
            <Download className="size-4" />
            Export Visit Log (Excel)
            {visits && visits.length > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {visits.length}
              </Badge>
            )}
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleExportVolunteers}
            disabled={
              (!volunteers || volunteers.length === 0) &&
              (!volunteerShifts || volunteerShifts.length === 0)
            }
          >
            <Download className="size-4" />
            Export Volunteer Log (Excel)
            {volunteers && volunteers.length > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {volunteers.length}
              </Badge>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
