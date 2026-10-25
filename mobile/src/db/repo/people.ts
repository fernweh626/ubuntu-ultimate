/* Teams, people and memberships, joining teams, venues, following, and saved lines. */

import type { SQLiteDatabase } from 'expo-sqlite';
import { byFirstName, isMinor } from '@/domain/format';
import { LEVEL_RANK } from '@/domain/permissions';
import type { Gender, Person, Position, RosterEntry, SavedLine, Team } from '../types';
import { now, personCols, uuid, write } from './core';
import { getAccess, getHomeRegion, getMeId } from './me';

/* ---------------- Teams & people ---------------- */

export function listTeams(db: SQLiteDatabase) {
  // Hat teams and scrimmage sides (non-sample 'pickup' teams) only exist for one day or game; not in team lists.
  return db.getAllAsync<Team>(`SELECT * FROM team WHERE deleted_at IS NULL AND kind != 'hat' AND NOT (kind = 'pickup' AND is_sample = 0) ORDER BY name COLLATE NOCASE`);
}

/** Two one-off sides for a scrimmage or pickup game: Light and Dark. */
export function createScrimmageSides(db: SQLiteDatabase) {
  return write(db, async () => {
    const ts = now();
    const region = await getHomeRegion(db);
    const make = async (name: string, color: string) => {
      const id = uuid();
      await db.runAsync(
        `INSERT INTO team (id, name, short_name, kind, region, primary_color, about, is_sample, created_at, updated_at) VALUES (?, ?, ?, 'pickup', ?, ?, 'Scrimmage side', 0, ?, ?)`,
        id,
        name,
        name.slice(0, 3).toUpperCase(),
        region && region !== 'all' ? region : null,
        color,
        ts,
        ts,
      );
      return (await db.getFirstAsync<Team>(`SELECT * FROM team WHERE id = ?`, id))!;
    };
    return { light: await make('Light', '#E9ECEF'), dark: await make('Dark', '#293750') };
  });
}

export function getTeam(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<Team>(`SELECT * FROM team WHERE id = ?`, id);
}

export type TeamInput = Partial<Omit<Team, 'id'>> & { id?: string; name: string };

export function saveTeam(db: SQLiteDatabase, t: TeamInput) {
  return write(db, async () => {
    const id = t.id ?? uuid();
    const ts = now();
    await db.runAsync(
      `INSERT INTO team (id, name, short_name, kind, region, city, primary_color, secondary_color, contact_name,
         contact_phone, contact_email, website, social, about, is_sample, club_id, division, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, short_name = excluded.short_name, kind = excluded.kind,
         region = excluded.region, city = excluded.city, primary_color = excluded.primary_color,
         secondary_color = excluded.secondary_color, contact_name = excluded.contact_name,
         contact_phone = excluded.contact_phone, contact_email = excluded.contact_email, website = excluded.website,
         social = excluded.social, about = excluded.about, club_id = excluded.club_id, division = excluded.division,
         updated_at = excluded.updated_at`,
      id,
      t.name.trim(),
      t.short_name ?? null,
      t.kind ?? 'club',
      t.region ?? null,
      t.city ?? null,
      t.primary_color ?? null,
      t.secondary_color ?? null,
      t.contact_name ?? null,
      t.contact_phone ?? null,
      t.contact_email ?? null,
      t.website ?? null,
      t.social ?? null,
      t.about ?? null,
      t.is_sample ?? 0,
      t.club_id ?? null,
      t.division ?? null,
      ts,
      ts,
    );
    return id;
  });
}

export function deleteTeam(db: SQLiteDatabase, id: string) {
  return write(db, () => db.runAsync(`UPDATE team SET deleted_at = ? WHERE id = ?`, now(), id));
}

export async function roster(db: SQLiteDatabase, teamId: string): Promise<RosterEntry[]> {
  const rows = await db.getAllAsync<RosterEntry>(
    `SELECT ${personCols('p')}, m.id AS membership_id, m.kind AS membership_kind, m.role,
            COALESCE(m.jersey_number, p.preferred_number) AS jersey_number
       FROM membership m JOIN person p ON p.id = m.person_id
      WHERE m.team_id = ? AND m.deleted_at IS NULL AND p.deleted_at IS NULL AND m.end_date IS NULL`,
    teamId,
  );
  return rows.sort(byFirstName);
}

export function getPerson(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<Person>(`SELECT ${personCols()} FROM person WHERE id = ?`, id);
}

/**
 * A person for the edit form, without their email or birth date. Those are never read back into the
 * UI; the form only learns whether they are on file (and the age group, for the under-18 rule).
 */
