import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { enqueue } from '@/lib/sync-queue';
import { useSettings } from '@/contexts/SettingsContext';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { CalendarDays, UserPlus, X, RefreshCw, UserCheck, ArrowLeft, Briefcase } from 'lucide-react';
import { searchVolunteers } from '@/utils/search';
import { matchesRecurringSlot, formatSlot } from '@/utils/dateHelpers';
import type { PantryDay, Volunteer, VolunteerSignup } from '@/types';

const ROLES = ['Intake', 'Distribution', 'Setup', 'Cleanup', 'TJ Pickup', 'Unloading', 'Other'] as const;

const SESSION_DESCRIPTIONS: Partial<Record<PantryDay, string>> = {
  Saturday: 'Trader Joe\u2019s pickup at 8:30 AM, unloading at St. Mark at 9:00 AM',
};

function formatISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getUpcomingPantryDates(weeks: number = 4): { date: string; dayOfWeek: PantryDay }[] {
  const dates: { date: string; dayOfWeek: PantryDay }[] = [];
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + weeks * 7);

  const current = new Date(today);
  current.setDate(current.getDate() + 1); // start from tomorrow

  while (current <= endDate) {
    const dow = current.getDay();
    if (dow === 1) {
      dates.push({ date: formatISODate(current), dayOfWeek: 'Monday' });
    } else if (dow === 5) {
      dates.push({ date: formatISODate(current), dayOfWeek: 'Friday' });
    } else if (dow === 6) {
      dates.push({ date: formatISODate(current), dayOfWeek: 'Saturday' });
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function formatSessionDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

interface ScheduledVolunteer {
  volunteer: Volunteer;
  source: 'recurring' | 'signup';
  signupId?: string;
  role?: string;
}

function getVolunteersForDate(
  date: string,
  dayOfWeek: PantryDay,
  volunteers: Volunteer[],
  allSignups: VolunteerSignup[]
): ScheduledVolunteer[] {
  const result: ScheduledVolunteer[] = [];
  const addedIds = new Set<string>();

  // Find cancelled signups for this date (used to excuse recurring volunteers)
  const cancelledIds = new Set(
    allSignups
      .filter((s) => s.date === date && s.status === 'cancelled')
      .map((s) => s.volunteerId)
  );

  // Recurring volunteers (not cancelled for this date)
  for (const v of volunteers) {
    if (matchesRecurringSlot(v.recurringSlots, v.recurringDays, date, dayOfWeek) && !cancelledIds.has(v.id)) {
      result.push({ volunteer: v, source: 'recurring' });
      addedIds.add(v.id);
    }
  }

  // One-off signups
  for (const s of allSignups) {
    if (s.date === date && s.status === 'signed-up' && !addedIds.has(s.volunteerId)) {
      const volunteer = volunteers.find((v) => v.id === s.volunteerId);
      if (volunteer) {
        result.push({ volunteer, source: 'signup', signupId: s.id, role: s.role });
        addedIds.add(volunteer.id);
      }
    }
  }

  return result.sort((a, b) => a.volunteer.lastName.localeCompare(b.volunteer.lastName));
}

export function VolunteerSchedule() {
  const { settings } = useSettings();
  const volunteers = useLiveQuery(() => db.volunteers.toArray());
  const allSignups = useLiveQuery(() => db.volunteerSignups.toArray());

  const [signupDialogOpen, setSignupDialogOpen] = useState(false);
  const [signupDate, setSignupDate] = useState('');
  const [signupDayOfWeek, setSignupDayOfWeek] = useState<PantryDay>('Monday');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVolunteerId, setSelectedVolunteerId] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [saving, setSaving] = useState(false);

  const upcomingDates = useMemo(() => getUpcomingPantryDates(4), []);

  if (volunteers === undefined || allSignups === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  function openSignupDialog(date: string, dayOfWeek: PantryDay) {
    setSignupDate(date);
    setSignupDayOfWeek(dayOfWeek);
    setSearchQuery('');
    setSelectedVolunteerId('');
    setSelectedRole('');
    setSignupDialogOpen(true);
  }

  async function handleSignup() {
    if (!selectedVolunteerId || !signupDate || !volunteers) return;

    setSaving(true);
    try {
      // Check if there's already a cancelled record for this volunteer+date (undo excuse)
      const existing = await db.volunteerSignups
        .where('[volunteerId+date]')
        .equals([selectedVolunteerId, signupDate])
        .first();

      const now = new Date().toISOString();
      let signupId: string;
      if (existing) {
        // Update existing record to signed-up
        await db.volunteerSignups.update(existing.id, { status: 'signed-up', updatedAt: now });
        signupId = existing.id;
        const updated = await db.volunteerSignups.get(existing.id);
        if (updated) {
          enqueue('volunteerSignups', signupId, 'upsert', updated as unknown as Record<string, unknown>);
        }
      } else {
        signupId = crypto.randomUUID();
        const signup = {
          id: signupId,
          volunteerId: selectedVolunteerId,
          date: signupDate,
          dayOfWeek: signupDayOfWeek,
          role: selectedRole || undefined,
          status: 'signed-up' as const,
          createdAt: now,
          updatedAt: now,
        };
        await db.volunteerSignups.add(signup);
        enqueue('volunteerSignups', signupId, 'upsert', signup as unknown as Record<string, unknown>);
      }

      // Fire-and-forget API call for email notification
      if (settings.notificationsEnabled) {
        const vol = volunteers.find((v) => v.id === selectedVolunteerId);
        if (vol) {
          apiPost('/api/signups', {
            signupId,
            volunteerId: vol.id,
            firstName: vol.firstName,
            lastName: vol.lastName,
            email: vol.email,
            date: signupDate,
            dayOfWeek: signupDayOfWeek,
            role: selectedRole || undefined,
            recurringSlots: vol.recurringSlots,
          });
        }
      }

      setSignupDialogOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function excuseRecurring(volunteerId: string, date: string, dayOfWeek: PantryDay) {
    const now = new Date().toISOString();
    // Check if there's already a signup record for this volunteer+date
    const existing = await db.volunteerSignups
      .where('[volunteerId+date]')
      .equals([volunteerId, date])
      .first();

    if (existing) {
      await db.volunteerSignups.update(existing.id, { status: 'cancelled', updatedAt: now });
      const updated = await db.volunteerSignups.get(existing.id);
      if (updated) {
        enqueue('volunteerSignups', existing.id, 'upsert', updated as unknown as Record<string, unknown>);
      }
    } else {
      const signup = {
        id: crypto.randomUUID(),
        volunteerId,
        date,
        dayOfWeek,
        status: 'cancelled' as const,
        createdAt: now,
        updatedAt: now,
      };
      await db.volunteerSignups.add(signup);
      enqueue('volunteerSignups', signup.id, 'upsert', signup as unknown as Record<string, unknown>);
    }

    // Fire-and-forget cancellation notification
    if (settings.notificationsEnabled) {
      apiPost('/api/signups/cancel', { volunteerId, date, dayOfWeek });
    }
  }

  async function removeSignup(signupId: string, volunteerId: string, date: string, dayOfWeek: string) {
    await db.volunteerSignups.delete(signupId);
    enqueue('volunteerSignups', signupId, 'delete');

    // Fire-and-forget cancellation notification
    if (settings.notificationsEnabled) {
      apiPost('/api/signups/cancel', { signupId, volunteerId, date, dayOfWeek });
    }
  }

  // Filter volunteers for the signup dialog - exclude those already scheduled for the date
  const scheduledForDate = signupDate
    ? getVolunteersForDate(signupDate, signupDayOfWeek, volunteers, allSignups)
    : [];
  const scheduledIds = new Set(scheduledForDate.map((s) => s.volunteer.id));

  const availableVolunteers =
    searchQuery.trim().length >= 2
      ? searchVolunteers(
          volunteers.filter((v) => !scheduledIds.has(v.id)),
          searchQuery
        )
      : volunteers
          .filter((v) => !scheduledIds.has(v.id))
          .sort((a, b) => a.lastName.localeCompare(b.lastName));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/volunteers">
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Volunteer Schedule</h1>
            <p className="text-sm text-muted-foreground">
              Upcoming pantry sessions for the next 4 weeks
            </p>
          </div>
        </div>
      </div>

      {/* Upcoming Sessions */}
      {upcomingDates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">No upcoming sessions found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {upcomingDates.map(({ date, dayOfWeek }) => {
            const scheduled = getVolunteersForDate(date, dayOfWeek, volunteers, allSignups);
            return (
              <Card key={date}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <CalendarDays className="size-5 text-muted-foreground" />
                      <CardTitle className="text-base">
                        {formatSessionDate(date)}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        <UserCheck className="size-3" />
                        {scheduled.length} volunteer{scheduled.length !== 1 ? 's' : ''}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openSignupDialog(date, dayOfWeek)}
                      >
                        <UserPlus className="size-4" />
                        Sign Up
                      </Button>
                    </div>
                  </div>
                  {SESSION_DESCRIPTIONS[dayOfWeek] && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {SESSION_DESCRIPTIONS[dayOfWeek]}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  {scheduled.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No volunteers scheduled yet. Click "Sign Up" to add someone.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {scheduled.map(({ volunteer, source, signupId, role }) => (
                        <div
                          key={volunteer.id}
                          className="flex items-center justify-between rounded-md border px-3 py-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium truncate">
                              {volunteer.firstName} {volunteer.lastName}
                            </span>
                            {source === 'recurring' ? (
                              <Badge variant="outline" className="shrink-0">
                                <RefreshCw className="size-3" />
                                Recurring
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="shrink-0">
                                Signed up
                              </Badge>
                            )}
                            {role && (
                              <Badge variant="outline" className="shrink-0">
                                <Briefcase className="size-3" />
                                {role}
                              </Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                            title={
                              source === 'recurring'
                                ? 'Excuse for this date'
                                : 'Remove signup'
                            }
                            onClick={() => {
                              if (source === 'recurring') {
                                excuseRecurring(volunteer.id, date, dayOfWeek);
                              } else if (signupId) {
                                removeSignup(signupId, volunteer.id, date, dayOfWeek);
                              }
                            }}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Sign Up Dialog */}
      <Dialog open={signupDialogOpen} onOpenChange={setSignupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign Up Volunteer</DialogTitle>
            <DialogDescription>
              Add a volunteer for {signupDate ? formatSessionDate(signupDate) : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search volunteers */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Search Volunteer</label>
              <Input
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedVolunteerId('');
                }}
              />
            </div>

            {/* Volunteer list */}
            <div className="max-h-48 overflow-y-auto rounded-md border">
              {availableVolunteers.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground text-center">
                  {searchQuery.trim().length >= 2
                    ? 'No matching volunteers found'
                    : 'All volunteers are already scheduled'}
                </p>
              ) : (
                availableVolunteers.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/50 transition-colors border-b last:border-b-0 ${
                      selectedVolunteerId === v.id
                        ? 'bg-accent text-accent-foreground'
                        : ''
                    }`}
                    onClick={() => setSelectedVolunteerId(v.id)}
                  >
                    {v.firstName} {v.lastName}
                    {v.recurringSlots && v.recurringSlots.length > 0 ? (
                      <span className="text-muted-foreground ml-2">
                        (Regular: {v.recurringSlots.map(formatSlot).join(', ')})
                      </span>
                    ) : v.recurringDays && v.recurringDays.length > 0 ? (
                      <span className="text-muted-foreground ml-2">
                        (Regular: Every {v.recurringDays.join(' & ')})
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>

            {/* Role selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Role (optional)</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              >
                <option value="">No specific role</option>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSignupDialogOpen(false);
                setSelectedRole('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSignup}
              disabled={!selectedVolunteerId || saving}
            >
              <UserPlus className="size-4" />
              {saving ? 'Signing up...' : 'Sign Up'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
