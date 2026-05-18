// Browser Supabase client for tenant email-OTP login (Cupboard #2).
//
// Only ever instantiated on a remote-tenant host that requires auth — tenant
// zero / dev / preview never call this, so the missing-env throw cannot affect
// St. Mark. Uses the legacy anon JWT (VITE_SUPABASE_ANON_KEY), per project rule
// to avoid the new sb_publishable_ keys. OTP verification uses verifyOtp (never
// exchangeCodeForSession); callers hard-navigate after success.

import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (_client) return _client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase auth is not configured for this tenant (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).',
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return _client;
}

export async function sendLoginCode(email: string): Promise<void> {
  // shouldCreateUser:false — only pre-provisioned tenant members can request a code.
  const { error } = await client().auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
}

export async function confirmLoginCode(email: string, token: string): Promise<void> {
  const { error } = await client().auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  });
  if (error) throw error;
}

export async function currentSession(): Promise<Session | null> {
  try {
    const { data } = await client().auth.getSession();
    return data.session;
  } catch {
    return null;
  }
}

export async function signOutTenant(): Promise<void> {
  try {
    await client().auth.signOut();
  } catch {
    /* best-effort */
  }
}