export type PersonForEdit = Omit<Person, 'email' | 'birth_date'> & { has_email: number; is_minor: number | null };

export async function getPersonForEdit(db: SQLiteDatabase, id: string): Promise<PersonForEdit | null> {
  const row = await db.getFirstAsync<PersonForEdit & { birth_date: string | null }>(
    `SELECT id, first_name, last_name, nickname, gender, preferred_number, position, is_placeholder,
            photo_uri, email IS NOT NULL AS has_email, birth_date
       FROM person WHERE id = ?`,
    id,
  );
  if (!row) return null;
  const { birth_date, ...rest } = row;
  return { ...rest, is_minor: birth_date ? (isMinor(birth_date) ? 1 : 0) : null };
}

export function setPersonPhoto(db: SQLiteDatabase, id: string, uri: string | null) {
  return write(db, () => db.runAsync(`UPDATE person SET photo_uri = ?, updated_at = ? WHERE id = ?`, uri, now(), id));
}

export function setTeamLogo(db: SQLiteDatabase, id: string, uri: string | null) {
  return write(db, () => db.runAsync(`UPDATE team SET logo_uri = ?, updated_at = ? WHERE id = ?`, uri, now(), id));
}

export function clearPrivateField(db: SQLiteDatabase, id: string, field: 'email' | 'birth_date') {
  return write(db, () => db.runAsync(`UPDATE person SET ${field} = NULL, updated_at = ? WHERE id = ?`, now(), id));
}

export function listPeople(db: SQLiteDatabase) {
  return db.getAllAsync<Person>(`SELECT ${personCols()} FROM person WHERE deleted_at IS NULL`).then((rows) => rows.sort(byFirstName));
}

export type PersonInput = {
  id?: string;
  first_name: string;
  last_name: string;
  nickname?: string | null;
  email?: string | null;
  birth_date?: string | null;
  gender: Gender | null;
  preferred_number?: string | null;
  position?: Position | null;
  is_placeholder?: number;
};

export function savePerson(db: SQLiteDatabase, p: PersonInput, join?: { teamId: string; kind?: 'core' | 'guest' | 'mercenary'; jersey?: string | null; role?: RosterEntry['role'] }) {
  return write(db, async () => {
    const id = p.id ?? uuid();
    const ts = now();
    await db.runAsync(
      `INSERT INTO person (id, first_name, last_name, nickname, email, birth_date, gender, preferred_number, position,
         is_placeholder, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET first_name = excluded.first_name, last_name = excluded.last_name,
         nickname = excluded.nickname,
         -- Email and birth date are write-only in the app: an empty value keeps what is on file.
         email = COALESCE(excluded.email, person.email), birth_date = COALESCE(excluded.birth_date, person.birth_date),
         gender = excluded.gender, preferred_number = excluded.preferred_number, position = excluded.position,
         updated_at = excluded.updated_at`,
      id,
      p.first_name.trim(),
      p.last_name.trim(),
      p.nickname ?? null,
      p.email ?? null,
      p.birth_date ?? null,
      p.gender,
      p.preferred_number ?? null,
      p.position ?? null,
      p.is_placeholder ?? 0,
      ts,
      ts,
    );
    if (join) await addMembership(db, id, join.teamId, join.kind ?? 'core', join.jersey ?? null, join.role ?? 'player');
    return id;
  });
}

