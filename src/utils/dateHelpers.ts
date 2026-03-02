import type { PantryDay } from '@/types';

/**
 * Returns today's date as 'YYYY-MM-DD' in local time.
 */
export function getTodayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns today's full day name (e.g. 'Monday', 'Friday', 'Wednesday').
 */
export function getTodayDayOfWeek(): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());
}

/**
 * Checks whether a given date (or today) falls on a pantry day (Monday or Friday).
 */
export function isPantryDay(date?: string): boolean {
  const d = date ? parseLocalDate(date) : new Date();
  const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(d);
  return dayName === 'Monday' || dayName === 'Friday' || dayName === 'Saturday';
}

/**
 * Returns 'Monday' or 'Friday' based on today's date.
 * If today is a pantry day, returns today's day.
 * Otherwise, returns whichever pantry day is nearest (past or future).
 */
export function getDefaultPantryDay(): PantryDay {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

  if (dayOfWeek === 1) return 'Monday';
  if (dayOfWeek === 5) return 'Friday';
  if (dayOfWeek === 6) return 'Saturday';

  // Calculate distance to each pantry day
  const days: { day: PantryDay; num: number }[] = [
    { day: 'Monday', num: 1 },
    { day: 'Friday', num: 5 },
    { day: 'Saturday', num: 6 },
  ];

  let closest: PantryDay = 'Monday';
  let minDist = Infinity;
  for (const { day, num } of days) {
    const dist = Math.min(
      Math.abs(dayOfWeek - num),
      Math.abs(dayOfWeek - num + 7),
      Math.abs(dayOfWeek - num - 7)
    );
    if (dist < minDist) {
      minDist = dist;
      closest = day;
    }
  }

  return closest;
}

/**
 * Formats an ISO date string as 'Mon, Feb 16, 2026'.
 */
export function formatDate(iso: string): string {
  const date = parseLocalDate(iso);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/**
 * Formats an ISO datetime string as '10:04 AM'.
 */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Returns the start and end dates (YYYY-MM-DD) for the calendar month
 * containing the given date (or today).
 */
export function getMonthRange(date?: string): { start: string; end: string } {
  const d = date ? parseLocalDate(date) : new Date();
  const year = d.getFullYear();
  const month = d.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  return {
    start: formatISO(firstDay),
    end: formatISO(lastDay),
  };
}

/**
 * Checks whether two ISO date strings fall in the same calendar month and year.
 */
export function isSameMonth(date1: string, date2: string): boolean {
  const d1 = parseLocalDate(date1);
  const d2 = parseLocalDate(date2);
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
}

/**
 * Returns a 'YYYY-MM-DD' string for `days` days ago.
 */
export function getDaysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatISO(d);
}

/**
 * Returns which occurrence (1-5) of a weekday this date is within its month.
 * E.g. Feb 16, 2026 (Monday) → 3 (3rd Monday of February).
 */
export function getOrdinalWeek(date: Date): number {
  const dayOfMonth = date.getDate();
  return Math.ceil(dayOfMonth / 7);
}

const ORDINAL_LABELS = ['1st', '2nd', '3rd', '4th', '5th'] as const;

/**
 * Returns the recurring slot string for a given ISO date.
 * E.g. "2026-02-16" (a Monday) → "3rd-Monday"
 */
export function getRecurringSlot(iso: string): string {
  const d = parseLocalDate(iso);
  const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(d);
  const ordinal = getOrdinalWeek(d);
  return `${ORDINAL_LABELS[ordinal - 1]}-${dayName}`;
}

/**
 * Checks if a volunteer's recurringSlots match a given date.
 * Handles both ordinal slots ("1st-Monday") and "every-Monday" format.
 * Falls back to legacy recurringDays if recurringSlots is empty.
 */
export function matchesRecurringSlot(
  recurringSlots: string[] | undefined,
  recurringDays: PantryDay[] | undefined,
  iso: string,
  dayOfWeek: PantryDay
): boolean {
  // Use recurringSlots if available
  if (recurringSlots && recurringSlots.length > 0) {
    const slot = getRecurringSlot(iso);
    const everySlot = `every-${dayOfWeek}`;
    return recurringSlots.includes(slot) || recurringSlots.includes(everySlot);
  }
  // Fall back to legacy recurringDays (treat as "every")
  if (recurringDays && recurringDays.length > 0) {
    return recurringDays.includes(dayOfWeek);
  }
  return false;
}

/**
 * Converts legacy recurringDays to recurringSlots format.
 * E.g. ['Monday', 'Friday'] → ['every-Monday', 'every-Friday']
 */
export function legacyDaysToSlots(recurringDays: PantryDay[]): string[] {
  return recurringDays.map(day => `every-${day}`);
}

/**
 * Formats a recurring slot for display.
 * E.g. "1st-Monday" → "1st Monday", "every-Friday" → "Every Friday"
 */
export function formatSlot(slot: string): string {
  const [ordinal, day] = slot.split('-');
  if (ordinal === 'every') return `Every ${day}`;
  return `${ordinal} ${day}`;
}

/**
 * Returns the start (Monday) and end (Sunday) of the week containing the given date.
 */
export function getWeekRange(date?: string): { start: string; end: string } {
  const d = date ? parseLocalDate(date) : new Date();
  const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: formatISO(monday), end: formatISO(sunday) };
}

/**
 * Returns a 'YYYY-MM-DD' string for the first day of a month offset from a reference.
 * E.g. offsetMonth('2026-03-15', -1) → '2026-02-01'
 */
export function offsetMonth(refDate: string, offset: number): string {
  const d = parseLocalDate(refDate);
  d.setMonth(d.getMonth() + offset, 1);
  return formatISO(d);
}

// ---- Helpers ----

/**
 * Parses a 'YYYY-MM-DD' or full ISO datetime string as a local date (not UTC).
 */
export function parseLocalDate(iso: string): Date {
  const dateOnly = iso.includes('T') ? iso.split('T')[0] : iso;
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Formats a Date object as 'YYYY-MM-DD'.
 */
export function formatISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
