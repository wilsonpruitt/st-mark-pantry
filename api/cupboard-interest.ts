import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getResend } from '../lib/resend.js';
import { getSupabase } from '../lib/supabase.js';

interface InterestBody {
  name?: string;
  email?: string;
  organization?: string;
  program?: string;
  notes?: string;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = (req.body ?? {}) as InterestBody;
  const name = (body.name ?? '').trim();
  const email = (body.email ?? '').trim();
  if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Name and a valid email are required.' });
  }

  const organization = (body.organization ?? '').trim();
  const program = (body.program ?? '').trim();
  const notes = (body.notes ?? '').trim();

  const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; line-height: 1.5;">
      <h2 style="margin: 0 0 12px;">Cupboard waitlist signup</h2>
      <table cellpadding="6" style="border-collapse: collapse;">
        <tr><td><strong>Name</strong></td><td>${escape(name)}</td></tr>
        <tr><td><strong>Email</strong></td><td>${escape(email)}</td></tr>
        <tr><td><strong>Organization</strong></td><td>${escape(organization) || '<em>—</em>'}</td></tr>
        <tr><td><strong>Program</strong></td><td>${escape(program) || '<em>—</em>'}</td></tr>
        <tr><td valign="top"><strong>Notes</strong></td><td>${notes ? escape(notes).replace(/\n/g, '<br>') : '<em>—</em>'}</td></tr>
      </table>
    </div>
  `;

  let emailed = false;
  let emailError: unknown = null;
  try {
    const { error } = await getResend().emails.send({
      from: 'Cupboard waitlist <reports@stmarklegacy.org>',
      to: 'wilson@wrootlabs.com',
      replyTo: email,
      subject: `Cupboard waitlist: ${name}${organization ? ' — ' + organization : ''}`,
      html,
    });
    if (error) emailError = error;
    else emailed = true;
  } catch (err) {
    emailError = err;
  }

  // Durable lead capture — best-effort, never blocks the response so a transient
  // DB hiccup can't drop a signup the user already submitted.
  try {
    const { error } = await getSupabase().from('cupboard_interest').insert({
      name,
      email,
      organization: organization || null,
      program: program || null,
      notes: notes || null,
      emailed,
    });
    if (error) console.error('cupboard_interest insert error:', error);
  } catch (err) {
    console.error('cupboard_interest insert threw:', err);
  }

  if (emailError) {
    console.error('Resend error:', emailError);
    return res.status(502).json({ error: 'Email service failed' });
  }
  return res.status(200).json({ ok: true });
}