async function addMembership(db: SQLiteDatabase, personId: string, teamId: string, kind: 'core' | 'guest' | 'mercenary', jersey: string | null, role: RosterEntry['role']) {
  const existing = await db.getFirstAsync<{ id: string }>(`SELECT id FROM membership WHERE person_id = ? AND team_id = ? AND deleted_at IS NULL AND end_date IS NULL`, personId, teamId);
  const ts = now();
  if (existing) {
    await db.runAsync(`UPDATE membership SET kind = ?, jersey_number = ?, role = ?, updated_at = ? WHERE id = ?`, kind, jersey, role, ts, existing.id);
    return;
  }
  await db.runAsync(
    `INSERT INTO membership (id, person_id, team_id, kind, role, jersey_number, start_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    uuid(),
    personId,
    teamId,
    kind,
    role,
    jersey,
    ts.slice(0, 10),
    ts,
    ts,
  );
}

export function joinTeam(db: SQLiteDatabase, personId: string, teamId: string, kind: 'core' | 'guest' | 'mercenary', jersey: string | null) {
  return write(db, () => addMembership(db, personId, teamId, kind, jersey, 'player'));
}

export type JoinKind = 'core' | 'guest' | 'mercenary';

/**
 * Join a team, or ask to. Signed-in players who aren't staff there send a request that the team's
 * staff (or a coordinator) approve, since the server only lets staff add people. Without an account,
 * everything is on this phone, so you just join.
 */
export async function joinOrRequest(db: SQLiteDatabase, personId: string, teamId: string, kind: JoinKind, message?: string | null): Promise<'joined' | 'requested'> {
  const access = await getAccess(db);
  const direct = !access.signedIn || LEVEL_RANK[access.level] >= LEVEL_RANK.coordinator || access.staffTeamIds.includes(teamId);
  if (direct) {
    const p = await db.getFirstAsync<{ preferred_number: string | null }>(`SELECT preferred_number FROM person WHERE id = ?`, personId);
    await joinTeam(db, personId, teamId, kind, p?.preferred_number ?? null);
    return 'joined';
  }
  await write(db, async () => {
    const ts = now();
    // One open request per team: asking again updates it.
    const open = await db.getFirstAsync<{ id: string }>(`SELECT id FROM join_request WHERE person_id = ? AND team_id = ? AND status = 'pending'`, personId, teamId);
    if (open) await db.runAsync(`UPDATE join_request SET kind = ?, message = ?, updated_at = ? WHERE id = ?`, kind, message ?? null, ts, open.id);
    else
      await db.runAsync(
        `INSERT INTO join_request (id, person_id, team_id, kind, message, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
        uuid(),
        personId,
        teamId,
        kind,
        message ?? null,
        ts,
        ts,
      );
  });
  return 'requested';
}

export function myJoinRequest(db: SQLiteDatabase, personId: string, teamId: string) {
  return db.getFirstAsync<{ id: string; kind: JoinKind; created_at: string }>(
    `SELECT id, kind, created_at FROM join_request WHERE person_id = ? AND team_id = ? AND status = 'pending'`,
    personId,
    teamId,
  );
}

export function cancelJoinRequest(db: SQLiteDatabase, id: string) {
  return write(db, () => db.runAsync(`UPDATE join_request SET status = 'cancelled', updated_at = ? WHERE id = ?`, now(), id));
}

/** Who's asking to join this team, for its staff. */
export function pendingJoinRequests(db: SQLiteDatabase, teamId: string) {
  return db.getAllAsync<{
    id: string;
    person_id: string;
    kind: JoinKind;
    message: string | null;
    created_at: string;
    first_name: string;
    last_name: string;
    nickname: string | null;
    birth_date: string | null;
  }>(
    `SELECT r.id, r.person_id, r.kind, r.message, r.created_at, p.first_name, p.last_name, p.nickname, p.birth_date
       FROM join_request r JOIN person p ON p.id = r.person_id
      WHERE r.team_id = ? AND r.status = 'pending' ORDER BY r.created_at`,
    teamId,
  );
}

/** Without an account the decision is local: approving adds them to the team. */
export async function decideJoinLocally(db: SQLiteDatabase, id: string, approve: boolean, kind?: JoinKind | null) {
  const r = await db.getFirstAsync<{ person_id: string; team_id: string; kind: JoinKind }>(`SELECT person_id, team_id, kind FROM join_request WHERE id = ?`, id);
  if (!r) return;
  const as = kind ?? r.kind;
  await write(db, () => db.runAsync(`UPDATE join_request SET status = ?, kind = ?, updated_at = ? WHERE id = ?`, approve ? 'approved' : 'declined', as, now(), id));
  if (approve) await joinTeam(db, r.person_id, r.team_id, as, null);
}

/** Pending requests for every team I run, for the "people want to join" pop-up. */
export function pendingForStaff(db: SQLiteDatabase, teamIds: string[]) {
  if (!teamIds.length) return Promise.resolve([] as { id: string; team_id: string; team: string }[]);
  return db.getAllAsync<{ id: string; team_id: string; team: string }>(
    `SELECT r.id, r.team_id, t.name AS team FROM join_request r JOIN team t ON t.id = r.team_id
      WHERE r.status = 'pending' AND r.team_id IN (${teamIds.map(() => '?').join(',')}) ORDER BY r.created_at`,
    ...teamIds,
  );
}

/** Label someone already on the roster: core, guest or pick-up (mercenary). */
export function setMembershipKind(db: SQLiteDatabase, membershipId: string, kind: JoinKind) {
  return write(db, () => db.runAsync(`UPDATE membership SET kind = ?, updated_at = ? WHERE id = ?`, kind, now(), membershipId));
}

/** Banking details for a team or club (staff edit them; shown with Copy and Share). */
export function setBankingDetails(db: SQLiteDatabase, table: 'team' | 'club', id: string, text: string | null) {
  return write(db, () => db.runAsync(`UPDATE ${table} SET banking_details = ?, updated_at = ? WHERE id = ?`, text?.trim() || null, now(), id));
}

