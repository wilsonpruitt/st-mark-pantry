import Dexie, { type Table } from 'dexie';
import type { Client, Visit, Volunteer, VolunteerShift, VolunteerSignup, SyncQueueEntry } from '@/types';
import type { FPLTable } from '@/lib/seed-data';

export class PantryDatabase extends Dexie {
  clients!: Table<Client>;
  visits!: Table<Visit>;
  volunteers!: Table<Volunteer>;
  volunteerShifts!: Table<VolunteerShift>;
  volunteerSignups!: Table<VolunteerSignup>;
  syncQueue!: Table<SyncQueueEntry>;
  fplTables!: Table<FPLTable>;

  constructor() {
    super('st-mark-pantry');
    this.version(1).stores({
      clients: 'id, firstName, lastName, [firstName+lastName], createdAt',
      visits: 'id, clientId, date, [clientId+date], dayOfWeek',
      volunteers: 'id, firstName, lastName, createdAt',
      volunteerShifts: 'id, volunteerId, date, dayOfWeek',
    });

    // Version 2: schema unchanged (non-indexed fields don't require migration)
    this.version(2).stores({
      clients: 'id, firstName, lastName, [firstName+lastName], createdAt',
      visits: 'id, clientId, date, [clientId+date], dayOfWeek',
      volunteers: 'id, firstName, lastName, createdAt',
      volunteerShifts: 'id, volunteerId, date, dayOfWeek',
    });

    // Version 3: add volunteer scheduling (signups table + recurringDays on volunteers)
    this.version(3).stores({
      clients: 'id, firstName, lastName, [firstName+lastName], createdAt',
      visits: 'id, clientId, date, [clientId+date], dayOfWeek',
      volunteers: 'id, firstName, lastName, createdAt',
      volunteerShifts: 'id, volunteerId, date, dayOfWeek',
      volunteerSignups: 'id, volunteerId, date, [volunteerId+date], dayOfWeek, status',
    });

    // Version 4: add recurringSlots on volunteers (non-indexed field, no schema change needed)
    this.version(4).stores({
      clients: 'id, firstName, lastName, [firstName+lastName], createdAt',
      visits: 'id, clientId, date, [clientId+date], dayOfWeek',
      volunteers: 'id, firstName, lastName, createdAt',
      volunteerShifts: 'id, volunteerId, date, dayOfWeek',
      volunteerSignups: 'id, volunteerId, date, [volunteerId+date], dayOfWeek, status',
    });

    // Version 5: add syncQueue table + updatedAt index on all tables for cloud sync
    this.version(5).stores({
      clients: 'id, firstName, lastName, [firstName+lastName], createdAt, updatedAt',
      visits: 'id, clientId, date, [clientId+date], dayOfWeek, updatedAt',
      volunteers: 'id, firstName, lastName, createdAt, updatedAt',
      volunteerShifts: 'id, volunteerId, date, dayOfWeek, updatedAt',
      volunteerSignups: 'id, volunteerId, date, [volunteerId+date], dayOfWeek, status, updatedAt',
      syncQueue: '++seqNo, tableName, recordId, createdAt',
    }).upgrade(async (tx) => {
      const now = new Date().toISOString();
      const tables = [
        tx.table('visits'),
        tx.table('volunteers'),
        tx.table('volunteerShifts'),
        tx.table('volunteerSignups'),
      ];
      for (const table of tables) {
        await table.toCollection().modify((record: Record<string, unknown>) => {
          if (!record.updatedAt) {
            record.updatedAt = (record.createdAt as string) || now;
          }
        });
      }
    });

    // Version 6: add fplTables store for bundled poverty-guideline seed data
    // (Cupboard compliance foundation). Additive — existing data untouched.
    this.version(6).stores({
      clients: 'id, firstName, lastName, [firstName+lastName], createdAt, updatedAt',
      visits: 'id, clientId, date, [clientId+date], dayOfWeek, updatedAt',
      volunteers: 'id, firstName, lastName, createdAt, updatedAt',
      volunteerShifts: 'id, volunteerId, date, dayOfWeek, updatedAt',
      volunteerSignups: 'id, volunteerId, date, [volunteerId+date], dayOfWeek, status, updatedAt',
      syncQueue: '++seqNo, tableName, recordId, createdAt',
      fplTables: '[year+region], year, region, effectiveFrom',
    });

    // Version 7: migrate FamilyMember.age → dateOfBirth (synthetic Jan-1 DOB,
    // dobEstimated:true). Deterministic — anchored to each client's recorded
    // year, not "now" — so every device converges. updatedAt deliberately NOT
    // bumped (avoids a sync storm; the same migration runs on every device).
    this.version(7).stores({
      clients: 'id, firstName, lastName, [firstName+lastName], createdAt, updatedAt',
      visits: 'id, clientId, date, [clientId+date], dayOfWeek, updatedAt',
      volunteers: 'id, firstName, lastName, createdAt, updatedAt',
      volunteerShifts: 'id, volunteerId, date, dayOfWeek, updatedAt',
      volunteerSignups: 'id, volunteerId, date, [volunteerId+date], dayOfWeek, status, updatedAt',
      syncQueue: '++seqNo, tableName, recordId, createdAt',
      fplTables: '[year+region], year, region, effectiveFrom',
    }).upgrade(async (tx) => {
      const { normalizeFamilyMember, recordYear } = await import('@/lib/family');
      await tx.table('clients').toCollection().modify((client: Record<string, unknown>) => {
        const members = client.familyMembers;
        if (!Array.isArray(members)) return;
        const asOfYear = recordYear(client as { createdAt?: string; updatedAt?: string });
        client.familyMembers = members.map((m) =>
          normalizeFamilyMember(m as Record<string, unknown>, asOfYear),
        );
      });
    });
  }
}

export const db = new PantryDatabase();
