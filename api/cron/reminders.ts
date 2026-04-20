import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../../lib/supabase.js';
import { getResend, FROM_EMAIL } from '../../lib/resend.js';
import { reminderEmail } from '../../lib/emails.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDayOfWeek(d: Date): string | null {
  const dow = d.getDay();
  if (dow === 1) return 'Monday';
  if (dow === 5) return 'Friday';
  if (dow === 6) return 'Saturday';
  return null;
}

function getOrdinalWeek(d: Date): number {
  return Math.ceil(d.getDate() / 7);
}

const ORDINAL_LABELS = ['1st', '2nd', '3rd', '4th', '5th'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Target date = today + 3 days
    const now = new Date();
    const target = new Date(now);
    target.setDate(target.getDate() + 3);
    const targetDate = formatISODate(target);
    const dayOfWeek = getDayOfWeek(target);

    // Only send reminders for Monday or Friday sessions
    if (!dayOfWeek) {
      return res.status(200).json({
        ok: true,
        message: `Target date ${targetDate} is not a pantry day`,
        sent: 0,
        skipped: 0,
        failed: 0,
      });
    }

    // Compute the ordinal slot for the target date (e.g. "2nd-Monday")
    const ordinal = getOrdinalWeek(target);
    const ordinalSlot = `${ORDINAL_LABELS[ordinal - 1]}-${dayOfWeek}`;
    const everySlot = `every-${dayOfWeek}`;

    // Gather volunteers to remind:
    // 1a. Volunteers with matching recurring_slots (new format)
    const { data: slotVolunteersOrdinal } = await getSupabase()
      .from('volunteers')
      .select('id, first_name, email')
      .not('email', 'is', null)
      .contains('recurring_slots', [ordinalSlot]);

    const { data: slotVolunteersEvery } = await getSupabase()
      .from('volunteers')
      .select('id, first_name, email')
      .not('email', 'is', null)
      .contains('recurring_slots', [everySlot]);

    // 1b. Legacy: recurring volunteers matching this day (old format)
    const { data: recurringVolunteers } = await getSupabase()
      .from('volunteers')
      .select('id, first_name, email, recurring_slots')
      .not('email', 'is', null)
      .contains('recurring_days', [dayOfWeek]);

    // 2. Explicit signups for this date
    const { data: explicitSignups } = await getSupabase()
      .from('signups')
      .select('volunteer_id, role')
      .eq('date', targetDate)
      .eq('status', 'signed-up');

    // 3. Cancelled signups for this date (to exclude recurring volunteers)
    const { data: cancelledSignups } = await getSupabase()
      .from('signups')
      .select('volunteer_id')
      .eq('date', targetDate)
      .eq('status', 'cancelled');

    const cancelledIds = new Set((cancelledSignups || []).map((s) => s.volunteer_id));

    // Build volunteer set: recurring (not cancelled) + explicit signups
    const toRemind = new Map<string, { firstName: string; email: string; role?: string }>();

    // Add volunteers with recurring_slots match (new format)
    for (const v of slotVolunteersOrdinal || []) {
      if (!cancelledIds.has(v.id) && v.email) {
        toRemind.set(v.id, { firstName: v.first_name, email: v.email });
      }
    }
    for (const v of slotVolunteersEvery || []) {
      if (!cancelledIds.has(v.id) && v.email && !toRemind.has(v.id)) {
        toRemind.set(v.id, { firstName: v.first_name, email: v.email });
      }
    }

    // Add legacy recurring_days volunteers (only if they don't have recurring_slots)
    for (const v of recurringVolunteers || []) {
      const hasSlots = v.recurring_slots && Array.isArray(v.recurring_slots) && v.recurring_slots.length > 0;
      if (!hasSlots && !cancelledIds.has(v.id) && v.email && !toRemind.has(v.id)) {
        toRemind.set(v.id, { firstName: v.first_name, email: v.email });
      }
    }

    // For explicit signups, fetch volunteer email if not already in map
    if (explicitSignups && explicitSignups.length > 0) {
      const signupVolunteerIds = explicitSignups
        .map((s) => s.volunteer_id)
        .filter((id) => !toRemind.has(id));

      if (signupVolunteerIds.length > 0) {
        const { data: signupVolunteers } = await getSupabase()
          .from('volunteers')
          .select('id, first_name, email')
          .in('id', signupVolunteerIds)
          .not('email', 'is', null);

        for (const v of signupVolunteers || []) {
          if (v.email) {
            const signup = explicitSignups.find((s) => s.volunteer_id === v.id);
            toRemind.set(v.id, { firstName: v.first_name, email: v.email, role: signup?.role });
          }
        }
      }
    }

    // Check for already-sent reminders (dedup). Skip the query entirely when
    // there's nobody to remind — avoids a sentinel `__none__` that could
    // theoretically collide with a real volunteer id.
    const volunteerIds = Array.from(toRemind.keys());
    const alreadySentIds = new Set<string>();
    if (volunteerIds.length > 0) {
      const { data: alreadySent } = await getSupabase()
        .from('notifications')
        .select('volunteer_id')
        .in('volunteer_id', volunteerIds)
        .eq('session_date', targetDate)
        .eq('type', 'reminder');
      for (const n of alreadySent || []) alreadySentIds.add(n.volunteer_id);
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const [volunteerId, { firstName, email, role }] of toRemind) {
      if (alreadySentIds.has(volunteerId)) {
        skipped++;
        continue;
      }

      const { subject, html } = reminderEmail(firstName, targetDate, dayOfWeek, role);

      const { error: emailError } = await getResend().emails.send({
        from: FROM_EMAIL,
        to: email,
        subject,
        html,
      });

      if (emailError) {
        console.error(`Failed to send reminder to ${email}:`, emailError);
        failed++;
      } else {
        sent++;
        // Record notification
        await getSupabase().from('notifications').insert({
          volunteer_id: volunteerId,
          session_date: targetDate,
          type: 'reminder',
        });
      }

      // 600ms throttle for Resend 2 req/sec limit
      await sleep(600);
    }

    console.log(
      `[cron/reminders] targetDate=${targetDate} day=${dayOfWeek} sent=${sent} skipped=${skipped} failed=${failed}`
    );
    return res.status(200).json({ ok: true, targetDate, dayOfWeek, sent, skipped, failed });
  } catch (err) {
    console.error('Cron reminders error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
