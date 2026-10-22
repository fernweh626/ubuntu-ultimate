import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { otherTeam, type GameData } from '@/domain/engine';
import { byFirstName, isMinor } from '@/domain/format';
import { parseRules, ratioForPoint, type Rules } from '@/domain/rules';

import { notifyChanged } from './live';
import type {
  CalendarEntry,
  Division,
  EventKind,
  EventLevel,
  EventRow,
  Game,
  GameEvent,
  GameEventType,
  GamePlayer,
  Gender,
  Person,
  PickupSpot,
  Point,
  Position,
  PullOutcome,
  RosterEntry,
  SavedLine,
  SpiritScore,
  Team,
  TrackingMode,
} from './types';

export const uuid = () => randomUUID();

/** Person columns safe to load into screens: email is never selected. */
export const personCols = (alias = '') => {
  const a = alias ? `${alias}.` : '';
  return `${a}id, ${a}first_name, ${a}last_name, ${a}nickname, NULL AS email, ${a}birth_date, ${a}gender, ${a}preferred_number, ${a}position, ${a}is_placeholder`;
};
export const now = () => new Date().toISOString();

async function write<T>(db: SQLiteDatabase, fn: () => Promise<T>): Promise<T> {
  let result!: T;
  await db.withTransactionAsync(async () => {
    result = await fn();
  });
  notifyChanged();
  return result;
}

export async function deviceId(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'device_id'`);
  if (row) return row.value;
  const id = uuid();
  await db.runAsync(`INSERT INTO app_meta (key, value) VALUES ('device_id', ?)`, id);
  return id;
}

/* ---------------- Me (who is using this phone) ---------------- */

// Until sign-in exists, "me" is just the player this phone's owner picked. Accounts will replace it.
export async function getMeId(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'me_person_id'`);
  return row?.value ?? null;
}

