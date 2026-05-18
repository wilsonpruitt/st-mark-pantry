import { isDemoMode } from '@/lib/demo';

interface ApiResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export function apiPost(path: string, body: Record<string, unknown>): Promise<ApiResult> {
  // Demo is a local-only sandbox — never touch the production API.
  if (isDemoMode()) return Promise.resolve({ ok: false, error: 'demo' });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = localStorage.getItem('pantry-api-key');
  if (apiKey) headers['x-api-key'] = apiKey;

  return fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || 'Request failed' };
      return { ok: true, data };
    })
    .catch(() => {
      // Silently fail — local operation already succeeded
      return { ok: false, error: 'Network error' };
    });
}
