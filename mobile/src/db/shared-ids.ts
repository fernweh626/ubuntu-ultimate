import type { SQLiteDatabase } from 'expo-sqlite';

import { SEED_CLUBS } from '@/content/hub';

import { seedId } from './seed-ids';

/* Starting data (clubs, fields, calendar) shares ids with the server; these helpers bring older phones in line. */

export const TEAM_REFS: [string, string][] = [
  ['membership', 'team_id'],
  ['event_team', 'team_id'],
  ['game', 'team_a_id'],
  ['game', 'team_b_id'],
  ['game', 'home_team_id'],
  ['game', 'first_pull_team_id'],
  ['game', 'forfeit_team_id'],
  ['game_player', 'team_id'],
  ['point', 'offense_team_id'],
  ['point', 'scoring_team_id'],
  ['point_player', 'team_id'],
  ['game_event', 'team_id'],
  ['saved_line', 'team_id'],
  ['spirit_score', 'from_team_id'],
  ['spirit_score', 'to_team_id'],
  ['game_status_log', 'team_id'],
  ['session', 'team_id'],
  ['reflection', 'team_id'],
  ['shoutout', 'team_id'],
  ['join_request', 'team_id'],
  ['game_availability', 'team_id'],
];
export const VENUE_REFS: [string, string][] = [
  ['game', 'venue_id'],
  ['session', 'venue_id'],
  ['bracket_slot', 'venue_id'],
];

/**
 * Before the first sync on a phone that was used offline:
 *  1. Starting clubs/fields/calendar created with random ids get the shared ids the server uses.
 *  2. The made-up sample teams (and their players and games) are removed so they never reach the server.
 *  3. Everything else is queued to upload.
 */
/** Re-key starting teams, fields and calendar entries to their shared seed ids (callers handle FKs/outbox). */
export async function adoptIds(db: SQLiteDatabase) {
  for (const c of SEED_CLUBS) {
    const target = await seedId('team', c.name);
    const local = await db.getFirstAsync<{ id: string }>(`SELECT id FROM team WHERE name = ? AND is_sample = 0 AND id != ?`, c.name, target);
    if (!local) continue;
    const clash = await db.getFirstAsync(`SELECT 1 FROM team WHERE id = ?`, target);
    if (clash) continue;
    await db.runAsync(`UPDATE team SET id = ? WHERE id = ?`, target, local.id);
    for (const [t, col] of TEAM_REFS) await db.runAsync(`UPDATE ${t} SET ${col} = ? WHERE ${col} = ?`, target, local.id);
    await db.runAsync(`UPDATE follow SET target_id = ? WHERE kind = 'team' AND target_id = ?`, target, local.id);
  }
  const venues = await db.getAllAsync<{ id: string; name: string }>(`SELECT id, name FROM venue WHERE name IN ('Plumstead 1','Plumstead 2','Wynberg 1')`);
  for (const v of venues) {
    const target = await seedId('venue', v.name);
    if (v.id === target || (await db.getFirstAsync(`SELECT 1 FROM venue WHERE id = ?`, target))) continue;
    await db.runAsync(`UPDATE venue SET id = ? WHERE id = ?`, target, v.id);
    for (const [t, col] of VENUE_REFS) await db.runAsync(`UPDATE ${t} SET ${col} = ? WHERE ${col} = ?`, target, v.id);
  }
  const cal = await db.getAllAsync<{ id: string; name: string; created_at: string }>(`SELECT id, name, created_at FROM calendar_entry`);
  const seededAt = cal.length ? cal.reduce((m, c) => (c.created_at < m ? c.created_at : m), cal[0].created_at) : '';
  for (const c of cal.filter((x) => x.created_at === seededAt)) {
    const target = await seedId('calendar', c.name);
    if (c.id !== target && !(await db.getFirstAsync(`SELECT 1 FROM calendar_entry WHERE id = ?`, target))) {
      await db.runAsync(`UPDATE calendar_entry SET id = ? WHERE id = ?`, target, c.id);
    }
  }
}

/**
 * Give the starting clubs, fields and calendar on this phone the shared ids the server (and the
 * demo content) use. Phones that were set up before shared ids existed have random ones.
 * Runs with foreign keys off (ids change parent-first) and outside the sync outbox.
 */
export async function adoptSharedIds(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA foreign_keys = OFF');
  await db.runAsync(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_pulling', '1')`);
  try {
    await adoptIds(db);
  } finally {
    await db.runAsync(`DELETE FROM app_meta WHERE key = 'sync_pulling'`);
    await db.execAsync('PRAGMA foreign_keys = ON');
  }
}
