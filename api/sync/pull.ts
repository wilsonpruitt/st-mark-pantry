import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../../lib/supabase.js';
import { requireAuth } from '../lib/require-auth.js';
import { fromDB, getSupabaseTable } from '../lib/field-map.js';

const TABLES_TO_PULL = [
  'clients',
  'visits',
  'volunteers',
  'volunteerShifts',
  'volunteerSignups',
] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAuth(req, res)) return;

  try {
    const since = req.query.since as string | undefined;
    const supabase = getSupabase();
    const syncedAt = new Date().toISOString();

    const result: Record<string, unknown[]> = {};

    for (const localTable of TABLES_TO_PULL) {
      const supaTable = getSupabaseTable(localTable);

      let query = supabase.from(supaTable).select('*');

      if (since) {
        query = query.gte('updated_at', since);
      }

      const { data, error } = await query;

      if (error) {
        console.error(`Pull error (${supaTable}):`, error);
        result[localTable] = [];
        continue;
      }

      // Convert snake_case rows to camelCase + include deleted_at for soft-delete detection
      result[localTable] = (data || []).map((row: Record<string, unknown>) => {
        const converted = fromDB(localTable, row);
        if (row.deleted_at) {
          converted.deletedAt = row.deleted_at;
        }
        return converted;
      });
    }

    return res.status(200).json({
      ok: true,
      clients: result.clients,
      visits: result.visits,
      volunteers: result.volunteers,
      volunteerShifts: result.volunteerShifts,
      volunteerSignups: result.volunteerSignups,
      syncedAt,
    });
  } catch (err) {
    console.error('Pull sync error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
