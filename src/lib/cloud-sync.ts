import { db } from '@/db/database';
import type { PantryDay } from '@/types';

interface SyncVolunteer {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  recurring_days: string[];
  recurring_slots: string[];
}

interface SyncSignup {
  id: string;
  volunteer_id: string;
  date: string;
  day_of_week: string;
  role: string | null;
  status: string;
  created_at: string;
}

interface SyncResult {
  newVolunteers: number;
  updatedVolunteers: number;
  newSignups: number;
}

/**
 * Pull volunteers and signups from Supabase into IndexedDB.
 * Uses incremental sync via lastCloudSync timestamp.
 */
export async function syncFromCloud(): Promise<SyncResult> {
  const lastSync = localStorage.getItem('lastCloudSync') || undefined;
  const url = lastSync
    ? `/api/public/sync-down?since=${encodeURIComponent(lastSync)}`
    : '/api/public/sync-down';

  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch from cloud');

  const data = (await res.json()) as {
    ok: boolean;
    volunteers: SyncVolunteer[];
    signups: SyncSignup[];
    syncedAt: string;
  };

  if (!data.ok) throw new Error('Sync failed');

  let newVolunteers = 0;
  let updatedVolunteers = 0;
  let newSignups = 0;

  // Build ID mapping: Supabase ID → local ID (for email-matched volunteers)
  const idMap: Record<string, string> = {};

  for (const sv of data.volunteers) {
    const existingById = await db.volunteers.get(sv.id);
    if (existingById) {
      await db.volunteers.update(sv.id, {
        firstName: sv.first_name,
        lastName: sv.last_name,
        email: sv.email || undefined,
        phone: sv.phone || undefined,
        recurringDays: sv.recurring_days as PantryDay[],
        recurringSlots: sv.recurring_slots,
      });
      idMap[sv.id] = sv.id;
      updatedVolunteers++;
      continue;
    }

    // Try to find by email (case-insensitive)
    if (sv.email) {
      const allVolunteers = await db.volunteers.toArray();
      const emailMatch = allVolunteers.find(
        (v) => v.email && v.email.toLowerCase() === sv.email!.toLowerCase()
      );
      if (emailMatch) {
        await db.volunteers.update(emailMatch.id, {
          firstName: sv.first_name,
          lastName: sv.last_name,
          phone: sv.phone || undefined,
          recurringDays: sv.recurring_days as PantryDay[],
          recurringSlots: sv.recurring_slots,
        });
        idMap[sv.id] = emailMatch.id;
        updatedVolunteers++;
        continue;
      }
    }

    // New volunteer
    const now = new Date().toISOString();
    await db.volunteers.add({
      id: sv.id,
      firstName: sv.first_name,
      lastName: sv.last_name,
      email: sv.email || undefined,
      phone: sv.phone || undefined,
      recurringDays: sv.recurring_days as PantryDay[],
      recurringSlots: sv.recurring_slots,
      createdAt: now,
      updatedAt: now,
    });
    idMap[sv.id] = sv.id;
    newVolunteers++;
  }

  for (const ss of data.signups) {
    const localVolunteerId = idMap[ss.volunteer_id] || ss.volunteer_id;

    const existing = await db.volunteerSignups
      .where('[volunteerId+date]')
      .equals([localVolunteerId, ss.date])
      .first();

    if (existing) continue;

    await db.volunteerSignups.add({
      id: ss.id,
      volunteerId: localVolunteerId,
      date: ss.date,
      dayOfWeek: ss.day_of_week as PantryDay,
      role: ss.role || undefined,
      status: ss.status as 'signed-up' | 'cancelled',
      createdAt: ss.created_at,
      updatedAt: ss.created_at,
    });
    newSignups++;
  }

  localStorage.setItem('lastCloudSync', data.syncedAt);

  return { newVolunteers, updatedVolunteers, newSignups };
}