/** Leaving keeps the history: the membership gets an end date instead of being deleted. */
export function leaveTeam(db: SQLiteDatabase, membershipId: string) {
  return write(db, () => db.runAsync(`UPDATE membership SET end_date = ?, updated_at = ? WHERE id = ?`, now().slice(0, 10), now(), membershipId));
}

export type PastPlayer = {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  birth_date: string | null;
  photo_uri: string | null;
  first_year: string | null;
  last_year: string | null;
  games: number;
};

/**
 * Everyone who used to be part of the team and isn't on this season's roster: their membership ended,
 * or they played finished games for the team. Years come from both, newest first.
 */
export function pastPlayers(db: SQLiteDatabase, teamId: string) {
  return db.getAllAsync<PastPlayer>(
    `WITH cur AS (SELECT person_id FROM membership WHERE team_id = ? AND end_date IS NULL AND deleted_at IS NULL),
          m AS (SELECT person_id, start_date, end_date FROM membership WHERE team_id = ? AND end_date IS NOT NULL AND deleted_at IS NULL),
          g AS (SELECT gp.person_id, COALESCE(gm.started_at, gm.scheduled_at) AS at FROM game_player gp JOIN game gm ON gm.id = gp.game_id
                 WHERE gp.team_id = ? AND gm.status = 'final' AND gm.deleted_at IS NULL AND gp.confirmation != 'removed'),
          yrs AS (SELECT person_id, substr(start_date, 1, 4) AS y FROM m UNION ALL SELECT person_id, substr(end_date, 1, 4) FROM m UNION ALL SELECT person_id, substr(at, 1, 4) FROM g)
     SELECT p.id, p.first_name, p.last_name, p.nickname, p.birth_date, p.photo_uri, MIN(yrs.y) AS first_year, MAX(yrs.y) AS last_year,
            (SELECT COUNT(*) FROM g WHERE g.person_id = p.id) AS games
       FROM yrs JOIN person p ON p.id = yrs.person_id
      WHERE yrs.person_id NOT IN (SELECT person_id FROM cur) AND p.deleted_at IS NULL AND yrs.y IS NOT NULL
      GROUP BY p.id ORDER BY last_year DESC, p.first_name COLLATE NOCASE`,
    teamId,
    teamId,
    teamId,
  );
}

export type MembershipHistory = {
  id: string;
  team_id: string;
  team_name: string;
  primary_color: string | null;
  kind: 'core' | 'guest' | 'mercenary';
  start_date: string | null;
  end_date: string | null;
  jersey_number: string | null;
};

export function personHistory(db: SQLiteDatabase, personId: string) {
  return db.getAllAsync<MembershipHistory>(
    `SELECT m.id, m.team_id, t.name AS team_name, t.primary_color, m.kind, m.start_date, m.end_date, m.jersey_number
       FROM membership m JOIN team t ON t.id = m.team_id
      WHERE m.person_id = ? AND m.deleted_at IS NULL
      ORDER BY (m.end_date IS NULL) DESC, m.start_date DESC`,
    personId,
  );
}

/* ---------------- Venues ---------------- */

export type Venue = { id: string; name: string; city: string | null; latitude: number | null; longitude: number | null; notes: string | null };

export function listVenues(db: SQLiteDatabase) {
  return db.getAllAsync<Venue>(`SELECT * FROM venue WHERE deleted_at IS NULL ORDER BY name`);
}

export function saveVenue(db: SQLiteDatabase, v: { id?: string; name: string; city: string | null; latitude: number | null; longitude: number | null; notes?: string | null }) {
  return write(db, async () => {
    const id = v.id ?? uuid();
    const ts = now();
    await db.runAsync(
      `INSERT INTO venue (id, name, city, latitude, longitude, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, city = excluded.city, latitude = excluded.latitude,
         longitude = excluded.longitude, notes = excluded.notes, updated_at = excluded.updated_at`,
      id,
      v.name.trim(),
      v.city,
      v.latitude,
      v.longitude,
      v.notes ?? null,
      ts,
      ts,
    );
    return id;
  });
}

export function deleteVenue(db: SQLiteDatabase, id: string) {
  return write(db, () => db.runAsync(`UPDATE venue SET deleted_at = ? WHERE id = ?`, now(), id));
}

export function getVenue(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<Venue>(`SELECT * FROM venue WHERE id = ?`, id);
}

/* ---------------- Following ---------------- */

export type FollowKind = 'team' | 'event' | 'player' | 'pickup';

