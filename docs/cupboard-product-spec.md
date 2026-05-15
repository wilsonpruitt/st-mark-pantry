# Cupboard — Product Spec

**Status:** Draft, 2026-04-22
**Origin:** St. Mark Legacy Food Pantry (internal tool) → productized for small feeding ministries nationwide
**Target users:** Church and community-run food pantries, soup kitchens, meal programs, backpack ministries, mobile distributions — especially those that can't or won't run on cloud-only SaaS

---

## 1. Product modes (three orthogonal toggles)

Set during onboarding; changeable in Settings.

```ts
PantrySettings.complianceMode:  'tefap' | 'standalone'
PantrySettings.intakeModes:     Array<'household' | 'anonymous-count'>
PantrySettings.distributions:   Array<'groceries' | 'prepared-meals'>
```

Default for new installs: `standalone`, `['household']`, `['groceries']` — matches the largest and lowest-stakes user persona.

### Example configurations

| Ministry | complianceMode | intakeModes | distributions |
|---|---|---|---|
| St. Mark Pantry (today) | standalone | household | groceries |
| TEFAP pantry | tefap | household | groceries |
| Soup kitchen (non-TEFAP) | standalone | anonymous-count | prepared-meals |
| Soup kitchen (TEFAP-funded) | tefap | anonymous-count | prepared-meals |
| Church doing both | standalone | household + anonymous-count | groceries + prepared-meals |
| Mobile pantry | standalone or tefap | household | groceries |
| Backpack program | standalone | household | groceries |

---

## 2. Data model

### Existing (carry forward from St. Mark app)

- `Client` — head-of-household record; **add** `dateOfBirth?: string`, `tefap?: TEFAPCertification`
- `FamilyMember` — **replace** `age?: number` with `dateOfBirth?: string` (migration computes synthetic Jan 1 DOB from age; flags `dobEstimated: true`)
- `Visit` — **add** `householdSizeAtVisit: number`, `poundsDistributed?: number`, `commodityItems?: CommodityItem[]`, `intakeMode: 'household'` (constant for this table)
- `Volunteer`, `VolunteerShift`, `VolunteerSignup` — unchanged
- `SyncQueueEntry` — unchanged

### New

```ts
interface MealService {
  id: string;
  date: string;
  serviceType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other';
  mealsServed: number;
  childrenCount?: number;        // <18
  adultCount?: number;           // 18-59
  seniorCount?: number;          // 60+
  volunteerCount?: number;
  poundsFood?: number;
  usdaCommodityPounds?: number;
  notes?: string;
  updatedAt: string;
}

interface TEFAPCertification {
  lastCertifiedAt: string;
  certifiedFor: string;          // e.g. 'FY2026'
  eligibilityBasis:
    | { type: 'categorical'; programs: string[] }
    | { type: 'income-attestation' };
  residencyConfirmed: boolean;
  signaturePng: string;          // data URL
  signedByName: string;
  signedByStaff?: string;        // staff PIN holder if assisted
  signedAt: string;
  signatureMethod: 'touch' | 'mouse' | 'pen' | 'paper-scan' | 'verbal-attestation';
  raceEthnicity?: {
    declined?: boolean;
    race?: string[];
    ethnicity?: 'hispanic' | 'not-hispanic' | 'declined';
  };
}

interface PantrySettings {
  id: 'default';
  pantryName: string;
  state: string;                 // 'TX'
  serviceAreaZips: string[];
  distributionDays: Array<'Monday'|'Tuesday'|'Wednesday'|'Thursday'|'Friday'|'Saturday'|'Sunday'>;
  complianceMode: 'tefap' | 'standalone';
  intakeModes: Array<'household' | 'anonymous-count'>;
  distributions: Array<'groceries' | 'prepared-meals'>;
  fplMultiplier: number;         // 1.85, 3.0
  fplYear: string;               // 'FY2026'
  categoricalPrograms: string[];
  reportingCadence?: 'monthly' | 'quarterly';
  reportingFoodBank?: string;
  staffPins?: Array<{ name: string; pinHash: string }>;
  standaloneCollects?: {
    dateOfBirth?: boolean;
    familyDetails?: boolean;
    customFields?: Array<{ key: string; label: string; type: 'text'|'bool'|'number' }>;
  };
}

interface FPLTable {
  year: string;                  // 'FY2026'
  effectiveFrom: string;
  region: 'contiguous' | 'alaska' | 'hawaii';
  thresholds: Record<number, number>;
  perAdditionalPerson: number;
}
```

