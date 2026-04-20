import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, 'public', any>;

let _client: Client | null = null;

export function getSupabase(): Client {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      throw new Error(`Missing env vars: SUPABASE_URL=${!!url}, SUPABASE_SERVICE_KEY=${!!key}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _client = createClient<any, 'public', any>(url, key);
  }
  return _client;
}
