import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../lib/supabase.js';
import { requireAuth, isValidUUID } from './lib/require-auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  const supabase = getSupabase();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('report_recipients')
      .select('id, email, name, active, created_at')
      .order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, recipients: data ?? [] });
  }

  if (req.method === 'POST') {
    const { email, name } = (req.body ?? {}) as { email?: string; name?: string };
    const trimmed = typeof email === 'string' ? email.trim() : '';
    if (!EMAIL_RE.test(trimmed)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    const { data, error } = await supabase
      .from('report_recipients')
      .upsert(
        { email: trimmed, name: name?.trim() || null, active: true },
        { onConflict: 'email' }
      )
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, recipient: data });
  }

  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!isValidUUID(id)) return res.status(400).json({ error: 'Invalid id' });
    const { error } = await supabase.from('report_recipients').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
