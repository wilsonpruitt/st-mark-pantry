import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SignaturePad } from '@/components/ui/SignaturePad'
import { getStateConfig } from '@/lib/seed-data'
import {
  USDA_NONDISCRIMINATION_STATEMENT,
  USDA_NONDISCRIMINATION_SOURCE,
} from '@/data/usda-nondiscrimination'
import type { TefapDraft } from '@/lib/tefap-draft'

// Standard OMB / USDA race & ethnicity categories (fixed federal categories).
const RACE_OPTIONS = [
  'American Indian or Alaska Native',
  'Asian',
  'Black or African American',
  'Native Hawaiian or Other Pacific Islander',
  'White',
] as const

interface Props {
  state: string
  fplYear: string
  value: TefapDraft
  onChange: (next: TefapDraft) => void
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
}

export function TefapCertificationForm({ state, fplYear, value, onChange }: Props) {
  const cfg = getStateConfig(state)
  const programs = cfg?.categoricalPrograms ?? []
  const set = (patch: Partial<TefapDraft>) => onChange({ ...value, ...patch })

  return (
    <>
      {/* Section 2 — Eligibility */}
      <Card>
        <CardHeader>
          <CardTitle>TEFAP Eligibility</CardTitle>
          <CardDescription>
            Certification for {fplYear}. One basis is required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="elig"
              className="mt-1"
              checked={value.eligibilityType === 'categorical'}
              onChange={() => set({ eligibilityType: 'categorical' })}
            />
            <span>
              <span className="font-medium">Categorical eligibility</span> —
              household participates in a qualifying assistance program.
            </span>
          </label>
          {value.eligibilityType === 'categorical' && (
            <div className="ml-6 space-y-2">
              {programs.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No programs configured for {state}.
                </p>
              )}
              {programs.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-input"
                    checked={value.categoricalPrograms.includes(p)}
                    onChange={() =>
                      set({ categoricalPrograms: toggle(value.categoricalPrograms, p) })
                    }
                  />
                  {p}
                </label>
              ))}
            </div>
          )}

          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="elig"
              className="mt-1"
              checked={value.eligibilityType === 'income-attestation'}
              onChange={() => set({ eligibilityType: 'income-attestation' })}
            />
            <span>
              <span className="font-medium">Income self-attestation</span> —
              household income is at or below the state TEFAP limit.
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer border-t pt-3">
            <input
              type="checkbox"
              className="rounded border-input"
              checked={value.residencyConfirmed}
              onChange={(e) => set({ residencyConfirmed: e.target.checked })}
            />
            Residency in the service area confirmed
          </label>
        </CardContent>
      </Card>

      {/* Section 3 — Voluntary demographics */}
      <Card>
        <CardHeader>
          <CardTitle>Voluntary Demographic Information</CardTitle>
          <CardDescription>
            Collected for USDA reporting. The household may decline; declining
            does not affect eligibility.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-input"
              checked={value.raceDeclined}
              onChange={(e) =>
                set({
                  raceDeclined: e.target.checked,
                  race: e.target.checked ? [] : value.race,
                  ethnicity: e.target.checked ? 'declined' : value.ethnicity,
                })
              }
            />
            Household declined to provide demographic information
          </label>

          {!value.raceDeclined && (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Race (select all that apply)</Label>
                {RACE_OPTIONS.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-input"
                      checked={value.race.includes(r)}
                      onChange={() => set({ race: toggle(value.race, r) })}
                    />
                    {r}
                  </label>
                ))}
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Ethnicity</Label>
                {(
                  [
                    ['hispanic', 'Hispanic or Latino'],
                    ['not-hispanic', 'Not Hispanic or Latino'],
                    ['declined', 'Prefer not to answer'],
                  ] as const
                ).map(([v, label]) => (
                  <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="ethnicity"
                      className="border-input"
                      checked={value.ethnicity === v}
                      onChange={() => set({ ethnicity: v })}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Section 4 — Certification + signature */}
      <Card>
        <CardHeader>
          <CardTitle>Certification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            I certify that the information provided is true and that my
            household is eligible to receive USDA foods under TEFAP. I
            understand that providing false information may result in having to
            repay the value of foods received and may be subject to penalties
            under federal law.
          </p>
          <div className="space-y-2">
            <Label htmlFor="signedByName">Signature — type full name *</Label>
            <Input
              id="signedByName"
              value={value.signedByName}
              onChange={(e) => set({ signedByName: e.target.value })}
              placeholder="Full legal name"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Sign *</Label>
            <SignaturePad
              onChange={(png, method) =>
                set({ signaturePng: png, signatureMethod: method })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 6 — USDA nondiscrimination footer (always visible in TEFAP) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">USDA Nondiscrimination Statement</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-line text-xs text-muted-foreground">
            {USDA_NONDISCRIMINATION_STATEMENT}
          </p>
          <a
            href={USDA_NONDISCRIMINATION_SOURCE}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-xs underline text-muted-foreground"
          >
            Official source (USDA FNS)
          </a>
        </CardContent>
      </Card>
    </>
  )
}
