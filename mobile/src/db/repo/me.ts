/* Who is using this phone: their player, access level, region and onboarding. */

import type { SQLiteDatabase } from 'expo-sqlite';
import { LEVEL_RANK, type Level } from '@/domain/permissions';
import type { RosterEntry } from '../types';
import { now, write } from './core';
import { getPerson } from './people';

/* ---------------- Me (who is using this phone) ---------------- */

// Until sign-in exists, "me" is just the player this phone's owner picked. Accounts will replace it.
/** The region this phone's user plays in / cares most about — the default filter across the app. */
export async function getHomeRegion(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'home_region'`);
  // 'all' = they chose All of SA on purpose: don't guess a region for them.
  if (row) return row.value === 'all' ? null : row.value;
  // Not chosen yet: guess from the teams you play for.
  const team = await db.getFirstAsync<{ region: string }>(
    `SELECT t.region FROM membership m JOIN team t ON t.id = m.team_id
      WHERE m.person_id = (SELECT value FROM app_meta WHERE key = 'me_person_id') AND m.end_date IS NULL AND m.deleted_at IS NULL
        AND t.region IS NOT NULL AND t.is_sample = 0
      ORDER BY m.created_at LIMIT 1`,
  );
  return team?.region ?? null;
}

export function setHomeRegion(db: SQLiteDatabase, region: string | null) {
  return write(db, () => db.runAsync(`INSERT INTO app_meta (key, value) VALUES ('home_region', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, region ?? 'all'));
}

/** First-run welcome: done (or skipped) once per phone. */
export async function isOnboarded(db: SQLiteDatabase) {
  return !!(await db.getFirstAsync(`SELECT 1 FROM app_meta WHERE key = 'onboarded'`)) || !!(await getMeId(db));
}

export function setOnboarded(db: SQLiteDatabase) {
  return db.runAsync(`INSERT INTO app_meta (key, value) VALUES ('onboarded', '1') ON CONFLICT(key) DO UPDATE SET value = '1'`);
}

export async function getMeId(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'me_person_id'`);
  return row?.value ?? null;
}

export function setMeId(db: SQLiteDatabase, personId: string | null) {
  return write(db, async () => {
    if (personId) {
      await db.runAsync(`INSERT INTO app_meta (key, value) VALUES ('me_person_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, personId);
    } else {
      await db.runAsync(`DELETE FROM app_meta WHERE key = 'me_person_id'`);
    }
  });
}

export async function getMe(db: SQLiteDatabase) {
  const id = await getMeId(db);
  return id ? getPerson(db, id) : null;
}

/** Level set on this phone for testing (player, scorekeeper, coordinator or admin). Accounts replace it. */
export async function getTestLevel(db: SQLiteDatabase): Promise<Level> {
  const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'me_level'`);
  const v = row?.value as Level | undefined;
  return v && v in LEVEL_RANK && v !== 'staff' ? v : 'player';
}

export function setTestLevel(db: SQLiteDatabase, level: Exclude<Level, 'staff'>) {
  return write(db, () => db.runAsync(`INSERT INTO app_meta (key, value) VALUES ('me_level', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, level));
}

export type Access = { level: Level; meId: string | null; staffTeamIds: string[]; signedIn: boolean };

/**
 * What the person using this phone may do. Local stand-in until accounts: team staff = holds a captain/
 * coach/spirit captain/manager role on a team; admin/coordinator/scorekeeper = the test switch in Me.
 * The higher of the two wins.
 */
export async function getAccess(db: SQLiteDatabase): Promise<Access> {
  const meId = await getMeId(db);
  const staff = meId ? await db.getAllAsync<{ team_id: string }>(`SELECT team_id FROM membership WHERE person_id = ? AND role != 'player' AND end_date IS NULL AND deleted_at IS NULL`, meId) : [];
  // Club staff run every team in their club.
  const viaClub = meId
    ? await db.getAllAsync<{ team_id: string }>(`SELECT t.id AS team_id FROM club_staff cs JOIN team t ON t.club_id = cs.club_id WHERE cs.person_id = ? AND t.deleted_at IS NULL`, meId)
    : [];
  const staffTeamIds = [...new Set([...staff, ...viaClub].map((s) => s.team_id))];
  const signedIn = !!(await db.getFirstAsync(`SELECT 1 FROM app_meta WHERE key = 'signed_in'`));
  // Signed in: levels come from the server (role_grant, synced). Signed out: the test switch in Me.
  let granted: Level = 'player';
  if (signedIn && meId) {
    const rows = await db.getAllAsync<{ level: Level }>(`SELECT level FROM role_grant WHERE person_id = ?`, meId);
    for (const r of rows) if (LEVEL_RANK[r.level] > LEVEL_RANK[granted]) granted = r.level;
  } else {
    granted = await getTestLevel(db);
  }
  const level: Level = staffTeamIds.length && LEVEL_RANK.staff > LEVEL_RANK[granted] ? 'staff' : granted;
  return { level, meId, staffTeamIds, signedIn };
}

export type MyRole = { team_id: string; team_name: string; primary_color: string | null; role: RosterEntry['role']; kind: 'core' | 'guest' | 'mercenary' };

export function myRoles(db: SQLiteDatabase, personId: string) {
  return db.getAllAsync<MyRole>(
    `SELECT m.team_id, t.name AS team_name, t.primary_color, m.role, m.kind
       FROM membership m JOIN team t ON t.id = m.team_id
      WHERE m.person_id = ? AND m.deleted_at IS NULL AND m.end_date IS NULL AND t.deleted_at IS NULL
      ORDER BY t.name`,
    personId,
  );
}

export function setMembershipRole(db: SQLiteDatabase, personId: string, teamId: string, role: RosterEntry['role']) {
  return write(db, () => db.runAsync(`UPDATE membership SET role = ?, updated_at = ? WHERE person_id = ? AND team_id = ? AND end_date IS NULL AND deleted_at IS NULL`, role, now(), personId, teamId));
}
