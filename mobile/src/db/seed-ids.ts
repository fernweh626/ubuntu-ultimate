import { md5 } from './md5';

/**
 * Stable id for shared starting data (clubs, fields, calendar): md5('<kind>:<name>') shaped as a UUID.
 * The server seeds the same rows with the same formula (supabase/migrations/*_seed.sql), so every phone
 * and the server agree on these ids.
 */
export async function seedId(kind: 'team' | 'venue' | 'calendar' | 'pickup' | 'link' | 'club' | 'demo', name: string) {
  const h = md5(`${kind}:${name}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
