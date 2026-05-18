#!/usr/bin/env npx tsx
// Onboard a new Cupboard tenant: attach its subdomain + create the tenants row.
//
// Usage (dry-run by default — prints the plan, touches nothing):
//   npx tsx --env-file=.env.local scripts/onboard-tenant.ts \
//     --slug=hopechapel --name="Hope Chapel Pantry"
//
// Execute for real:
//   npx tsx --env-file=.env.local scripts/onboard-tenant.ts \
//     --slug=hopechapel --name="Hope Chapel Pantry" --commit
//
// Options:
//   --slug=            (required) DNS label; becomes {slug}.cupboard.cc
//   --name=            (required) display name
//   --plan=            free | pro | cloud           (default free)
//   --gate-password=   between-shifts device lock   (default = slug)
//   --compliance-mode= standalone | tefap           (default standalone)
//   --intake-modes=    csv of household,anonymous   (default household)
//   --distributions=   csv of groceries,prepared_meals (default groceries)
//   --admin-user-id=   optional Supabase auth user UUID -> tenant_members admin row
//                      (full email invite waits on Track A #2 auth)
//   --skip-domain      skip the `vercel domains add` step
//   --commit           actually perform the actions (otherwise dry-run)
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (from .env.local)

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DOMAIN_SUFFIX = 'cupboard.cc';
const VALID_PLANS = ['free', 'pro', 'cloud'];
const VALID_COMPLIANCE = ['standalone', 'tefap'];
const VALID_INTAKE = ['household', 'anonymous'];
const VALID_DISTRIBUTIONS = ['groceries', 'prepared_meals'];
// DNS label: 1–32 chars, lowercase alnum + internal hyphens.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
function flag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}
function die(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function csvList(raw: string | undefined, fallback: string[], allowed: string[], label: string): string[] {
  const list = (raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : fallback);
  for (const v of list) {
    if (!allowed.includes(v)) die(`${label}: "${v}" is not one of ${allowed.join(', ')}`);
  }
  if (list.length === 0) die(`${label}: must have at least one value`);
  return list;
}

async function main() {
  const slug = arg('slug');
  const name = arg('name');
  if (!slug || !name) die('--slug and --name are required');
  if (!SLUG_RE.test(slug)) die(`--slug "${slug}" must be a DNS label: lowercase alnum + internal hyphens, 1–32 chars`);

  const plan = arg('plan') ?? 'free';
  if (!VALID_PLANS.includes(plan)) die(`--plan must be one of ${VALID_PLANS.join(', ')}`);

  const complianceMode = arg('compliance-mode') ?? 'standalone';
  if (!VALID_COMPLIANCE.includes(complianceMode)) die(`--compliance-mode must be one of ${VALID_COMPLIANCE.join(', ')}`);

  const gatePassword = arg('gate-password') ?? slug;
  const intakeModes = csvList(arg('intake-modes'), ['household'], VALID_INTAKE, '--intake-modes');
  const distributions = csvList(arg('distributions'), ['groceries'], VALID_DISTRIBUTIONS, '--distributions');

  const adminUserId = arg('admin-user-id');
  if (adminUserId && !UUID_RE.test(adminUserId)) die('--admin-user-id must be a UUID');

  const skipDomain = flag('skip-domain');
  const commit = flag('commit');
  const domain = `${slug}.${DOMAIN_SUFFIX}`;

  // Resolve the linked Vercel project/team for the domain step.
  let vercelScope = '';
  let vercelProject = '';
  try {
    const link = JSON.parse(readFileSync('.vercel/project.json', 'utf8'));
    vercelScope = link.orgId ?? '';
    vercelProject = link.projectName ?? '';
  } catch {
    if (!skipDomain) die('Could not read .vercel/project.json — run from the repo root, or pass --skip-domain');
  }

  console.log(`\nCupboard tenant onboarding ${commit ? '(LIVE)' : '(dry-run — pass --commit to execute)'}`);
  console.log('─'.repeat(60));
  console.log(`  slug             ${slug}`);
  console.log(`  domain           ${domain}`);
  console.log(`  name             ${name}`);
  console.log(`  plan             ${plan}`);
  console.log(`  gate_password    ${gatePassword}`);
  console.log(`  compliance_mode  ${complianceMode}`);
  console.log(`  intake_modes     ${JSON.stringify(intakeModes)}`);
  console.log(`  distributions    ${JSON.stringify(distributions)}`);
  console.log(`  admin user_id    ${adminUserId ?? '(none — link after auth #2 lands)'}`);
  console.log(`  domain step      ${skipDomain ? 'skipped' : `vercel domains add ${domain} ${vercelProject}`}`);
  console.log('─'.repeat(60));

  if (!commit) {
    console.log('\nDry run complete. Re-run with --commit to apply.\n');
    return;
  }

  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !supaKey) die('SUPABASE_URL / SUPABASE_SERVICE_KEY not set (use --env-file=.env.local)');
  const supabase = createClient(supaUrl, supaKey);

  // 1. tenants row — fail clearly if the slug is taken.
  const { data: existing } = await supabase.from('tenants').select('id').eq('slug', slug).maybeSingle();
  if (existing) die(`tenant slug "${slug}" already exists (id ${existing.id}) — aborting`);

  const { data: tenant, error: insErr } = await supabase
    .from('tenants')
    .insert({
      slug,
      name,
      plan,
      gate_password: gatePassword,
      compliance_mode: complianceMode,
      intake_modes: intakeModes,
      distributions,
    })
    .select('id')
    .single();
  if (insErr || !tenant) die(`tenants insert failed: ${insErr?.message ?? 'no row returned'}`);
  console.log(`✓ tenants row created (id ${tenant.id})`);

  // 2. optional admin membership (full invite flow waits on auth #2)
  if (adminUserId) {
    const { error: memErr } = await supabase
      .from('tenant_members')
      .insert({ user_id: adminUserId, tenant_id: tenant.id, role: 'admin' });
    if (memErr) console.error(`✗ tenant_members insert failed (tenant still created): ${memErr.message}`);
    else console.log(`✓ admin membership linked for user ${adminUserId}`);
  }

  // 3. attach the subdomain to the Vercel project
  if (!skipDomain) {
    try {
      const out = execFileSync(
        'npx',
        ['vercel', 'domains', 'add', domain, vercelProject, '--scope', vercelScope, '--yes'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      console.log(`✓ domain attached:\n${out.trim()}`);
    } catch (e) {
      const err = e as { stderr?: string; message?: string };
      console.error(`✗ vercel domains add failed: ${err.stderr ?? err.message}`);
      console.error(`  Tenant row was created. Add the domain manually:`);
      console.error(`    npx vercel domains add ${domain} ${vercelProject} --scope ${vercelScope}`);
    }
  } else {
    console.log(`\nNext: attach the subdomain when ready —`);
    console.log(`  npx vercel domains add ${domain} ${vercelProject} --scope ${vercelScope}`);
  }

  console.log(`\n✓ ${slug} onboarded. PWA will route via middleware.ts at https://${domain}\n`);
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
