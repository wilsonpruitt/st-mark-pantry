import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '@/db/database';
import { enqueue } from '@/lib/sync-queue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Save } from 'lucide-react';
import { legacyDaysToSlots } from '@/utils/dateHelpers';
import type { PantryDay, Volunteer } from '@/types';

const DAYS: PantryDay[] = ['Monday', 'Friday', 'Saturday'];
const DAY_SHORT: Record<PantryDay, string> = { Monday: 'Mon', Friday: 'Fri', Saturday: 'Sat' };
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'] as const;

export function VolunteerForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [recurringSlots, setRecurringSlots] = useState<string[]>([]);

  // Load existing volunteer data for edit mode
  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    async function loadVolunteer() {
      const volunteer = await db.volunteers.get(id!);
      if (cancelled) return;

      if (!volunteer) {
        navigate('/volunteers', { replace: true });
        return;
      }

      setFirstName(volunteer.firstName);
      setLastName(volunteer.lastName);
      setPhone(volunteer.phone ?? '');
      setEmail(volunteer.email ?? '');
      setNotes(volunteer.notes ?? '');
      // Migrate legacy recurringDays to recurringSlots format
      if (volunteer.recurringSlots && volunteer.recurringSlots.length > 0) {
        setRecurringSlots(volunteer.recurringSlots);
      } else if (volunteer.recurringDays && volunteer.recurringDays.length > 0) {
        setRecurringSlots(legacyDaysToSlots(volunteer.recurringDays));
      }
      setLoading(false);
    }

    loadVolunteer();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim()) return;

    setSaving(true);

    try {
      const now = new Date().toISOString();
      const volunteerData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        notes: notes.trim() || undefined,
        recurringSlots: recurringSlots.length > 0 ? recurringSlots : undefined,
        recurringDays: undefined as PantryDay[] | undefined, // clear legacy field
      };

      if (isEdit && id) {
        await db.volunteers.update(id, { ...volunteerData, updatedAt: now });
        const updated = await db.volunteers.get(id);
        if (updated) {
          enqueue('volunteers', id, 'upsert', updated as unknown as Record<string, unknown>);
        }

        navigate('/');
      } else {
        const newVolunteer: Volunteer = {
          id: crypto.randomUUID(),
          ...volunteerData,
          createdAt: now,
          updatedAt: now,
        };
        await db.volunteers.add(newVolunteer);
        enqueue('volunteers', newVolunteer.id, 'upsert', newVolunteer as unknown as Record<string, unknown>);

        navigate(`/volunteers/${newVolunteer.id}`);
      }
    } catch {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">
          {isEdit ? 'Edit Volunteer' : 'Add Volunteer'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Volunteer Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  placeholder="First name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  placeholder="Last name"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 555-5555"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              className="h-24 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] placeholder:text-muted-foreground resize-y"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes about this volunteer..."
            />
          </CardContent>
        </Card>

        {/* Regular Schedule */}
        <Card>
          <CardHeader>
            <CardTitle>Regular Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Which sessions does this volunteer regularly serve?
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left py-1 pr-4 font-medium text-muted-foreground" />
                    {DAYS.map((day) => (
                      <th key={day} className="text-center py-1 px-2 font-medium">
                        {DAY_SHORT[day]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Every row */}
                  <tr className="border-b">
                    <td className="py-2 pr-4 font-medium">Every</td>
                    {DAYS.map((day) => {
                      const slot = `every-${day}`;
                      const isEvery = recurringSlots.includes(slot);
                      return (
                        <td key={day} className="text-center py-2 px-2">
                          <input
                            type="checkbox"
                            checked={isEvery}
                            aria-label={`Every ${day}`}
                            onChange={(e) => {
                              if (e.target.checked) {
                                // Add "every" and remove individual ordinals for this day
                                const filtered = recurringSlots.filter(
                                  (s) => !s.endsWith(`-${day}`)
                                );
                                setRecurringSlots([...filtered, slot]);
                              } else {
                                setRecurringSlots(recurringSlots.filter((s) => s !== slot));
                              }
                            }}
                            className="rounded border-input cursor-pointer"
                          />
                        </td>
                      );
                    })}
                  </tr>
                  {/* Ordinal rows */}
                  {ORDINALS.map((ordinal) => (
                    <tr key={ordinal}>
                      <td className="py-2 pr-4 text-muted-foreground">{ordinal}</td>
                      {DAYS.map((day) => {
                        const slot = `${ordinal}-${day}`;
                        const everySlot = `every-${day}`;
                        const isEvery = recurringSlots.includes(everySlot);
                        return (
                          <td key={day} className="text-center py-2 px-2">
                            <input
                              type="checkbox"
                              checked={isEvery || recurringSlots.includes(slot)}
                              disabled={isEvery}
                              aria-label={`${ordinal} ${day}`}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setRecurringSlots([...recurringSlots, slot]);
                                } else {
                                  setRecurringSlots(recurringSlots.filter((s) => s !== slot));
                                }
                              }}
                              className="rounded border-input cursor-pointer disabled:opacity-40"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !firstName.trim() || !lastName.trim()}>
            <Save className="size-4" />
            {saving ? 'Saving...' : 'Save Volunteer'}
          </Button>
        </div>
      </form>
    </div>
  );
}