### Dexie v6 store bumps

```
clients:         'id, firstName, lastName, [firstName+lastName], createdAt, updatedAt, tefap.lastCertifiedAt'
visits:          'id, clientId, date, [clientId+date], dayOfWeek, updatedAt, householdSizeAtVisit'
mealServices:    'id, date, serviceType, updatedAt'
pantrySettings:  'id'
fplTables:       'year, effectiveFrom, region'
```

---

## 3. Intake form — conditional rendering

Single long scroll. Sections render or hide based on mode toggles.

| Section | household mode | anonymous-count mode | tefap adds |
|---|---|---|---|
| 1. Household info (name, address, DOB, family members) | ✅ | ❌ | DOB required for head |
| 2. Eligibility (categorical or income attestation) | tefap only | n/a | ✅ required |
| 3. Voluntary demographics | tefap only | rolled into MealService counts | ✅ required (with decline) |
| 4. Certification + signature + typed name | tefap only | n/a | ✅ required |
| 5. Pantry notes (perishables, notes, custom fields) | ✅ | ❌ | — |
| 6. USDA nondiscrimination footer (static) | tefap only | tefap only | ✅ always visible |

`anonymous-count` mode replaces the intake form entirely with a **Meal Service log** screen:

```
New meal service
  Date: 2026-04-22        Type: [Dinner ▾]
  Meals served: [___]
  (optional breakdowns)
    Children: [__]   Adults: [__]   Seniors: [__]
  Volunteers on service: [__]
  Pounds of food served: [__]    USDA commodity lbs: [__]
  Notes: [________________]
  [ Save ]
```

---

## 4. Report generator — dispatch table

One entry point, routes to sub-generators:

```ts
generateMonthlyReport(year, month, db, settings) → Report

Report shape varies by mode:
  household + groceries     → visits-based report (current St. Mark + TEFAP sections)
  anonymous-count + meals   → meal-service-based report
  both                      → combined report with separate sections
```

### Sub-generator inputs

- **Visits-based**: query `visits` in window, join to `clients`, bucket family members by `ageOnDate(dob, visit.date)`
- **Meal-based**: query `mealServices` in window, sum counts, tally USDA commodity pounds
- **Combined**: run both, concatenate in single output

### Output targets

- **PDF** (primary) — styled monthly report, TEFAP adds signature line + USDA footer
- **CSV** (audit trail) — per-visit or per-service rows, required for 3-year TEFAP retention
- **Markdown** (stakeholder email) — standalone-mode pantries' use case

### Age-bucketing rule (critical correctness requirement)

Age buckets (`<18`, `18-59`, `60+`) must be computed **as of the visit date**, not as of report-generation time. Birthday transitions within the month must put a person in different buckets on different visits. Lock this in a test fixture before the rest of the generator is written.

---

## 5. FPL + state config

- Ship `data/fpl/FY{year}.json` (3 regions) bundled with app
- Ship `data/states/{ST}.json` for all 50 states + DC with defaults: `fplMultiplier`, `categoricalPrograms`, `stateAgencyUrl`
- `ensureSeedData()` runs on first launch and on every app update
- Annual update = new JSON + app version bump + PWA refresh picks it up
- Manual sideload fallback: Settings → Compliance → Import FPL JSON

---

