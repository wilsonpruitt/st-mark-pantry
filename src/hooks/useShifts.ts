import { db } from '@/db/database';
import { enqueue } from '@/lib/sync-queue';
import type { PantryDay, VolunteerShift } from '@/types';

export function useShifts() {
  async function addShift(
    volunteerId: string,
    date: string,
    dayOfWeek: PantryDay,
    role?: string
  ): Promise<VolunteerShift> {
    const now = new Date().toISOString();
    const shift: VolunteerShift = {
      id: crypto.randomUUID(),
      volunteerId,
      date,
      dayOfWeek,
      role: role || undefined,
      updatedAt: now,
    };
    await db.volunteerShifts.add(shift);
    enqueue('volunteerShifts', shift.id, 'upsert', shift as unknown as Record<string, unknown>);
    return shift;
  }

  async function getShiftsForDate(date: string): Promise<VolunteerShift[]> {
    return db.volunteerShifts.where('date').equals(date).toArray();
  }

  async function getShiftsForVolunteer(volunteerId: string): Promise<VolunteerShift[]> {
    return db.volunteerShifts
      .where('volunteerId')
      .equals(volunteerId)
      .reverse()
      .sortBy('date');
  }

  async function updateShift(
    id: string,
    updates: Partial<Pick<VolunteerShift, 'hoursWorked' | 'role' | 'notes'>>
  ): Promise<void> {
    await db.volunteerShifts.update(id, { ...updates, updatedAt: new Date().toISOString() });
    const updated = await db.volunteerShifts.get(id);
    if (updated) {
      enqueue('volunteerShifts', id, 'upsert', updated as unknown as Record<string, unknown>);
    }
  }

  async function deleteShift(id: string): Promise<void> {
    await db.volunteerShifts.delete(id);
    enqueue('volunteerShifts', id, 'delete');
  }

  return { addShift, getShiftsForDate, getShiftsForVolunteer, updateShift, deleteShift };
}
