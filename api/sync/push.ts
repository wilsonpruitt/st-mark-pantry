import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../../lib/supabase.js';
import { requireAuth } from '../lib/require-auth.js';
import { getSupabaseTable, toDB } from '../lib/field-map.js';

interface Mutation {
  table: string;
  id: string;
  action: 'upsert' | 'delete';
  payload?: Record<string, unknown>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAuth(req, res)) return;

  try {
    const { mutations } = req.body as { mutations: Mutation[] };

    if (!Array.isArray(mutations) || mutations.length === 0) {
      return res.status(400).json({ error: 'mutations array required' });
    }

    if (mutations.length > 500) {
      return res.status(400).json({ error: 'Max 500 mutations per request' });
    }

    const supabase = getSupabase();
    let processed = 0;
    let failed = 0;

    // Group mutations by table for batch operations
    const grouped: Record<string, { upserts: Record<string, unknown>[]; deletes: string[] }> = {};

    for (const mut of mutations) {
      const supaTable = getSupabaseTable(mut.table);
      if (!grouped[supaTable]) {
        grouped[supaTable] = { upserts: [], deletes: [] };
      }

      if (mut.action === 'delete') {
        grouped[supaTable].deletes.push(mut.id);
      } else if (mut.payload) {
        const dbRecord = toDB(mut.table, mut.payload);
        grouped[supaTable].upserts.push(dbRecord);
      }
    }

    for (const [supaTable, { upserts, deletes }] of Object.entries(grouped)) {
      // Process upserts in batches of 50
      for (let i = 0; i < upserts.length; i += 50) {
        const batch = upserts.slice(i, i + 50);
        const { error } = await supabase
          .from(supaTable)
          .upsert(batch, { onConflict: 'id' });

        if (error) {
          console.error(`Push upsert error (${supaTable}):`, error);
          failed += batch.length;
        } else {
          processed += batch.length;
        }
      }

      // Process soft-deletes
      if (deletes.length > 0) {
        const { error } = await supabase
          .from(supaTable)
          .update({ deleted_at: new Date().toISOString() })
          .in('id', deletes);

        if (error) {
          console.error(`Push delete error (${supaTable}):`, error);
          failed += deletes.length;
        } else {
          processed += deletes.length;
        }
      }
    }

    return res.status(200).json({ ok: true, processed, failed });
  } catch (err) {
    console.error('Push sync error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