## 6. Compliance behaviors (tefap mode)

- Annual recert prompt fires at check-in when `client.tefap.certifiedFor !== settings.fplYear`; offer "Recertify" (short form, new signature) or "Skip this time" (logs visit, flags report row)
- `signatureMethod: 'verbal-attestation'` requires Staff PIN entry
- `signatureMethod: 'paper-scan'` requires attached image
- Every intake generates a stored PNG of the printable form for 3-year retention
- Monthly report flags:
  - households served on expired certification
  - family members with estimated DOB
  - visits missing `householdSizeAtVisit` (pre-migration data)

---

## 7. Pricing tiers

| Tier | Price | Includes |
|---|---|---|
| Basics | Free | Standalone mode, single device, monthly summary, JSON backup |
| Pro | $149 one-time | + TEFAP mode, signature capture, recert, monthly TEFAP report, audit CSV, state config, email support, up to 3 devices, 12 months of updates |
| Compliance Pack | $29/year | FPL + state-config + form-template updates after year 1 |
| Cloud | $10/month | Multi-device sync via Supabase (any tier) |

Billing: Stripe checkout, license-key issued on purchase, validated locally (offline-friendly). Implementation deferred until Phase 1 validates demand.

---

## 8. Build sequence

1. Settings + FPL seed data + state JSONs (mode-agnostic foundation)
2. DOB migration on `FamilyMember` + head-of-household DOB
3. Monthly report — **standalone mode first** (validates age-bucketing math, reuses existing schema)
4. TEFAP intake form (Sections 2–5) + signature canvas
5. Annual recert flag + check-in integration
6. `householdSizeAtVisit` snapshot on `Visit`
7. TEFAP monthly report (extends standalone report with Sections B/C)
8. Audit CSV export
9. `MealService` table + meal-service screen + meal-based report
10. Commodity/pounds tracking + USDA commodity split
11. Strip "St. Mark" branding → "Cupboard"; pantry-name-driven headers everywhere
12. Landing page, pricing page, Stripe checkout, license-key validation

Steps 1–8 are the paying-pantry MVP. Steps 9–10 open the meal-program market. Steps 11–12 are the launch.

---

## 9. GTM phases

- **Phase 0 (now)** — St. Mark dogfoods standalone mode
- **Phase 1 (2026 Q2–Q3)** — Three beta pantries (2 TEFAP via Rio Texas / Central TX Food Bank, 1 standalone non-UMC); free Pro licenses; ~4 hrs/month for 3 months
- **Phase 2 (late 2026)** — Soft launch. Channels: UMC conference networks, Ample Harvest/Food Finder directories, select regional food banks
- **Phase 3 (mid-2027)** — Decision point based on paying-pantry count

### Support model

- Public help page at `cupboard.app/help` (single markdown document, updated when a question is answered twice)
- 48-hour email SLA, Mon–Fri
- Weekly 30-min office hours (batched with cfrt if both launch)

---

## 10. Deferred

- Multi-language (Spanish is high-value for TX pantries — post-launch)
- Food-bank intake system integrations (only worth building after a food-bank partnership is on the table)
- Per-distribution TEFAP toggle (for partial-TEFAP pantries — tell them to over-collect in v1)
- Cryptographic/PKI signatures
- Biometric capture
- Signature verification against prior signatures
- Custom report designer (fixed reports in v1)

---

## 11. Open questions

- Does "Cupboard" read too narrow for meal-program customers? Check in first 10 conversations.
- Do any states mandate income-dollar-amount collection beyond self-attestation? Needs per-state research before TEFAP launch.
- How to handle the partial-TEFAP pantry cleanly? Over-collect vs. per-visit flag. Tabled until a real pantry asks.
- Signature-on-paper scan workflow: camera capture from the Chromebook vs. file upload? Both?
- Should standalone-mode report exports be gated behind Pro, or always free? Leans toward free (no support burden; drives trust).
