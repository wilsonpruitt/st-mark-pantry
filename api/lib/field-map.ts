/** Maps local Dexie table names to Supabase table names */
const TABLE_MAP: Record<string, string> = {
  clients: 'pantry_clients',
  visits: 'pantry_visits',
  volunteers: 'volunteers',
  volunteerShifts: 'pantry_volunteer_shifts',
  volunteerSignups: 'signups',
};

/** camelCase field → snake_case DB column per table */
const FIELD_MAP: Record<string, Record<string, string>> = {
  clients: {
    id: 'id',
    firstName: 'first_name',
    lastName: 'last_name',
    phone: 'phone',
    email: 'email',
    address: 'address',
    familyMembers: 'family_members',
    numberInFamily: 'number_in_family',
    notes: 'notes',
    acceptsPerishables: 'accepts_perishables',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  visits: {
    id: 'id',
    clientId: 'client_id',
    date: 'date',
    dayOfWeek: 'day_of_week',
    itemsReceived: 'items_received',
    servedBy: 'served_by',
    notes: 'notes',
    checkedInAt: 'checked_in_at',
    updatedAt: 'updated_at',
  },
  volunteers: {
    id: 'id',
    firstName: 'first_name',
    lastName: 'last_name',
    phone: 'phone',
    email: 'email',
    notes: 'notes',
    recurringDays: 'recurring_days',
    recurringSlots: 'recurring_slots',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  volunteerShifts: {
    id: 'id',
    volunteerId: 'volunteer_id',
    date: 'date',
    dayOfWeek: 'day_of_week',
    hoursWorked: 'hours_worked',
    role: 'role',
    notes: 'notes',
    updatedAt: 'updated_at',
  },
  volunteerSignups: {
    id: 'id',
    volunteerId: 'volunteer_id',
    date: 'date',
    dayOfWeek: 'day_of_week',
    role: 'role',
    status: 'status',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
};

/** Reverse maps (snake_case → camelCase) built once */
const REVERSE_MAP: Record<string, Record<string, string>> = {};
for (const [table, map] of Object.entries(FIELD_MAP)) {
  REVERSE_MAP[table] = {};
  for (const [camel, snake] of Object.entries(map)) {
    REVERSE_MAP[table][snake] = camel;
  }
}

export function getSupabaseTable(localTable: string): string {
  const mapped = TABLE_MAP[localTable];
  if (!mapped) throw new Error(`Unknown table: ${localTable}`);
  return mapped;
}

/** Convert a camelCase record to snake_case for Supabase */
export function toDB(
  tableName: string,
  record: Record<string, unknown>
): Record<string, unknown> {
  const map = FIELD_MAP[tableName];
  if (!map) throw new Error(`Unknown table: ${tableName}`);

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const dbKey = map[key];
    if (dbKey) {
      out[dbKey] = value ?? null;
    }
  }
  return out;
}

/** Convert a snake_case DB row to camelCase for the client */
export function fromDB(
  tableName: string,
  row: Record<string, unknown>
): Record<string, unknown> {
  const map = REVERSE_MAP[tableName];
  if (!map) throw new Error(`Unknown table: ${tableName}`);

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = map[key];
    if (camelKey) {
      out[camelKey] = value ?? undefined;
    }
  }
  return out;
}

export const ALL_TABLES = Object.keys(TABLE_MAP);
