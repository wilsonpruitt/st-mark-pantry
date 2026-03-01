export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface FamilyMember {
  name: string;
  relationship?: string;
  age?: number;
}

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  address: Address;
  familyMembers: FamilyMember[];
  numberInFamily: number;
  notes?: string;
  acceptsPerishables?: boolean; // undefined/true = eligible, false = no perishables
  createdAt: string;
  updatedAt: string;
}

export interface Visit {
  id: string;
  clientId: string;
  date: string;
  dayOfWeek: PantryDay;
  itemsReceived?: string;
  servedBy?: string;
  notes?: string;
  checkedInAt: string; // ISO datetime for the timestamp display
  updatedAt: string;
}

export interface Volunteer {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  notes?: string;
  recurringDays?: PantryDay[];       // deprecated, kept for backward compat
  recurringSlots?: string[];          // e.g. ['1st-Monday', 'every-Friday', '2nd-Saturday']
  createdAt: string;
  updatedAt: string;
}

export interface VolunteerShift {
  id: string;
  volunteerId: string;
  date: string;
  dayOfWeek: PantryDay;
  hoursWorked?: number;
  role?: string;
  notes?: string;
  updatedAt: string;
}

export interface VolunteerSignup {
  id: string;
  volunteerId: string;
  date: string;        // ISO date for the specific session
  dayOfWeek: PantryDay;
  role?: string;
  status: 'signed-up' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export type PantryDay = 'Monday' | 'Friday' | 'Saturday';

export interface SyncQueueEntry {
  seqNo?: number;
  tableName: string;
  recordId: string;
  action: 'upsert' | 'delete';
  payload?: Record<string, unknown>;
  createdAt: string;
}
