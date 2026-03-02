import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import {
  Users,
  HandHeart,
  ClipboardCheck,
  UserPlus,
  BarChart3,
  UserX,
  ChevronRight,
  ChevronLeft,
  Calendar,
  BookOpen,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from './StatCard';
import { getTodayISO, getMonthRange, getWeekRange, offsetMonth, formatTime } from '@/utils/dateHelpers';

const quickActions = [
  { to: '/checkin', label: 'Start Check-In', icon: ClipboardCheck, color: 'bg-green-500' },
  { to: '/clients/new', label: 'Register Client', icon: UserPlus, color: 'bg-blue-500' },
  { to: '/volunteers', label: 'Volunteers', icon: HandHeart, color: 'bg-purple-500' },
  { to: '/reports', label: 'View Reports', icon: BarChart3, color: 'bg-amber-500' },
  { to: '/guide', label: 'Volunteer Guide', icon: BookOpen, color: 'bg-teal-500' },
];

export function DashboardPage() {
  const today = getTodayISO();
  const { start: weekStart, end: weekEnd } = getWeekRange();

  // Month navigation state — defaults to current month
  const [monthRef, setMonthRef] = useState(today);
  const { start: monthStart, end: monthEnd } = getMonthRange(monthRef);

  const clients = useLiveQuery(() => db.clients.toArray());
  const todaysVisits = useLiveQuery(
    () => db.visits.where('date').equals(today).toArray(),
    [today]
  );
  const todaysShifts = useLiveQuery(
    () => db.volunteerShifts.where('date').equals(today).toArray(),
    [today]
  );
  const allVisits = useLiveQuery(() => db.visits.toArray());

  const weeklyClientCount = useMemo(() => {
    if (!allVisits) return 0;
    const weekVisits = allVisits.filter(
      (v) => v.date >= weekStart && v.date <= weekEnd
    );
    return new Set(weekVisits.map((v) => v.clientId)).size;
  }, [allVisits, weekStart, weekEnd]);

  const todayVolunteerCount = useMemo(() => {
    if (!todaysShifts) return 0;
    return new Set(todaysShifts.map((s) => s.volunteerId)).size;
  }, [todaysShifts]);

  const monthlyUniqueClients = useMemo(() => {
    if (!allVisits) return 0;
    const monthVisits = allVisits.filter(
      (v) => v.date >= monthStart && v.date <= monthEnd
    );
    return new Set(monthVisits.map((v) => v.clientId)).size;
  }, [allVisits, monthStart, monthEnd]);

  // Clients who haven't visited this month (only for current month)
  const currentMonthRange = getMonthRange();
  const inactiveThisMonth = useMemo(() => {
    if (!clients || !allVisits) return 0;
    const visitedThisMonth = new Set(
      allVisits
        .filter((v) => v.date >= currentMonthRange.start && v.date <= currentMonthRange.end)
        .map((v) => v.clientId)
    );
    return clients.filter((c) => !visitedThisMonth.has(c.id)).length;
  }, [clients, allVisits, currentMonthRange.start, currentMonthRange.end]);

  // Recent check-ins today (last 5)
  const recentCheckIns = useMemo(() => {
    if (!todaysVisits || !clients) return [];
    const clientMap = new Map(clients.map((c) => [c.id, c]));
    return [...todaysVisits]
      .sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt))
      .slice(0, 5)
      .map((v) => {
        const client = clientMap.get(v.clientId);
        return {
          id: v.id,
          name: client
            ? `${client.firstName} ${client.lastName}`
            : 'Unknown',
          time: formatTime(v.checkedInAt),
        };
      });
  }, [todaysVisits, clients]);

  const isLoading =
    clients === undefined ||
    todaysVisits === undefined ||
    todaysShifts === undefined ||
    allVisits === undefined;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const monthDate = new Date(Number(monthRef.split('-')[0]), Number(monthRef.split('-')[1]) - 1, 1);
  const monthLabel = monthDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const isCurrentMonth = monthStart === currentMonthRange.start;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-24">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <StatCard icon={Users} label="This Week's Clients" value={weeklyClientCount} />
        <StatCard icon={HandHeart} label="Today's Volunteers" value={todayVolunteerCount} />
      </div>

      {/* Monthly stat with arrows */}
      <Card className="py-4">
        <CardContent className="flex items-center justify-between px-4">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setMonthRef(offsetMonth(monthRef, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex size-8 sm:size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Calendar className="size-4 sm:size-5 text-primary" />
            </div>
            <div className="min-w-0 text-center">
              <p className="text-xl sm:text-2xl font-bold leading-none">{monthlyUniqueClients}</p>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 leading-tight">{monthLabel} Clients</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setMonthRef(offsetMonth(monthRef, 1))}
            disabled={isCurrentMonth}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent"
            >
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${action.color} text-white`}
              >
                <action.icon className="size-5" />
              </div>
              <span className="text-sm font-medium">{action.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent Check-Ins */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span>Recent Check-Ins</span>
            <Badge variant="secondary">{todaysVisits?.length ?? 0} today</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentCheckIns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No check-ins yet today.
            </p>
          ) : (
            <div className="space-y-2">
              {recentCheckIns.map((ci) => (
                <div
                  key={ci.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span className="text-sm font-medium">{ci.name}</span>
                  <span className="text-xs text-muted-foreground">{ci.time}</span>
                </div>
              ))}
              {(todaysVisits?.length ?? 0) > 5 && (
                <Link
                  to="/checkin"
                  className="block text-center text-sm text-primary hover:underline pt-1"
                >
                  View all &rarr;
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inactive Clients Teaser */}
      {inactiveThisMonth > 0 && (
        <Link
          to="/reports/inactive"
          className="flex items-center gap-3 rounded-xl border border-yellow-200 bg-yellow-50 p-4 transition-colors hover:bg-yellow-100 dark:border-yellow-900 dark:bg-yellow-950 dark:hover:bg-yellow-900/50"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-yellow-200 dark:bg-yellow-900">
            <UserX className="size-5 text-yellow-700 dark:text-yellow-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              {inactiveThisMonth} client{inactiveThisMonth !== 1 ? 's' : ''} not visited this month
            </p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              Tap to view inactive client report
            </p>
          </div>
          <ChevronRight className="size-5 text-yellow-500 shrink-0" />
        </Link>
      )}
    </div>
  );
}