export function setMeId(db: SQLiteDatabase, personId: string | null) {
  return write(db, async () => {
    if (personId) {
      await db.runAsync(
        `INSERT INTO app_meta (key, value) VALUES ('me_person_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        personId,
      );
    } else {
      await db.runAsync(`DELETE FROM app_meta WHERE key = 'me_person_id'`);
    }
  });
}

export async function getMe(db: SQLiteDatabase) {
  const id = await getMeId(db);
  return id ? getPerson(db, id) : null;
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
  return write(db, () =>
    db.runAsync(
      `UPDATE membership SET role = ?, updated_at = ? WHERE person_id = ? AND team_id = ? AND end_date IS NULL AND deleted_at IS NULL`,
      role,
      now(),
      personId,
      teamId,
    ),
  );
}

/* ---------------- Teams & people ---------------- */

export function listTeams(db: SQLiteDatabase) {
  return db.getAllAsync<Team>(`SELECT * FROM team WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE`);
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
         contact_phone, contact_email, website, social, about, is_sample, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, short_name = excluded.short_name, kind = excluded.kind,
         region = excluded.region, city = excluded.city, primary_color = excluded.primary_color,
         secondary_color = excluded.secondary_color, contact_name = excluded.contact_name,
         contact_phone = excluded.contact_phone, contact_email = excluded.contact_email, website = excluded.website,
         social = excluded.social, about = excluded.about, updated_at = excluded.updated_at`,
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
            email IS NOT NULL AS has_email, birth_date
       FROM person WHERE id = ?`,
    id,
  );
  if (!row) return null;
  const { birth_date, ...rest } = row;
  return { ...rest, is_minor: birth_date ? (isMinor(birth_date) ? 1 : 0) : null };
}

export function clearPrivateField(db: SQLiteDatabase, id: string, field: 'email' | 'birth_date') {
  return write(db, () => db.runAsync(`UPDATE person SET ${field} = NULL, updated_at = ? WHERE id = ?`, now(), id));
}

export function listPeople(db: SQLiteDatabase) {
  return db
    .getAllAsync<Person>(`SELECT ${personCols()} FROM person WHERE deleted_at IS NULL`)
    .then((rows) => rows.sort(byFirstName));
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

export function savePerson(
  db: SQLiteDatabase,
  p: PersonInput,
  join?: { teamId: string; kind?: 'core' | 'guest' | 'mercenary'; jersey?: string | null; role?: RosterEntry['role'] },
) {
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

async function addMembership(
  db: SQLiteDatabase,
  personId: string,
  teamId: string,
  kind: 'core' | 'guest' | 'mercenary',
  jersey: string | null,
  role: RosterEntry['role'],
) {
  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM membership WHERE person_id = ? AND team_id = ? AND deleted_at IS NULL AND end_date IS NULL`,
    personId,
    teamId,
  );
  const ts = now();
  if (existing) {
    await db.runAsync(
      `UPDATE membership SET kind = ?, jersey_number = ?, role = ?, updated_at = ? WHERE id = ?`,
      kind,
      jersey,
      role,
      ts,
      existing.id,
    );
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

export function joinTeam(
  db: SQLiteDatabase,
  personId: string,
  teamId: string,
  kind: 'core' | 'guest' | 'mercenary',
  jersey: string | null,
) {
  return write(db, () => addMembership(db, personId, teamId, kind, jersey, 'player'));
}

/** Leaving keeps the history: the membership gets an end date instead of being deleted. */
export function leaveTeam(db: SQLiteDatabase, membershipId: string) {
  return write(db, () =>
    db.runAsync(`UPDATE membership SET end_date = ?, updated_at = ? WHERE id = ?`, now().slice(0, 10), now(), membershipId),
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

export type Venue = { id: string; name: string; city: string | null; latitude: number | null; longitude: number | null };

export function listVenues(db: SQLiteDatabase) {
  return db.getAllAsync<Venue>(`SELECT * FROM venue WHERE deleted_at IS NULL ORDER BY name`);
}

export function getVenue(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<Venue>(`SELECT * FROM venue WHERE id = ?`, id);
}

/* ---------------- Events (tournaments, leagues) ---------------- */

export function listEvents(db: SQLiteDatabase) {
  return db.getAllAsync<EventRow>(
    `SELECT * FROM event WHERE deleted_at IS NULL ORDER BY COALESCE(start_date, created_at) DESC`,
  );
}

export function getEvent(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<EventRow>(`SELECT * FROM event WHERE id = ?`, id);
}

export function eventTeams(db: SQLiteDatabase, eventId: string) {
  return db.getAllAsync<Team & { pool: string | null }>(
    `SELECT t.*, et.pool FROM event_team et JOIN team t ON t.id = et.team_id WHERE et.event_id = ? ORDER BY t.name`,
    eventId,
  );
}

export type EventInput = {
  id?: string;
  name: string;
  kind: EventKind;
  level: EventLevel;
  division: Division;
  region?: string | null;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  video_url?: string | null;
  photos_url?: string | null;
  teams: { teamId: string; pool: string | null }[];
};

export function saveEvent(db: SQLiteDatabase, e: EventInput) {
  return write(db, async () => {
    const id = e.id ?? uuid();
    const ts = now();
    await db.runAsync(
      `INSERT INTO event (id, name, kind, level, division, region, location, start_date, end_date, video_url, photos_url,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, level = excluded.level,
         division = excluded.division, region = excluded.region, location = excluded.location,
         start_date = excluded.start_date, end_date = excluded.end_date, video_url = excluded.video_url,
         photos_url = excluded.photos_url, updated_at = excluded.updated_at`,
      id,
      e.name.trim(),
      e.kind,
      e.level,
      e.division,
      e.region ?? null,
      e.location ?? null,
      e.start_date ?? null,
      e.end_date ?? null,
      e.video_url ?? null,
      e.photos_url ?? null,
      ts,
      ts,
    );
    await db.runAsync(`DELETE FROM event_team WHERE event_id = ?`, id);
    for (const t of e.teams) {
      await db.runAsync(
        `INSERT INTO event_team (id, event_id, team_id, pool, created_at) VALUES (?, ?, ?, ?, ?)`,
        uuid(),
        id,
        t.teamId,
        t.pool,
        ts,
      );
    }
    return id;
  });
}

/* ---------------- Games ---------------- */

export type GameListItem = Game & {
  a_name: string;
  b_name: string;
  a_color: string | null;
  b_color: string | null;
  a_short: string | null;
  b_short: string | null;
  event_name: string | null;
  score_a: number;
  score_b: number;
};

const GAME_LIST_SQL = `
  SELECT g.*, ta.name AS a_name, tb.name AS b_name, ta.primary_color AS a_color, tb.primary_color AS b_color,
         ta.short_name AS a_short, tb.short_name AS b_short, e.name AS event_name,
         (SELECT COUNT(*) FROM point p WHERE p.game_id = g.id AND p.scoring_team_id = g.team_a_id) AS score_a,
         (SELECT COUNT(*) FROM point p WHERE p.game_id = g.id AND p.scoring_team_id = g.team_b_id) AS score_b
    FROM game g
    JOIN team ta ON ta.id = g.team_a_id
    JOIN team tb ON tb.id = g.team_b_id
    LEFT JOIN event e ON e.id = g.event_id
   WHERE g.deleted_at IS NULL`;

export function listGames(db: SQLiteDatabase) {
  return db.getAllAsync<GameListItem>(`${GAME_LIST_SQL} ORDER BY COALESCE(g.started_at, g.scheduled_at, g.created_at) DESC`);
}

export function listGamesForEvent(db: SQLiteDatabase, eventId: string) {
  return db.getAllAsync<GameListItem>(
    `${GAME_LIST_SQL} AND g.event_id = ? ORDER BY COALESCE(g.started_at, g.scheduled_at, g.created_at)`,
    eventId,
  );
}

export function listGamesForTeam(db: SQLiteDatabase, teamId: string) {
  return db.getAllAsync<GameListItem>(
    `${GAME_LIST_SQL} AND (g.team_a_id = ? OR g.team_b_id = ?) ORDER BY COALESCE(g.started_at, g.scheduled_at, g.created_at) DESC`,
    teamId,
    teamId,
  );
}

export function listGamesForPerson(db: SQLiteDatabase, personId: string) {
  return db.getAllAsync<GameListItem>(
    `${GAME_LIST_SQL} AND g.id IN (SELECT game_id FROM game_player WHERE person_id = ?)
     ORDER BY COALESCE(g.started_at, g.scheduled_at, g.created_at) DESC`,
    personId,
  );
}

export async function loadGameData(db: SQLiteDatabase, gameId: string): Promise<GameData | null> {
  const game = await db.getFirstAsync<Game>(`SELECT * FROM game WHERE id = ?`, gameId);
  if (!game) return null;
  const [points, events, lines, players] = await Promise.all([
    db.getAllAsync<Point>(`SELECT * FROM point WHERE game_id = ? ORDER BY number`, gameId),
    db.getAllAsync<GameEvent>(`SELECT * FROM game_event WHERE game_id = ? ORDER BY seq`, gameId),
    db.getAllAsync<{ point_id: string; team_id: string; person_id: string }>(
      `SELECT pp.* FROM point_player pp JOIN point p ON p.id = pp.point_id WHERE p.game_id = ?`,
      gameId,
    ),
    db.getAllAsync<GamePlayer>(`SELECT * FROM game_player WHERE game_id = ?`, gameId),
  ]);
  return { game, points, events, lines, players };
}

export type NewGame = {
  eventId: string | null;
  venueId: string | null;
  teamAId: string;
  teamBId: string;
  trackingMode: TrackingMode;
  rules: Rules;
  firstPullTeamId: string;
  ratioPoint1: 'M' | 'W' | null;
  squads: { teamId: string; personId: string; jersey: string | null; position: Position | null }[];
};

export function createGame(db: SQLiteDatabase, g: NewGame) {
  return write(db, async () => {
    const id = uuid();
    const ts = now();
    await db.runAsync(
      `INSERT INTO game (id, event_id, venue_id, team_a_id, team_b_id, scheduled_at, status, tracking_mode, rules_json,
         first_pull_team_id, ratio_point1, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'live', ?, ?, ?, ?, ?, ?)`,
      id,
      g.eventId,
      g.venueId,
      g.teamAId,
      g.teamBId,
      ts,
      g.trackingMode,
      JSON.stringify(g.rules),
      g.firstPullTeamId,
      g.ratioPoint1,
      ts,
      ts,
    );
    for (const s of g.squads) {
      await db.runAsync(
        `INSERT INTO game_player (id, game_id, team_id, person_id, jersey_number, position) VALUES (?, ?, ?, ?, ?, ?)`,
        uuid(),
        id,
        s.teamId,
        s.personId,
        s.jersey,
        s.position,
      );
    }
    const receiving = g.firstPullTeamId === g.teamAId ? g.teamBId : g.teamAId;
    await insertPoint(db, id, 1, 1, receiving, ratioForPoint(1, g.ratioPoint1));
    return id;
  });
}

async function insertPoint(db: SQLiteDatabase, gameId: string, number: number, half: number, offense: string, ratio: string | null) {
  const id = uuid();
  await db.runAsync(
    `INSERT INTO point (id, game_id, number, half, offense_team_id, ratio, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    gameId,
    number,
    half,
    offense,
    ratio,
    now(),
  );
  return id;
}

async function nextSeq(db: SQLiteDatabase, gameId: string) {
  const r = await db.getFirstAsync<{ s: number | null }>(`SELECT MAX(seq) AS s FROM game_event WHERE game_id = ?`, gameId);
  return (r?.s ?? 0) + 1;
}

async function insertEvent(
  db: SQLiteDatabase,
  e: {
    gameId: string;
    pointId: string | null;
    type: GameEventType;
    teamId?: string | null;
    actorId?: string | null;
    secondaryId?: string | null;
    tertiaryId?: string | null;
    value?: string | null;
  },
) {
  const id = uuid();
  await db.runAsync(
    `INSERT INTO game_event (id, game_id, point_id, seq, type, team_id, actor_id, secondary_id, tertiary_id, value,
       recorded_at, device_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    e.gameId,
    e.pointId,
    await nextSeq(db, e.gameId),
    e.type,
    e.teamId ?? null,
    e.actorId ?? null,
    e.secondaryId ?? null,
    e.tertiaryId ?? null,
    e.value ?? null,
    now(),
    await deviceId(db),
  );
  return id;
}

export function recordEvent(db: SQLiteDatabase, e: Parameters<typeof insertEvent>[1]) {
  return write(db, () => insertEvent(db, e));
}

export function setLine(db: SQLiteDatabase, pointId: string, teamId: string, personIds: string[]) {
  return write(db, async () => {
    await db.runAsync(`DELETE FROM point_player WHERE point_id = ? AND team_id = ?`, pointId, teamId);
    for (const pid of personIds) {
      await db.runAsync(`INSERT INTO point_player (point_id, team_id, person_id) VALUES (?, ?, ?)`, pointId, teamId, pid);
    }
  });
}

/** Injury (or other) substitution mid-point: swap the player on the line and log it. */
export function substitute(db: SQLiteDatabase, gameId: string, pointId: string, teamId: string, outId: string, inId: string) {
  return write(db, async () => {
    await db.runAsync(`DELETE FROM point_player WHERE point_id = ? AND person_id = ?`, pointId, outId);
    await db.runAsync(`INSERT OR IGNORE INTO point_player (point_id, team_id, person_id) VALUES (?, ?, ?)`, pointId, teamId, inId);
    await insertEvent(db, { gameId, pointId, type: 'injury_sub', teamId, actorId: outId, secondaryId: inId });
  });
}

export function pull(db: SQLiteDatabase, gameId: string, pointId: string) {
  return write(db, async () => {
    const ts = now();
    await db.runAsync(`UPDATE point SET pulled_at = ? WHERE id = ?`, ts, pointId);
    await db.runAsync(`UPDATE game SET started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?`, ts, ts, gameId);
  });
}

export function setPullDetails(db: SQLiteDatabase, pointId: string, pullerId: string | null, outcome: PullOutcome) {
  return write(db, () =>
    db.runAsync(`UPDATE point SET puller_id = ?, pull_outcome = ? WHERE id = ?`, pullerId, outcome, pointId),
  );
}

/**
 * Ends the point. The score event is written immediately (names can be filled in during the pull
 * countdown), the next point is created with the right receiving team and ratio, and halftime is
 * recorded automatically when the halftime target is first reached.
 */
export function scorePoint(
  db: SQLiteDatabase,
  data: GameData,
  scoringTeamId: string,
  opts: { type?: 'score' | 'callahan'; scorerId?: string | null; assistId?: string | null; hockeyId?: string | null } = {},
) {
  return write(db, async () => {
    const { game } = data;
    const rules = parseRules(game.rules_json);
    const point = [...data.points].sort((a, b) => b.number - a.number)[0];
    const ts = now();
    await insertEvent(db, {
      gameId: game.id,
      pointId: point.id,
      type: opts.type ?? 'score',
      teamId: scoringTeamId,
      actorId: opts.scorerId ?? null,
      secondaryId: opts.assistId ?? null,
      tertiaryId: opts.hockeyId ?? null,
    });
    await db.runAsync(`UPDATE point SET scored_at = ?, scoring_team_id = ? WHERE id = ?`, ts, scoringTeamId, point.id);

    const scores = await db.getAllAsync<{ team: string; n: number }>(
      `SELECT scoring_team_id AS team, COUNT(*) AS n FROM point WHERE game_id = ? AND scoring_team_id IS NOT NULL GROUP BY scoring_team_id`,
      game.id,
    );
    const top = Math.max(0, ...scores.map((s) => s.n));
    const halftimeTaken = data.events.some((e) => e.type === 'halftime' && !e.voided_at);
    const startsSecondHalf = !halftimeTaken && top >= rules.halftimeTarget && point.half === 1;
    if (startsSecondHalf) {
      await insertEvent(db, { gameId: game.id, pointId: point.id, type: 'halftime' });
    }
    if (top >= rules.pointTarget) return { gameOver: true };

    const offense =
      startsSecondHalf && game.first_pull_team_id ? game.first_pull_team_id : otherTeam(game, scoringTeamId);
    const n = point.number + 1;
    await insertPoint(db, game.id, n, startsSecondHalf ? 2 : point.half, offense, ratioForPoint(n, game.ratio_point1));
    return { gameOver: false };
  });
}

export function updateScoreNames(
  db: SQLiteDatabase,
  eventId: string,
  scorerId: string | null,
  assistId: string | null,
) {
  return write(db, () =>
    db.runAsync(`UPDATE game_event SET actor_id = ?, secondary_id = ? WHERE id = ?`, scorerId, assistId, eventId),
  );
}

export const END_REASONS = {
  target: 'Reached the target score',
  cap: 'Time cap',
  weather: 'Weather or light',
  injury: 'Injury',
  forfeit: 'Forfeit',
  other: 'Other',
} as const;
export type EndReason = keyof typeof END_REASONS;

export function endGame(db: SQLiteDatabase, data: GameData, reason: EndReason = 'target') {
  return write(db, async () => {
    const ts = now();
    // Drop the empty point that was waiting for a pull.
    const open = data.points.filter((p) => !p.pulled_at && !p.scored_at);
    for (const p of open) {
      await db.runAsync(`DELETE FROM point_player WHERE point_id = ?`, p.id);
      await db.runAsync(`DELETE FROM point WHERE id = ?`, p.id);
    }
    await insertEvent(db, { gameId: data.game.id, pointId: null, type: 'end', value: reason });
    await db.runAsync(`UPDATE game SET status = 'final', ended_at = ?, updated_at = ? WHERE id = ?`, ts, ts, data.game.id);
  });
}

export function reopenGame(db: SQLiteDatabase, data: GameData) {
  return write(db, async () => {
    const ts = now();
    await db.runAsync(`UPDATE game_event SET voided_at = ? WHERE game_id = ? AND type = 'end' AND voided_at IS NULL`, ts, data.game.id);
    await db.runAsync(`UPDATE game SET status = 'live', ended_at = NULL, updated_at = ? WHERE id = ?`, ts, data.game.id);
    const last = [...data.points].sort((a, b) => b.number - a.number)[0];
    if (last?.scored_at && last.scoring_team_id) {
      const n = last.number + 1;
      await insertPoint(db, data.game.id, n, last.half, otherTeam(data.game, last.scoring_team_id), ratioForPoint(n, data.game.ratio_point1));
    }
  });
}

/**
 * Undo the most recent action. Walks back through: in-point events → the pull → the score that
 * ended the previous point (which also removes the point that was created after it).
 */
export function undo(db: SQLiteDatabase, data: GameData) {
  return write(db, async () => {
    const ts = now();
    const points = [...data.points].sort((a, b) => b.number - a.number);
    const current = points[0];
    const events = data.events.filter((e) => !e.voided_at).sort((a, b) => b.seq - a.seq);
    const lastInPoint = events.find((e) => e.point_id === current?.id && e.type !== 'halftime');

    if (current?.pulled_at && !current.scored_at) {
      if (lastInPoint) {
        await db.runAsync(`UPDATE game_event SET voided_at = ? WHERE id = ?`, ts, lastInPoint.id);
        if (lastInPoint.type === 'injury_sub' && lastInPoint.actor_id && lastInPoint.secondary_id && lastInPoint.team_id) {
          await db.runAsync(`DELETE FROM point_player WHERE point_id = ? AND person_id = ?`, current.id, lastInPoint.secondary_id);
          await db.runAsync(
            `INSERT OR IGNORE INTO point_player (point_id, team_id, person_id) VALUES (?, ?, ?)`,
            current.id,
            lastInPoint.team_id,
            lastInPoint.actor_id,
          );
        }
        return 'event';
      }
      await db.runAsync(`UPDATE point SET pulled_at = NULL, puller_id = NULL, pull_outcome = NULL WHERE id = ?`, current.id);
      return 'pull';
    }

    // Between points: first undo a pre-pull timeout or stoppage, then the score that ended the last point.
    if (current && !current.pulled_at && lastInPoint) {
      await db.runAsync(`UPDATE game_event SET voided_at = ? WHERE id = ?`, ts, lastInPoint.id);
      return 'event';
    }
    const previous = current && !current.pulled_at ? points[1] : current;
    if (!previous?.scored_at) return 'nothing';
    if (current && current !== previous) {
      await db.runAsync(`DELETE FROM point_player WHERE point_id = ?`, current.id);
      await db.runAsync(`DELETE FROM point WHERE id = ?`, current.id);
    }
    await db.runAsync(
      `UPDATE game_event SET voided_at = ? WHERE point_id = ? AND type IN ('score','callahan','halftime') AND voided_at IS NULL`,
      ts,
      previous.id,
    );
    await db.runAsync(`UPDATE point SET scored_at = NULL, scoring_team_id = NULL WHERE id = ?`, previous.id);
    if (data.game.status === 'final') {
      await db.runAsync(`UPDATE game SET status = 'live', ended_at = NULL WHERE id = ?`, data.game.id);
      await db.runAsync(`UPDATE game_event SET voided_at = ? WHERE game_id = ? AND type = 'end' AND voided_at IS NULL`, ts, data.game.id);
    }
    return 'score';
  });
}

export function setPlayerStatus(db: SQLiteDatabase, gameId: string, personId: string, status: GamePlayer['status']) {
  return write(db, () =>
    db.runAsync(`UPDATE game_player SET status = ? WHERE game_id = ? AND person_id = ?`, status, gameId, personId),
  );
}

export function addGamePlayer(db: SQLiteDatabase, gameId: string, teamId: string, personId: string, jersey: string | null) {
  return write(db, () =>
    db.runAsync(
      `INSERT OR IGNORE INTO game_player (id, game_id, team_id, person_id, jersey_number) VALUES (?, ?, ?, ?, ?)`,
      uuid(),
      gameId,
      teamId,
      personId,
      jersey,
    ),
  );
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
  const lines = await db.getAllAsync<Omit<SavedLine, 'member_ids'>>(
    `SELECT id, team_id, name, side FROM saved_line WHERE team_id = ? AND deleted_at IS NULL ORDER BY created_at`,
    teamId,
  );
  const members = await db.getAllAsync<{ line_id: string; person_id: string }>(
    `SELECT m.* FROM saved_line_member m JOIN saved_line l ON l.id = m.line_id WHERE l.team_id = ?`,
    teamId,
  );
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

/* ---------------- Spirit ---------------- */

export function spiritForGame(db: SQLiteDatabase, gameId: string) {
  return db.getAllAsync<SpiritScore>(`SELECT * FROM spirit_score WHERE game_id = ?`, gameId);
}

export function spiritForEvent(db: SQLiteDatabase, eventId: string) {
  return db.getAllAsync<SpiritScore>(
    `SELECT s.* FROM spirit_score s JOIN game g ON g.id = s.game_id WHERE g.event_id = ? AND g.deleted_at IS NULL`,
    eventId,
  );
}

export function saveSpirit(db: SQLiteDatabase, s: Omit<SpiritScore, 'id' | 'submitted_at'>) {
  return write(db, () =>
    db.runAsync(
      `INSERT INTO spirit_score (id, game_id, from_team_id, to_team_id, rules, fouls, fairness, attitude, communication,
         comments_json, overall_comment, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(game_id, from_team_id) DO UPDATE SET rules = excluded.rules, fouls = excluded.fouls,
         fairness = excluded.fairness, attitude = excluded.attitude, communication = excluded.communication,
         comments_json = excluded.comments_json, overall_comment = excluded.overall_comment,
         submitted_at = excluded.submitted_at`,
      uuid(),
      s.game_id,
      s.from_team_id,
      s.to_team_id,
      s.rules,
      s.fouls,
      s.fairness,
      s.attitude,
      s.communication,
      s.comments_json,
      s.overall_comment,
      now(),
    ),
  );
}

/* ---------------- Info hub: pickups & calendar ---------------- */

export function listPickups(db: SQLiteDatabase) {
  return db.getAllAsync<PickupSpot>(`SELECT * FROM pickup_spot WHERE deleted_at IS NULL ORDER BY day_of_week, start_time`);
}

export function getPickup(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<PickupSpot>(`SELECT * FROM pickup_spot WHERE id = ?`, id);
}

export function savePickup(db: SQLiteDatabase, p: Omit<PickupSpot, 'id' | 'is_sample'> & { id?: string }) {
  return write(db, async () => {
    const id = p.id ?? uuid();
    const ts = now();
    await db.runAsync(
      `INSERT INTO pickup_spot (id, name, region, city, area, day_of_week, start_time, end_time, venue_text, map_url,
         contact_name, contact_phone, whatsapp_url, level, cost, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, region = excluded.region, city = excluded.city,
         area = excluded.area, day_of_week = excluded.day_of_week, start_time = excluded.start_time,
         end_time = excluded.end_time, venue_text = excluded.venue_text, map_url = excluded.map_url,
         contact_name = excluded.contact_name, contact_phone = excluded.contact_phone,
         whatsapp_url = excluded.whatsapp_url, level = excluded.level, cost = excluded.cost, notes = excluded.notes,
         is_sample = 0, updated_at = excluded.updated_at`,
      id,
      p.name.trim(),
      p.region,
      p.city.trim(),
      p.area,
      p.day_of_week,
      p.start_time,
      p.end_time,
      p.venue_text,
      p.map_url,
      p.contact_name,
      p.contact_phone,
      p.whatsapp_url,
      p.level,
      p.cost,
      p.notes,
      ts,
      ts,
    );
    return id;
  });
}

export function deletePickup(db: SQLiteDatabase, id: string) {
  return write(db, () => db.runAsync(`UPDATE pickup_spot SET deleted_at = ? WHERE id = ?`, now(), id));
}

export function listCalendar(db: SQLiteDatabase) {
  return db.getAllAsync<CalendarEntry>(
    `SELECT * FROM calendar_entry WHERE deleted_at IS NULL ORDER BY COALESCE(start_date, '9999'), name`,
  );
}

export function getCalendarEntry(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<CalendarEntry>(`SELECT * FROM calendar_entry WHERE id = ?`, id);
}

export function saveCalendarEntry(db: SQLiteDatabase, c: Omit<CalendarEntry, 'id'> & { id?: string }) {
  return write(db, async () => {
    const id = c.id ?? uuid();
    const ts = now();
    await db.runAsync(
      `INSERT INTO calendar_entry (id, name, kind, level, region, location, start_date, end_date, month_hint, status, url,
         notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, level = excluded.level,
         region = excluded.region, location = excluded.location, start_date = excluded.start_date,
         end_date = excluded.end_date, month_hint = excluded.month_hint, status = excluded.status, url = excluded.url,
         notes = excluded.notes, updated_at = excluded.updated_at`,
      id,
      c.name.trim(),
      c.kind,
      c.level,
      c.region,
      c.location,
      c.start_date,
      c.end_date,
      c.month_hint,
      c.status,
      c.url,
      c.notes,
      ts,
      ts,
    );
    return id;
  });
}

export function deleteCalendarEntry(db: SQLiteDatabase, id: string) {
  return write(db, () => db.runAsync(`UPDATE calendar_entry SET deleted_at = ? WHERE id = ?`, now(), id));
}
