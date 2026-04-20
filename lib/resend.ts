import { Resend } from 'resend';

let _client: Resend | null = null;

export function getResend(): Resend {
  if (!_client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('Missing RESEND_API_KEY env var');
    _client = new Resend(key);
  }
  return _client;
}

export const FROM_EMAIL = 'St. Mark Food Pantry <reports@stmarklegacy.org>';
