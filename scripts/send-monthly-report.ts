#!/usr/bin/env npx tsx
// Send the monthly stakeholder report.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/send-monthly-report.ts
//   npx tsx --env-file=.env.local scripts/send-monthly-report.ts --month=2026-03
//   npx tsx --env-file=.env.local scripts/send-monthly-report.ts --dry-run
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, FROM_EMAIL
// Recipients come from the Supabase `report_recipients` table
// (manage via the Supabase dashboard table editor).

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { monthlyReportEmail, type MonthlyReportStats } from '../lib/emails.js';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseArgs(argv: string[]): { month?: string; dryRun: boolean } {
  let month: string | undefined;
  let dryRun = false;
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run' || arg === '-n') dryRun = true;
    else if (arg.startsWith('--month=')) month = arg.split('=')[1];
  }
  return { month, dryRun };
}

function rangeForMonth(monthArg: string | undefined): { start: string; endExclusive: string; label: string } {
  let year: number;
  let month0: number;
  if (monthArg) {
    const m = /^(\d{4})-(\d{2})$/.exec(monthArg.trim());
    if (!m) throw new Error(`Invalid --month: "${monthArg}" (expected YYYY-MM)`);
    year = Number(m[1]);
    month0 = Number(m[2]) - 1;
  } else {
    const now = new Date();
    year = now.getUTCFullYear();
    month0 = now.getUTCMonth() - 1;
  }
  const startD = new Date(Date.UTC(year, month0, 1));
  const endD = new Date(Date.UTC(year, month0 + 1, 1));
  return {
    start: `${startD.getUTCFullYear()}-${pad2(startD.getUTCMonth() + 1)}-01`,
    endExclusive: `${endD.getUTCFullYear()}-${pad2(endD.getUTCMonth() + 1)}-01`,
    label: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(startD),
  };
}

function bucketFamilySize(size: number): string {
  if (size <= 1) return '1';
  if (size <= 2) return '2';
  if (size <= 4) return '3–4';
  if (size <= 6) return '5–6';
  return '7+';
}
const BUCKET_ORDER = ['1', '2', '3–4', '5–6', '7+'];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { month, dryRun } = parseArgs(process.argv);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL;

  const missing: string[] = [];
  if (!supabaseUrl) missing.push('SUPABASE_URL');
  if (!supabaseKey) missing.push('SUPABASE_SERVICE_KEY');
  if (!dryRun && !resendKey) missing.push('RESEND_API_KEY');
  if (!dryRun && !fromEmail) missing.push('FROM_EMAIL');
  if (missing.length > 0) {
    console.error(`Missing env vars: ${missing.join(', ')}`);
    console.error('Add them to .env.local, then:');
    console.error('  npx tsx --env-file=.env.local scripts/send-monthly-report.ts');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl!, supabaseKey!);
  const { start, endExclusive, label } = rangeForMonth(month);
  console.log(`Generating report for ${label} (${start} to ${endExclusive} exclusive)`);

  const { data: visits, error: visitsErr } = await supabase
    .from('pantry_visits')
    .select('id, client_id, date, day_of_week, deleted_at')
    .gte('date', start)
    .lt('date', endExclusive);
  if (visitsErr) throw new Error(`visits query failed: ${visitsErr.message}`);

  const liveVisits = (visits ?? []).filter((v: { deleted_at?: string | null }) => !v.deleted_at);

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
    const bucket = byDayMap.get(v.date) ?? {
      date: v.date,
      dayOfWeek: v.day_of_week,
      visits: 0,
      individuals: 0,
    };
    bucket.visits += 1;
    bucket.individuals += size;
    byDayMap.set(v.date, bucket);
  }

  const byDay = Array.from(byDayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const bucketCounts = new Map<string, number>();
  for (const size of familySizeByHousehold.values()) {
    const b = bucketFamilySize(size);
    bucketCounts.set(b, (bucketCounts.get(b) ?? 0) + 1);
  }
  const familySizeBuckets = BUCKET_ORDER
    .filter((b) => bucketCounts.has(b))
    .map((l) => ({ label: l, count: bucketCounts.get(l) ?? 0 }));

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

  console.log(JSON.stringify({ ...stats, byDay: `${byDay.length} sessions` }, null, 2));

  const { data: recipients, error: recipErr } = await supabase
    .from('report_recipients')
    .select('email')
    .eq('active', true);
  if (recipErr) throw new Error(`recipients query failed: ${recipErr.message}`);

  const emails = Array.from(
    new Set((recipients ?? []).map((r: { email: string }) => r.email.trim()).filter(Boolean))
  );

  if (emails.length === 0) {
    console.warn('No active recipients. Add rows via Supabase dashboard → Table Editor → report_recipients.');
    return;
  }

  const { subject, html } = monthlyReportEmail(stats);
  console.log(`\nSubject: ${subject}`);
  console.log(`Recipients (${emails.length}): ${emails.join(', ')}`);

  if (dryRun) {
    console.log('\n--dry-run: not sending.');
    return;
  }

  const resend = new Resend(resendKey!);
  let sent = 0;
  let failed = 0;
  for (const to of emails) {
    const { error } = await resend.emails.send({ from: fromEmail!, to, subject, html });
    if (error) {
      console.error(`send to ${to} failed:`, error);
      failed += 1;
    } else {
      console.log(`sent to ${to}`);
      sent += 1;
    }
    await sleep(600);
  }
  console.log(`\nDone: sent=${sent} failed=${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
