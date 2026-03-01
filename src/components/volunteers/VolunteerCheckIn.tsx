import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { enqueue } from '@/lib/sync-queue';
import { Link } from 'react-router-dom';
import { Search, HandHeart, UserPlus, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { searchVolunteers } from '@/utils/search';
import { getTodayISO } from '@/utils/dateHelpers';
import type { PantryDay, Volunteer, VolunteerShift } from '@/types';

const ROLES = ['Intake', 'Distribution', 'Setup', 'Cleanup', 'Other'] as const;

/** Format a Date object as "Monday, February 16, 2026" */
function formatFullDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/** Detect whether today is a pantry day. */
function detectPantryDay(): PantryDay | null {
  const dow = new Date().getDay();
  if (dow === 1) return 'Monday';
  if (dow === 5) return 'Friday';
  if (dow === 6) return 'Saturday';
  return null;
}

export function VolunteerCheckIn() {
  const today = getTodayISO();
  const [selectedDay, setSelectedDay] = useState<PantryDay | null>(detectPantryDay);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<Map<string, string>>(new Map());
  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-focus search on mount
  useEffect(() => {
    const timer = setTimeout(() => searchRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  // --- Live queries ---
  const allVolunteers = useLiveQuery(() => db.volunteers.toArray()) ?? [];
  const todaysShifts = useLiveQuery(
    () => db.volunteerShifts.where('date').equals(today).toArray(),
    [today]
  ) ?? [];

  // --- Search results ---
  const searchResults = useMemo(
    () => searchVolunteers(allVolunteers, searchQuery),
    [allVolunteers, searchQuery]
  );

  // Build a set of volunteer IDs already checked in today
  const checkedInTodaySet = useMemo(() => {
    const set = new Set<string>();
    for (const s of todaysShifts) {
      set.add(s.volunteerId);
    }
    return set;
  }, [todaysShifts]);

  // Build a map from volunteerId -> Volunteer for the today's list display
  const volunteerMap = useMemo(() => {
    const map = new Map<string, Volunteer>();
    for (const v of allVolunteers) {
      map.set(v.id, v);
    }
    return map;
  }, [allVolunteers]);

  // --- Check-in logic ---
  const handleCheckIn = useCallback(
    async (volunteer: Volunteer) => {
      if (!selectedDay) return;
      const role = selectedRoles.get(volunteer.id);
      const now = new Date().toISOString();
      const shift: VolunteerShift = {
        id: crypto.randomUUID(),
        volunteerId: volunteer.id,
        date: today,
        dayOfWeek: selectedDay,
        role: role || undefined,
        updatedAt: now,
      };
      await db.volunteerShifts.add(shift);
      enqueue('volunteerShifts', shift.id, 'upsert', shift as unknown as Record<string, unknown>);
      setSearchQuery('');
      // Clear the role selection for this volunteer
      setSelectedRoles((prev) => {
        const next = new Map(prev);
        next.delete(volunteer.id);
        return next;
      });
    },
    [today, selectedDay, selectedRoles]
  );

  function handleRoleSelect(volunteerId: string, role: string) {
    setSelectedRoles((prev) => {
      const next = new Map(prev);
      if (next.get(volunteerId) === role) {
        next.delete(volunteerId); // toggle off
      } else {
        next.set(volunteerId, role);
      }
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-24">
      {/* ---- Date header ---- */}
      <div className="text-center space-y-3">
        <h1 className="text-2xl font-bold tracking-tight">
          {formatFullDate(new Date())}
        </h1>
        <p className="text-muted-foreground text-sm">Volunteer Check-In</p>

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
      </div>

      {/* ---- Search section ---- */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchRef}
            type="search"
            placeholder="Search volunteer by name..."
            aria-label="Search volunteers by name"
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
                  No volunteers found for &ldquo;{searchQuery}&rdquo;
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {searchResults.map((volunteer) => {
                    const alreadyToday = checkedInTodaySet.has(volunteer.id);
                    const selectedRole = selectedRoles.get(volunteer.id);

                    return (
                      <li key={volunteer.id} className="px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              {volunteer.firstName} {volunteer.lastName}
                            </p>
                            {alreadyToday && (
                              <p className="text-xs text-muted-foreground">
                                Already checked in today
                              </p>
                            )}
                          </div>
                          <Button
                            size="lg"
                            onClick={() => handleCheckIn(volunteer)}
                            disabled={!selectedDay || alreadyToday}
                            className={
                              alreadyToday
                                ? ''
                                : 'bg-success hover:bg-success/90 text-success-foreground'
                            }
                          >
                            {alreadyToday ? 'Done' : 'Check In'}
                          </Button>
                        </div>

                        {/* Role selector (only show if not already checked in) */}
                        {!alreadyToday && (
                          <div className="flex flex-wrap gap-1.5">
                            {ROLES.map((role) => (
                              <button
                                key={role}
                                type="button"
                                onClick={() => handleRoleSelect(volunteer.id, role)}
                                aria-pressed={selectedRole === role}
                                aria-label={`Assign ${role} role`}
                                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                  selectedRole === role
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                                }`}
                              >
                                {role}
                              </button>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ---- Today's volunteers ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HandHeart className="size-5" />
            Today&apos;s Volunteers
            <Badge variant="secondary">{todaysShifts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todaysShifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No volunteers checked in yet
            </p>
          ) : (
            <ul className="space-y-2">
              {todaysShifts.map((shift) => {
                const vol = volunteerMap.get(shift.volunteerId);
                if (!vol) return null;
                return (
                  <li
                    key={shift.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-medium">
                        {vol.firstName} {vol.lastName}
                      </span>
                      {shift.role && (
                        <Badge variant="outline" className="ml-2">
                          <Briefcase className="size-3 mr-1" />
                          {shift.role}
                        </Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ---- Floating "New Volunteer" FAB ---- */}
      <Link
        to="/volunteers/new"
        className="fixed bottom-20 right-4 z-40 inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
        aria-label="New Volunteer"
      >
        <UserPlus className="size-6" />
      </Link>
    </div>
  );
}
