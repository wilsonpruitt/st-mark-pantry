import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../../lib/supabase.js';
import { getResend, FROM_EMAIL } from '../../lib/resend.js';
import { monthlyReportEmail, type MonthlyReportStats } from '../../lib/emails.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Returns the YYYY-MM-01 start (inclusive) and YYYY-MM-01 next-month start
 * (exclusive) for the month prior to `now`.
 */
function priorMonthRange(now: Date): { start: string; endExclusive: string; label: string } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-11; prior month is month - 1
  const prior = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month, 1));
  const start = `${prior.getUTCFullYear()}-${pad2(prior.getUTCMonth() + 1)}-01`;
  const endExclusive = `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-01`;
  const label = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(prior);
  return { start, endExclusive, label };
}

function bucketFamilySize(size: number): string {
  if (size <= 1) return '1';
  if (size <= 2) return '2';
  if (size <= 4) return '3–4';
  if (size <= 6) return '5–6';
  return '7+';
}

const BUCKET_ORDER = ['1', '2', '3–4', '5–6', '7+'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabase = getSupabase();
    const { start, endExclusive, label } = priorMonthRange(new Date());

    // Pull visits in the window
    const { data: visits, error: visitsErr } = await supabase
      .from('pantry_visits')
      .select('id, client_id, date, day_of_week, deleted_at')
      .gte('date', start)
      .lt('date', endExclusive);
    if (visitsErr) throw new Error(`visits query failed: ${visitsErr.message}`);

    const liveVisits = (visits ?? []).filter((v: { deleted_at?: string | null }) => !v.deleted_at);

    // Pull clients (we need family size + perishables + createdAt) — not huge, fetch all
    const { data: clients, error: clientsErr } = await supabase
      .from('pantry_clients')
      .select('id, number_in_family, accepts_perishables, created_at, deleted_at');
    if (clientsErr) throw new Error(`clients query failed: ${clientsErr.message}`);

    const clientMap = new Map<string, { numberInFamily: number; acceptsPerishables: boolean | null; createdAt: string }>();
    for (const c of clients ?? []) {
      const row = c as {
        id: string;
        number_in_family: number | null;
        accepts_perishables: boolean | null;
        created_at: string;
        deleted_at: string | null;
      };
      if (row.deleted_at) continue;
      clientMap.set(row.id, {
        numberInFamily: row.number_in_family ?? 1,
        acceptsPerishables: row.accepts_perishables,
        createdAt: row.created_at,
      });
    }

    // Aggregate
    const totalVisits = liveVisits.length;
    const byDayMap = new Map<string, { date: string; dayOfWeek: string; visits: number; individuals: number }>();
    const householdIds = new Set<string>();
    let totalIndividualsServed = 0;
    const perishablesEligibleHouseholds = new Set<string>();
    const perishablesRestrictedHouseholds = new Set<string>();
    const familySizeByHousehold = new Map<string, number>();

    for (const v of liveVisits as Array<{ client_id: string; date: string; day_of_week: string }>) {
      const c = clientMap.get(v.client_id);
      const size = c?.numberInFamily ?? 1;
      totalIndividualsServed += size;
      householdIds.add(v.client_id);
      familySizeByHousehold.set(v.client_id, size);
      if (c) {
        if (c.acceptsPerishables === false) perishablesRestrictedHouseholds.add(v.client_id);
        else perishablesEligibleHouseholds.add(v.client_id);
      }
      const key = v.date;
      const bucket = byDayMap.get(key) ?? {
        date: v.date,
        dayOfWeek: v.day_of_week,
        visits: 0,
        individuals: 0,
      };
      bucket.visits += 1;
      bucket.individuals += size;
      byDayMap.set(key, bucket);
    }

    const byDay = Array.from(byDayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Family-size distribution over unique households served this month
    const bucketCounts = new Map<string, number>();
    for (const size of familySizeByHousehold.values()) {
      const b = bucketFamilySize(size);
      bucketCounts.set(b, (bucketCounts.get(b) ?? 0) + 1);
    }
    const familySizeBuckets = BUCKET_ORDER
      .filter((b) => bucketCounts.has(b))
      .map((label) => ({ label, count: bucketCounts.get(label) ?? 0 }));

    // New clients: createdAt within the month
    let newClients = 0;
    for (const c of clientMap.values()) {
      if (c.createdAt >= start && c.createdAt < endExclusive) newClients += 1;
    }

    const stats: MonthlyReportStats = {
      monthLabel: label,
      totalVisits,
      uniqueHouseholds: householdIds.size,
      uniqueClients: householdIds.size,
      totalIndividualsServed,
      newClients,
      byDay,
      familySizeBuckets,
      perishablesEligible: perishablesEligibleHouseholds.size,
      perishablesRestricted: perishablesRestrictedHouseholds.size,
    };

    // Recipients
    const { data: recipients, error: recipErr } = await supabase
      .from('report_recipients')
      .select('email')
      .eq('active', true);
    if (recipErr) throw new Error(`recipients query failed: ${recipErr.message}`);

    const emails = Array.from(
      new Set((recipients ?? []).map((r: { email: string }) => r.email.trim()).filter(Boolean))
    );

    if (emails.length === 0) {
      console.log(`[cron/monthly-report] ${label}: no active recipients — skipped send`);
      return res.status(200).json({ ok: true, label, sent: 0, skipped: 'no-recipients', stats });
    }

    const { subject, html } = monthlyReportEmail(stats);
    const resend = getResend();
    let sent = 0;
    let failed = 0;
    for (const to of emails) {
      const { error } = await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
      if (error) {
        console.error(`[cron/monthly-report] send to ${to} failed:`, error);
        failed += 1;
      } else {
        sent += 1;
      }
      await sleep(600);
    }

    console.log(`[cron/monthly-report] ${label} sent=${sent} failed=${failed} recipients=${emails.length}`);
    return res.status(200).json({ ok: true, label, sent, failed, recipients: emails.length });
  } catch (err) {
    console.error('Cron monthly-report error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
}
