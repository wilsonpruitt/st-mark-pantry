import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { enqueue } from '@/lib/sync-queue';
import type { Volunteer } from '@/types';

interface AddVolunteerInput {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  notes?: string;
}

interface UpdateVolunteerInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export function useVolunteers() {
  const volunteers = useLiveQuery(
    () => db.volunteers.orderBy('lastName').toArray(),
    []
  );

  async function addVolunteer(input: AddVolunteerInput): Promise<Volunteer> {
    const now = new Date().toISOString();
    const volunteer: Volunteer = {
      id: crypto.randomUUID(),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone?.trim() || undefined,
      email: input.email?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    await db.volunteers.add(volunteer);
    enqueue('volunteers', volunteer.id, 'upsert', volunteer as unknown as Record<string, unknown>);
    return volunteer;
  }

  async function updateVolunteer(
    id: string,
    input: UpdateVolunteerInput
  ): Promise<void> {
    const updates: Partial<Volunteer> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.firstName !== undefined) updates.firstName = input.firstName.trim();
    if (input.lastName !== undefined) updates.lastName = input.lastName.trim();
    if (input.phone !== undefined) updates.phone = input.phone.trim() || undefined;
    if (input.email !== undefined) updates.email = input.email.trim() || undefined;
    if (input.notes !== undefined) updates.notes = input.notes.trim() || undefined;

    await db.volunteers.update(id, updates);
    const updated = await db.volunteers.get(id);
    if (updated) {
      enqueue('volunteers', id, 'upsert', updated as unknown as Record<string, unknown>);
    }
  }

  async function deleteVolunteer(id: string): Promise<void> {
    // Collect related IDs before deleting for sync queue
    const signups = await db.volunteerSignups.where('volunteerId').equals(id).toArray();
    const shifts = await db.volunteerShifts.where('volunteerId').equals(id).toArray();

    await db.transaction('rw', [db.volunteers, db.volunteerShifts, db.volunteerSignups], async () => {
      await db.volunteerSignups.where('volunteerId').equals(id).delete();
      await db.volunteerShifts.where('volunteerId').equals(id).delete();
      await db.volunteers.delete(id);
    });

    enqueue('volunteers', id, 'delete');
    for (const signup of signups) {
      enqueue('volunteerSignups', signup.id, 'delete');
    }
    for (const shift of shifts) {
      enqueue('volunteerShifts', shift.id, 'delete');
    }
  }

  return {
    volunteers: volunteers ?? [],
    addVolunteer,
    updateVolunteer,
    deleteVolunteer,
  };
}