export function listFollows(db: SQLiteDatabase) {
  return db.getAllAsync<{ kind: FollowKind; target_id: string }>(`SELECT kind, target_id FROM follow`);
}

export async function isFollowing(db: SQLiteDatabase, kind: FollowKind, targetId: string) {
  return !!(await db.getFirstAsync(`SELECT 1 FROM follow WHERE kind = ? AND target_id = ?`, kind, targetId));
}

export function setFollowing(db: SQLiteDatabase, kind: FollowKind, targetId: string, on: boolean) {
  return write(db, () =>
    on
      ? db.runAsync(`INSERT OR IGNORE INTO follow (id, kind, target_id, created_at) VALUES (?, ?, ?, ?)`, uuid(), kind, targetId, now())
      : db.runAsync(`DELETE FROM follow WHERE kind = ? AND target_id = ?`, kind, targetId),
  );
}

/**
 * The teams and events "For you" covers: teams I'm on, teams I follow, teams of players I follow,
 * events I follow, and events those teams are entered in.
 */
export async function myScope(db: SQLiteDatabase) {
  const meId = await getMeId(db);
  const mine = meId ? (await db.getAllAsync<{ team_id: string }>(`SELECT team_id FROM membership WHERE person_id = ? AND end_date IS NULL AND deleted_at IS NULL`, meId)).map((r) => r.team_id) : [];
  const follows = await listFollows(db);
  const players = follows.filter((f) => f.kind === 'player').map((f) => f.target_id);
  // Teams of players you follow count as followed, so their games show under "For you".
  const theirTeams = players.length
    ? (
        await db.getAllAsync<{ team_id: string }>(`SELECT team_id FROM membership WHERE person_id IN (${players.map(() => '?').join(',')}) AND end_date IS NULL AND deleted_at IS NULL`, ...players)
      ).map((r) => r.team_id)
    : [];
  const teamIds = new Set([...mine, ...follows.filter((f) => f.kind === 'team').map((f) => f.target_id), ...theirTeams]);
  const eventIds = new Set(follows.filter((f) => f.kind === 'event').map((f) => f.target_id));
  return { teamIds, eventIds, myTeamIds: new Set(mine), hasAny: teamIds.size + eventIds.size > 0 };
}

export function updateGameMeta(db: SQLiteDatabase, gameId: string, fields: { weather_json?: string; video_url?: string | null }) {
  return write(db, async () => {
    if (fields.weather_json !== undefined) {
      await db.runAsync(`UPDATE game SET weather_json = ? WHERE id = ?`, fields.weather_json, gameId);
    }
    if (fields.video_url !== undefined) {
      await db.runAsync(`UPDATE game SET video_url = ? WHERE id = ?`, fields.video_url, gameId);
    }
  });
}

export function deleteGame(db: SQLiteDatabase, gameId: string) {
  return write(db, () => db.runAsync(`UPDATE game SET deleted_at = ? WHERE id = ?`, now(), gameId));
}

/* ---------------- Saved lines ---------------- */

export async function savedLines(db: SQLiteDatabase, teamId: string): Promise<SavedLine[]> {
  const lines = await db.getAllAsync<Omit<SavedLine, 'member_ids'>>(`SELECT id, team_id, name, side FROM saved_line WHERE team_id = ? AND deleted_at IS NULL ORDER BY created_at`, teamId);
  const members = await db.getAllAsync<{ line_id: string; person_id: string }>(`SELECT m.* FROM saved_line_member m JOIN saved_line l ON l.id = m.line_id WHERE l.team_id = ?`, teamId);
  return lines.map((l) => ({ ...l, member_ids: members.filter((m) => m.line_id === l.id).map((m) => m.person_id) }));
}

export function saveLine(db: SQLiteDatabase, teamId: string, name: string, side: SavedLine['side'], memberIds: string[], id?: string) {
  return write(db, async () => {
    const lineId = id ?? uuid();
    const ts = now();
    await db.runAsync(
      `INSERT INTO saved_line (id, team_id, name, side, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, side = excluded.side, updated_at = excluded.updated_at`,
      lineId,
      teamId,
      name.trim(),
      side,
      ts,
      ts,
    );
    await db.runAsync(`DELETE FROM saved_line_member WHERE line_id = ?`, lineId);
    for (const pid of memberIds) {
      await db.runAsync(`INSERT INTO saved_line_member (line_id, person_id) VALUES (?, ?)`, lineId, pid);
    }
    return lineId;
  });
}

export function deleteLine(db: SQLiteDatabase, id: string) {
  return write(db, () => db.runAsync(`UPDATE saved_line SET deleted_at = ? WHERE id = ?`, now(), id));
}
