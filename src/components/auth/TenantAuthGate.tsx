import { useState, useEffect } from 'react'
import { isTenantZero, tenantSlugFromHost, fetchTenantConfig } from '@/lib/tenant'
import { isDemoMode } from '@/lib/demo'
import { maybeSeedSettingsFromTenant } from '@/lib/tenant-settings'
import { sendLoginCode, confirmLoginCode, currentSession } from '@/lib/supabase-auth'

// Outer identity gate for REMOTE tenants only. Tenant zero (St. Mark) / dev /
// preview short-circuit synchronously to a passthrough — no network, no flash,
// no behavior change. For a tenant flagged requires_auth, the device-password
// LoginGate still runs underneath as the fast between-shifts re-lock.

type Status = 'checking' | 'email' | 'code' | 'open'

export function TenantAuthGate({ children }: { children: React.ReactNode }) {
  // Demo + St. Mark render children immediately (no Supabase), exactly as before.
  const [zero] = useState(() => isDemoMode() || isTenantZero())
  if (zero) return <>{children}</>
  return <RemoteTenantGate>{children}</RemoteTenantGate>
}

function RemoteTenantGate({ children }: { children: React.ReactNode }) {
  const slug = tenantSlugFromHost() as string
  const [status, setStatus] = useState<Status>('checking')
  const [tenantName, setTenantName] = useState(slug)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cfg = await fetchTenantConfig(slug)
      if (cancelled) return
      setTenantName(cfg.name)
      // Seed-once: map this tenant's row onto local settings before the app renders.
      maybeSeedSettingsFromTenant(cfg)
      if (!cfg.requiresAuth) {
        setStatus('open')
        return
      }
      const session = await currentSession()
      if (cancelled) return
      setStatus(session ? 'open' : 'email')
    })()
    return () => { cancelled = true }
  }, [slug])

  if (status === 'open') return <>{children}</>

  if (status === 'checking') {
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted p-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setError('Enter a valid email address.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await sendLoginCode(value)
      setStatus('code')
    } catch {
      setError('Could not send a code. Check the email is invited and try again.')
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = code.trim()
    if (token.length < 6) {
      setError('Enter the 6-digit code from your email.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await confirmLoginCode(email, token)
      // Hard nav: let the persisted session settle before the app re-mounts;
      // router navigation would race the session write.
      window.location.assign('/')
    } catch {
      setError('That code is incorrect or expired.')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted p-4">
      <form
        onSubmit={status === 'email' ? submitEmail : submitCode}
        className="w-full max-w-xs space-y-4 rounded-xl bg-card p-6 shadow-lg"
      >
        <div className="text-center">
          <span className="text-3xl">🌾</span>
          <h1 className="mt-2 text-lg font-bold">{tenantName}</h1>
          <p className="text-sm text-muted-foreground">
            {status === 'email'
              ? 'Sign in with your email to continue'
              : `Enter the code sent to ${email}`}
          </p>
        </div>

        {status === 'email' ? (
          <>
            <label htmlFor="tenant-email" className="sr-only">Email</label>
            <input
              id="tenant-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null) }}
              placeholder="you@example.org"
              autoFocus
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </>
        ) : (
          <>
            <label htmlFor="tenant-code" className="sr-only">Verification code</label>
            <input
              id="tenant-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(null) }}
              placeholder="123456"
              autoFocus
              className="w-full rounded-md border bg-background px-3 py-2 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? 'Please wait…' : status === 'email' ? 'Send code' : 'Verify'}
        </button>

        {status === 'code' && (
          <button
            type="button"
            onClick={() => { setStatus('email'); setCode(''); setError(null) }}
            className="w-full text-xs text-muted-foreground hover:underline"
          >
            Use a different email
          </button>
        )}
      </form>
    </div>
  )
}
