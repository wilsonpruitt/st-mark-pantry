import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { enqueue } from '@/lib/sync-queue';
import { Link } from 'react-router-dom';
import { Search, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSettings } from '@/contexts/SettingsContext';
import { searchClients } from '@/utils/search';
import { getTodayISO } from '@/utils/dateHelpers';
import TodaysList from './TodaysList';
import { ItemsReceivedDialog } from './ItemsReceivedDialog';
import type { Client, PantryDay, Volunteer } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a Date object as "Monday, February 16, 2026" */
function formatFullDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/** Detect whether today is a pantry day. Returns the day or null. */
function detectPantryDay(): PantryDay | null {
  const dow = new Date().getDay();
  if (dow === 1) return 'Monday';
  if (dow === 5) return 'Friday';
  if (dow === 6) return 'Saturday';
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CheckInPage() {
  const { settings } = useSettings();

  // --- Date / Day state ---
  const today = getTodayISO();
  const [selectedDay, setSelectedDay] = useState<PantryDay | null>(
    detectPantryDay
  );
  const selectedDate = today; // always today; the day toggle is about labeling

  // --- Served by (persists across page loads) ---
  const [servedBy, setServedBy] = useState(
    () => localStorage.getItem('pantry-served-by') ?? ''
  );
  function updateServedBy(value: string) {
    setServedBy(value);
    localStorage.setItem('pantry-served-by', value);
  }

  // --- Search state ---
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // --- Items received dialog state ---
  const [itemsDialogOpen, setItemsDialogOpen] = useState(false);
  const [lastVisitId, setLastVisitId] = useState('');
  const [lastClientName, setLastClientName] = useState('');

  // Auto-focus search on mount
  useEffect(() => {
    // Small delay so virtual keyboard doesn't obstruct layout on mobile
    const timer = setTimeout(() => searchRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  // --- Live queries ---
  const allClients = useLiveQuery(() => db.clients.toArray()) ?? [];
  const todaysVisits = useLiveQuery(
    () => db.visits.where('date').equals(selectedDate).toArray(),
    [selectedDate]
  ) ?? [];
  const allVolunteers = useLiveQuery(() => db.volunteers.toArray()) ?? [];
  const todaysShifts = useLiveQuery(
    () => db.volunteerShifts.where('date').equals(today).toArray(),
    [today]
  ) ?? [];

  // Build list of today's checked-in volunteer names for the "Served by" picker
  const todaysVolunteerNames = useMemo(() => {
    const volMap = new Map<string, Volunteer>();
    for (const v of allVolunteers) volMap.set(v.id, v);
    const ids = new Set(todaysShifts.map((s) => s.volunteerId));
    return Array.from(ids)
      .map((id) => volMap.get(id))
      .filter(Boolean)
      .sort((a, b) => a!.lastName.localeCompare(b!.lastName))
      .map((v) => `${v!.firstName} ${v!.lastName}`);
  }, [allVolunteers, todaysShifts]);

  // --- Search results ---
  const searchResults = useMemo(
    () => searchClients(allClients, searchQuery),
    [allClients, searchQuery]
  );

  // Build a set of client IDs already checked in today for quick lookup
  const checkedInTodaySet = useMemo(() => {
    const set = new Set<string>();
    for (const v of todaysVisits) {
      set.add(v.clientId);
    }
    return set;
  }, [todaysVisits]);

  // --- Check-in logic ---
  const doCheckIn = useCallback(
    async (client: Client) => {
      if (!selectedDay) return; // shouldn't happen if UI prevents it
      const visitId = crypto.randomUUID();
      const now = new Date().toISOString();
      const visit = {
        id: visitId,
        clientId: client.id,
        date: selectedDate,
        dayOfWeek: selectedDay,
        servedBy: servedBy.trim() || undefined,
        checkedInAt: now,
        updatedAt: now,
      };
      await db.visits.add(visit);
      enqueue('visits', visitId, 'upsert', visit as unknown as Record<string, unknown>);
      setSearchQuery('');

      // Show items dialog if inventory tracking is enabled
      if (settings.inventoryEnabled) {
        setLastVisitId(visitId);
        setLastClientName(`${client.firstName} ${client.lastName}`);
        setItemsDialogOpen(true);
      }
    },
    [selectedDate, selectedDay, servedBy, settings.inventoryEnabled]
  );

  const handleCheckIn = useCallback(
    async (client: Client) => {
      if (!selectedDay) return;
      await doCheckIn(client);
    },
    [selectedDay, doCheckIn]
  );

  // --- Render ---
  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-24">
      {/* ---- Date header ---- */}
      <div className="text-center space-y-3">
        <h1 className="text-2xl font-bold tracking-tight">
          {formatFullDate(new Date())}
        </h1>

        {/* Day toggle pills */}
        <div className="flex items-center justify-center gap-2">
          {(['Monday', 'Friday', 'Saturday'] as const).map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              aria-pressed={selectedDay === day}
              aria-label={`Select ${day}`}
              className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                selectedDay === day
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
        {!selectedDay && (
          <p className="text-sm text-destructive font-medium">
            Please select a day to begin
          </p>
        )}
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs text-muted-foreground">Served by:</span>
          <select
            value={servedBy}
            onChange={(e) => updateServedBy(e.target.value)}
            className="h-7 w-44 rounded border border-input bg-transparent px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Select volunteer</option>
            {todaysVolunteerNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ---- Search section ---- */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchRef}
            type="search"
            placeholder="Search by name..."
            aria-label="Search clients by name"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={!selectedDay}
            className="h-12 pl-10 text-base"
          />
        </div>

        {/* Search results */}
        {searchQuery.length >= 2 && (
          <Card className="py-0 overflow-hidden">
            <CardContent className="p-0">
              {searchResults.length === 0 ? (
                <div className="px-4 py-6 text-center text-muted-foreground text-sm">
                  No clients found for &ldquo;{searchQuery}&rdquo;
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {searchResults.map((client) => {
                    const alreadyToday = checkedInTodaySet.has(client.id);

                    return (
                      <li
                        key={client.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <p className="font-medium truncate">
                            {client.firstName} {client.lastName}
                            <span className="text-muted-foreground font-normal ml-1.5">
                              ({client.numberInFamily} in family)
                            </span>
                          </p>
                          {client.acceptsPerishables === false && (
                            <Badge variant="outline" className="border-blue-300 text-blue-700 dark:text-blue-300">
                              No Perishables
                            </Badge>
                          )}
                          {alreadyToday && (
                            <p className="text-xs text-muted-foreground">
                              Checked in today
                            </p>
                          )}
                        </div>
                        <Button
                          size="lg"
                          onClick={() => handleCheckIn(client)}
                          disabled={!selectedDay || alreadyToday}
                          className={
                            alreadyToday
                              ? ''
                              : 'bg-success hover:bg-success/90 text-success-foreground'
                          }
                        >
                          {alreadyToday ? 'Done' : 'Check In'}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ---- Today's visitors ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Today&apos;s Visitors
            <Badge variant="secondary">{todaysVisits.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <TodaysList visits={todaysVisits} clients={allClients} />
        </CardContent>
      </Card>

      {/* ---- Floating "New Client" FAB ---- */}
      <Link
        to="/clients/new"
        className="fixed bottom-20 right-4 z-40 inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
        aria-label="New Client"
      >
        <UserPlus className="size-6" />
      </Link>

      {/* ---- Items received dialog ---- */}
      {settings.inventoryEnabled && (
        <ItemsReceivedDialog
          open={itemsDialogOpen}
          onOpenChange={setItemsDialogOpen}
          visitId={lastVisitId}
          clientName={lastClientName}
        />
      )}

    </div>
  );
}
