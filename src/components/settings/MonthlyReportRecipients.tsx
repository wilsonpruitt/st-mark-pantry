import { useCallback, useEffect, useState } from 'react';
import { Mail, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface Recipient {
  id: string;
  email: string;
  name: string | null;
  active: boolean;
  created_at: string;
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = localStorage.getItem('pantry-api-key');
  if (apiKey) h['x-api-key'] = apiKey;
  return h;
}

export function MonthlyReportRecipients() {
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/report-recipients', { headers: authHeaders() });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = await res.json();
      setRecipients(data.recipients ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setRecipients([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/report-recipients', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${res.status})`);
      }
      setEmail('');
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/report-recipients?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-4" />
          Monthly Report Recipients
        </CardTitle>
        <CardDescription>
          Stakeholders receive an automated summary on the 1st of each month
          (visits, households, individuals served, new clients).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={add} className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              required
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
            <Input
              type="text"
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </div>
          <Button type="submit" disabled={busy || !email.trim()} className="w-full sm:w-auto">
            <Plus className="size-4" />
            Add recipient
          </Button>
        </form>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {recipients === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : recipients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recipients yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border">
            {recipients.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.email}</p>
                  {r.name && (
                    <p className="truncate text-xs text-muted-foreground">{r.name}</p>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove(r.id)}
                  disabled={busy}
                  aria-label={`Remove ${r.email}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
