import type { SQLiteDatabase } from 'expo-sqlite';

import { now, uuid, write } from './repo';
import type { Club, Gender, Team } from './types';

/*
 * Clubs: one organisation running several teams (Mixed, Open, Women's, U20, a second mixed side…).
 * Teams stay the unit for games, rosters and stats; the club ties them together, and club staff act
 * as staff on all of its teams.
 */

export type ClubInput = Partial<Omit<Club, 'id'>> & { id?: string; name: string };

export function listClubs(db: SQLiteDatabase) {
  return db.getAllAsync<Club & { teams: number }>(
    `SELECT c.*, (SELECT COUNT(*) FROM team t WHERE t.club_id = c.id AND t.deleted_at IS NULL) AS teams
       FROM club c WHERE c.deleted_at IS NULL ORDER BY c.name COLLATE NOCASE`,
  );
}

export function getClub(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<Club>(`SELECT * FROM club WHERE id = ? AND deleted_at IS NULL`, id);
}

/** Create or update a club. Whoever creates it becomes its first club admin. */
export function saveClub(db: SQLiteDatabase, c: ClubInput, creatorId: string | null) {
  return write(db, async () => {
    const id = c.id ?? uuid();
    const ts = now();
    await db.runAsync(
      `INSERT INTO club (id, name, short_name, region, city, primary_color, contact_phone, contact_email, website, social, about, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, short_name = excluded.short_name, region = excluded.region, city = excluded.city,
         primary_color = excluded.primary_color, contact_phone = excluded.contact_phone, contact_email = excluded.contact_email,
         website = excluded.website, social = excluded.social, about = excluded.about, updated_at = excluded.updated_at`,
      id,
      c.name.trim(),
      c.short_name ?? null,
      c.region ?? null,
      c.city ?? null,
      c.primary_color ?? null,
      c.contact_phone ?? null,
      c.contact_email ?? null,
      c.website ?? null,
      c.social ?? null,
      c.about ?? null,
      ts,
      ts,
    );
    if (!c.id && creatorId) {
      await db.runAsync(`INSERT OR IGNORE INTO club_staff (id, club_id, person_id, role, created_at, updated_at) VALUES (?, ?, ?, 'admin', ?, ?)`, uuid(), id, creatorId, ts, ts);
    }
    return id;
  });
}

export function clubTeams(db: SQLiteDatabase, clubId: string) {
  return db.getAllAsync<Team & { players: number }>(
    `SELECT t.*, (SELECT COUNT(DISTINCT m.person_id) FROM membership m WHERE m.team_id = t.id AND m.end_date IS NULL AND m.deleted_at IS NULL) AS players
       FROM team t WHERE t.club_id = ? AND t.deleted_at IS NULL ORDER BY t.division, t.name COLLATE NOCASE`,
    clubId,
  );
}

/** Everyone in the club, with the teams they're on. */
export async function clubSquad(db: SQLiteDatabase, clubId: string) {
  const rows = await db.getAllAsync<{
    id: string;
    first_name: string;
    last_name: string;
    birth_date: string | null;
    gender: Gender | null;
    photo_uri: string | null;
    team_id: string;
    team: string;
    role: string;
  }>(
    `SELECT p.id, p.first_name, p.last_name, p.birth_date, p.gender, p.photo_uri, t.id AS team_id, t.name AS team, m.role
       FROM membership m JOIN team t ON t.id = m.team_id JOIN person p ON p.id = m.person_id
      WHERE t.club_id = ? AND t.deleted_at IS NULL AND m.end_date IS NULL AND m.deleted_at IS NULL AND p.deleted_at IS NULL
      ORDER BY p.first_name COLLATE NOCASE, p.last_name COLLATE NOCASE`,
    clubId,
  );
  const byPerson = new Map<string, (typeof rows)[number] & { teams: { id: string; name: string; role: string }[] }>();
  for (const r of rows) {
    const p = byPerson.get(r.id) ?? { ...r, teams: [] };
    p.teams.push({ id: r.team_id, name: r.team, role: r.role });
    byPerson.set(r.id, p);
  }
  return [...byPerson.values()];
}

export function clubStaff(db: SQLiteDatabase, clubId: string) {
  return db.getAllAsync<{ id: string; person_id: string; role: string; first_name: string; last_name: string; birth_date: string | null; photo_uri: string | null }>(
    `SELECT cs.id, cs.person_id, cs.role, p.first_name, p.last_name, p.birth_date, p.photo_uri
       FROM club_staff cs JOIN person p ON p.id = cs.person_id WHERE cs.club_id = ? ORDER BY cs.role, p.first_name`,
    clubId,
  );
}

export function addClubStaff(db: SQLiteDatabase, clubId: string, personId: string, role: 'admin' | 'coach' | 'manager') {
  return write(db, async () => {
    const ts = now();
    await db.runAsync(
      `INSERT INTO club_staff (id, club_id, person_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(club_id, person_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at`,
      uuid(),
      clubId,
      personId,
      role,
      ts,
      ts,
    );
  });
}

export function removeClubStaff(db: SQLiteDatabase, id: string) {
  return write(db, () => db.runAsync(`DELETE FROM club_staff WHERE id = ?`, id));
}
