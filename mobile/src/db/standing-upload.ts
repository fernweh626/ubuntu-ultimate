import type { SQLiteDatabase } from 'expo-sqlite';

import type { StandingRow } from '@/domain/standing';
import { supabase } from '@/lib/supabase';

import { syncNow } from './sync';

/**
 * Admins/coordinators: replace an association's good-standing list on the server, then pull it.
 * Numbers not in the new file are removed, so the list always matches the latest export.
 */
export async function uploadStanding(db: SQLiteDatabase, association: string, rows: StandingRow[]) {
  const at = new Date().toISOString();
  const unique = new Map(rows.map((r) => [r.number, r]));
  const records = [...unique.values()].map((r) => ({
    id: `${association}:${r.number}`,
    association,
    number: r.number,
    status: r.status,
    paid_until: r.paidUntil,
    uploaded_at: at,
    updated_at: at,
  }));
  for (let i = 0; i < records.length; i += 500) {
    const { error } = await supabase.from('association_standing').upsert(records.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  // Drop numbers that weren't in this upload.
  const { error } = await supabase.from('association_standing').delete().eq('association', association).lt('uploaded_at', at);
  if (error) throw new Error(error.message);
  await syncNow(db);
  return records.length;
}
