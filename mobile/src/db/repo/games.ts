/* Tournaments and leagues, games and scoring events, fixtures, spirit, light results, and formats (standings, brackets, Swiss). */

import type { SQLiteDatabase } from 'expo-sqlite';
import { otherTeam, type GameData } from '@/domain/engine';
import { canPostpone, type StatusReason } from '@/domain/fixtures';
import { NOBODY, orderTable, resolveSource, swissRound, type Result, type SlotTemplate, type Source, type Standing, type TableRow } from '@/domain/formats';
import { parseRules, ratioForPoint, rulesFor, type Rules } from '@/domain/rules';
import type { Division, EventKind, EventLevel, EventRow, Game, GameEvent, GameEventType, GamePlayer, Point, Position, PullOutcome, SpiritScore, Team, TrackingMode } from '../types';
import { deviceId, now, uuid, write } from './core';

/* ---------------- Events (tournaments, leagues) ---------------- */

export function listEvents(db: SQLiteDatabase) {
  return db.getAllAsync<EventRow>(`SELECT * FROM event WHERE deleted_at IS NULL ORDER BY COALESCE(start_date, created_at) DESC`);
}

/** An event's games starting soon (from 3 hours ago to `hours` ahead) that haven't been started yet. */
export function soonFixtures(db: SQLiteDatabase, eventId: string, now = new Date(), hours = 36) {
  return db.getAllAsync<GameListItem>(
    `${GAME_LIST_SQL} AND g.event_id = ? AND g.status = 'scheduled' AND g.scheduled_at >= ? AND g.scheduled_at <= ?
     ORDER BY g.scheduled_at`,
    eventId,
    new Date(now.getTime() - 3 * 3600_000).toISOString(),
    new Date(now.getTime() + hours * 3600_000).toISOString(),
  );
}

export function getEvent(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<EventRow>(`SELECT * FROM event WHERE id = ?`, id);
}

export function eventTeams(db: SQLiteDatabase, eventId: string) {
  return db.getAllAsync<Team & { pool: string | null; seed: number | null }>(
    `SELECT t.*, et.pool, et.seed FROM event_team et JOIN team t ON t.id = et.team_id WHERE et.event_id = ?
      ORDER BY et.seed IS NULL, et.seed, t.name`,
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
  teams: { teamId: string; pool: string | null; seed?: number | null }[];
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
      await db.runAsync(`INSERT INTO event_team (id, event_id, team_id, pool, seed, created_at) VALUES (?, ?, ?, ?, ?, ?)`, uuid(), id, t.teamId, t.pool, t.seed ?? null, ts);
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
  event_kind: string | null;
  score_a: number;
  score_b: number;
  venue_name: string | null;
  a_region: string | null;
  b_region: string | null;
  event_region: string | null;
};

const GAME_LIST_SQL = `
  SELECT g.*, ta.name AS a_name, tb.name AS b_name, ta.primary_color AS a_color, tb.primary_color AS b_color,
         ta.short_name AS a_short, tb.short_name AS b_short, e.name AS event_name, e.kind AS event_kind,
         CASE WHEN g.forfeit_team_id = g.team_a_id THEN 0
              WHEN g.forfeit_team_id = g.team_b_id THEN COALESCE(json_extract(g.rules_json, '$.pointTarget'), 15)
              WHEN g.result_mode = 'score' THEN COALESCE(g.final_a, 0)
              WHEN g.result_mode = 'winner' THEN CASE WHEN g.winner_team_id = g.team_a_id THEN 1 ELSE 0 END
              WHEN g.result_mode = 'none' THEN 0
              ELSE (SELECT COUNT(*) FROM point p WHERE p.game_id = g.id AND p.scoring_team_id = g.team_a_id) END AS score_a,
         CASE WHEN g.forfeit_team_id = g.team_b_id THEN 0
              WHEN g.forfeit_team_id = g.team_a_id THEN COALESCE(json_extract(g.rules_json, '$.pointTarget'), 15)
              WHEN g.result_mode = 'score' THEN COALESCE(g.final_b, 0)
              WHEN g.result_mode = 'winner' THEN CASE WHEN g.winner_team_id = g.team_b_id THEN 1 ELSE 0 END
              WHEN g.result_mode = 'none' THEN 0
              ELSE (SELECT COUNT(*) FROM point p WHERE p.game_id = g.id AND p.scoring_team_id = g.team_b_id) END AS score_b,
         v.name AS venue_name, ta.region AS a_region, tb.region AS b_region, e.region AS event_region
    FROM game g
    JOIN team ta ON ta.id = g.team_a_id
    JOIN team tb ON tb.id = g.team_b_id
    LEFT JOIN event e ON e.id = g.event_id
    LEFT JOIN venue v ON v.id = g.venue_id
   WHERE g.deleted_at IS NULL`;

export function listGames(db: SQLiteDatabase) {
  return db.getAllAsync<GameListItem>(`${GAME_LIST_SQL} ORDER BY COALESCE(g.started_at, g.scheduled_at, g.created_at) DESC`);
}

export function getGameListItem(db: SQLiteDatabase, gameId: string) {
  return db.getFirstAsync<GameListItem>(`${GAME_LIST_SQL} AND g.id = ?`, gameId);
}

export function listGamesForEvent(db: SQLiteDatabase, eventId: string) {
  return db.getAllAsync<GameListItem>(`${GAME_LIST_SQL} AND g.event_id = ? ORDER BY COALESCE(g.scheduled_at, g.started_at, '9999'), g.created_at`, eventId);
}

export function listGamesForTeam(db: SQLiteDatabase, teamId: string) {
  return db.getAllAsync<GameListItem>(`${GAME_LIST_SQL} AND (g.team_a_id = ? OR g.team_b_id = ?) ORDER BY COALESCE(g.started_at, g.scheduled_at, g.created_at) DESC`, teamId, teamId);
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
    db.getAllAsync<{ point_id: string; team_id: string; person_id: string }>(`SELECT pp.* FROM point_player pp JOIN point p ON p.id = pp.point_id WHERE p.game_id = ?`, gameId),
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
      await db.runAsync(`INSERT INTO game_player (id, game_id, team_id, person_id, jersey_number, position) VALUES (?, ?, ?, ?, ?, ?)`, uuid(), id, s.teamId, s.personId, s.jersey, s.position);
    }
    const receiving = g.firstPullTeamId === g.teamAId ? g.teamBId : g.teamAId;
    await insertPoint(db, id, 1, 1, receiving, ratioForPoint(1, g.ratioPoint1));
    return id;
  });
}

/* ---------------- Fixtures (scheduled games) ---------------- */

export type NewFixture = {
  eventId: string;
  homeId: string;
  awayId: string;
  scheduledAt: string | null;
  venueId: string | null;
  rules: Rules;
  stage?: 'pool' | 'swiss' | 'playoff' | null;
  round?: number | null;
};

async function insertFixture(db: SQLiteDatabase, f: NewFixture) {
  const id = uuid();
  const ts = now();
  // Home is listed first (team A): they set up the field.
  await db.runAsync(
    `INSERT INTO game (id, event_id, venue_id, team_a_id, team_b_id, home_team_id, scheduled_at, status, tracking_mode,
       rules_json, stage, round, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 'standard', ?, ?, ?, ?, ?)`,
    id,
    f.eventId,
    f.venueId,
    f.homeId,
    f.awayId,
    f.homeId,
    f.scheduledAt,
    JSON.stringify(f.rules),
    f.stage ?? null,
    f.round ?? null,
    ts,
    ts,
  );
  return id;
}

export function createFixtures(db: SQLiteDatabase, fixtures: NewFixture[]) {
  return write(db, async () => {
    const ids: string[] = [];
    for (const f of fixtures) ids.push(await insertFixture(db, f));
    return ids;
  });
}

export function updateFixture(db: SQLiteDatabase, gameId: string, f: { scheduledAt: string | null; venueId: string | null; homeId: string; awayId: string }) {
  return write(db, async () => {
    const before = await db.getFirstAsync<{ scheduled_at: string | null }>(`SELECT scheduled_at FROM game WHERE id = ?`, gameId);
    await db.runAsync(
      `UPDATE game SET scheduled_at = ?, venue_id = ?, team_a_id = ?, team_b_id = ?, home_team_id = ?, updated_at = ? WHERE id = ?`,
      f.scheduledAt,
      f.venueId,
      f.homeId,
      f.awayId,
      f.homeId,
      now(),
      gameId,
    );
    if (before?.scheduled_at !== f.scheduledAt) {
      await db.runAsync(`INSERT INTO game_status_log (id, game_id, action, previous_scheduled_at, created_at) VALUES (?, ?, 'reschedule', ?, ?)`, uuid(), gameId, before?.scheduled_at ?? null, now());
    }
  });
}

export type StatusLogEntry = {
  id: string;
  action: 'postpone' | 'forfeit' | 'reschedule';
  team_id: string | null;
  reason: StatusReason | null;
  note: string | null;
  previous_scheduled_at: string | null;
  created_at: string;
};

export function statusLog(db: SQLiteDatabase, gameId: string) {
  return db.getAllAsync<StatusLogEntry>(`SELECT * FROM game_status_log WHERE game_id = ? ORDER BY created_at DESC`, gameId);
}

/** Postpone a league game (max twice). The new date can be set now or later (date TBC). */
export function postponeGame(db: SQLiteDatabase, gameId: string, byTeamId: string, reason: StatusReason, note: string | null, newScheduledAt: string | null) {
  return write(db, async () => {
    const g = await db.getFirstAsync<{ scheduled_at: string | null; postponements: number; kind: EventKind | null }>(
      `SELECT g.scheduled_at, g.postponements, e.kind FROM game g LEFT JOIN event e ON e.id = g.event_id WHERE g.id = ?`,
      gameId,
    );
    if (!g || !canPostpone(g.kind, g.postponements)) throw new Error('This game can’t be postponed again — it has to be forfeited.');
    await db.runAsync(
      `INSERT INTO game_status_log (id, game_id, action, team_id, reason, note, previous_scheduled_at, created_at)
       VALUES (?, ?, 'postpone', ?, ?, ?, ?, ?)`,
      uuid(),
      gameId,
      byTeamId,
      reason,
      note,
      g.scheduled_at,
      now(),
    );
    await db.runAsync(`UPDATE game SET postponements = postponements + 1, scheduled_at = ?, updated_at = ? WHERE id = ?`, newScheduledAt, now(), gameId);
  });
}

/** The team that can't play forfeits: the game is final and counts as a loss for them. */
export function forfeitGame(db: SQLiteDatabase, gameId: string, forfeitingTeamId: string, reason: StatusReason, note: string | null) {
  return write(db, async () => {
    const ts = now();
    await db.runAsync(`INSERT INTO game_status_log (id, game_id, action, team_id, reason, note, created_at) VALUES (?, ?, 'forfeit', ?, ?, ?, ?)`, uuid(), gameId, forfeitingTeamId, reason, note, ts);
    await db.runAsync(`UPDATE game SET status = 'final', forfeit_team_id = ?, ended_at = ?, updated_at = ? WHERE id = ?`, forfeitingTeamId, ts, ts, gameId);
    const ev = await db.getFirstAsync<{ event_id: string | null }>(`SELECT event_id FROM game WHERE id = ?`, gameId);
    if (ev?.event_id) await fillBracket(db, ev.event_id);
  });
}

/** Turn a scheduled fixture into a live game: same id, so it stays in the event's schedule. */
export function startScheduledGame(db: SQLiteDatabase, gameId: string, g: NewGame) {
  return write(db, async () => {
    const ts = now();
    await db.runAsync(
      `UPDATE game SET venue_id = ?, team_a_id = ?, team_b_id = ?, status = 'live', tracking_mode = ?, rules_json = ?,
         first_pull_team_id = ?, ratio_point1 = ?, updated_at = ? WHERE id = ?`,
      g.venueId,
      g.teamAId,
      g.teamBId,
      g.trackingMode,
      JSON.stringify(g.rules),
      g.firstPullTeamId,
      g.ratioPoint1,
      ts,
      gameId,
    );
    await db.runAsync(`DELETE FROM game_player WHERE game_id = ?`, gameId);
    for (const sq of g.squads) {
      await db.runAsync(`INSERT INTO game_player (id, game_id, team_id, person_id, jersey_number, position) VALUES (?, ?, ?, ?, ?, ?)`, uuid(), gameId, sq.teamId, sq.personId, sq.jersey, sq.position);
    }
    const receiving = g.firstPullTeamId === g.teamAId ? g.teamBId : g.teamAId;
    await insertPoint(db, gameId, 1, 1, receiving, ratioForPoint(1, g.ratioPoint1));
    return gameId;
  });
}

async function insertPoint(db: SQLiteDatabase, gameId: string, number: number, half: number, offense: string, ratio: string | null) {
  const id = uuid();
  await db.runAsync(`INSERT INTO point (id, game_id, number, half, offense_team_id, ratio, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, id, gameId, number, half, offense, ratio, now());
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

export type SubReason = 'injury' | 'illness' | 'other';
export const SUB_REASONS: Record<SubReason, string> = { injury: 'Injury', illness: 'Illness', other: 'Other' };

/**
 * Mid-point substitution: swap the player on the line and log it with a reason. An injured or ill
 * player is also marked unavailable, so line suggestions skip them until someone clears it.
 */
export function substitute(db: SQLiteDatabase, gameId: string, pointId: string, teamId: string, outId: string, inId: string, reason: SubReason = 'injury') {
  return write(db, async () => {
    await db.runAsync(`DELETE FROM point_player WHERE point_id = ? AND person_id = ?`, pointId, outId);
    await db.runAsync(`INSERT OR IGNORE INTO point_player (point_id, team_id, person_id) VALUES (?, ?, ?)`, pointId, teamId, inId);
    await insertEvent(db, { gameId, pointId, type: 'injury_sub', teamId, actorId: outId, secondaryId: inId, value: reason });
    if (reason !== 'other') await db.runAsync(`UPDATE game_player SET status = 'injured' WHERE game_id = ? AND person_id = ?`, gameId, outId);
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
  return write(db, () => db.runAsync(`UPDATE point SET puller_id = ?, pull_outcome = ? WHERE id = ?`, pullerId, outcome, pointId));
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

    const offense = startsSecondHalf && game.first_pull_team_id ? game.first_pull_team_id : otherTeam(game, scoringTeamId);
    const n = point.number + 1;
    await insertPoint(db, game.id, n, startsSecondHalf ? 2 : point.half, offense, ratioForPoint(n, game.ratio_point1));
    return { gameOver: false };
  });
}

export function updateScoreNames(db: SQLiteDatabase, eventId: string, scorerId: string | null, assistId: string | null) {
  return write(db, () => db.runAsync(`UPDATE game_event SET actor_id = ?, secondary_id = ? WHERE id = ?`, scorerId, assistId, eventId));
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
      // A timeout (or sub) called before the pull still happened: keep it, just not on a point that never started.
      await db.runAsync(`UPDATE game_event SET point_id = NULL WHERE point_id = ?`, p.id);
      await db.runAsync(`DELETE FROM point_player WHERE point_id = ?`, p.id);
      await db.runAsync(`DELETE FROM point WHERE id = ?`, p.id);
    }
    await insertEvent(db, { gameId: data.game.id, pointId: null, type: 'end', value: reason });
    await db.runAsync(`UPDATE game SET status = 'final', ended_at = ?, updated_at = ? WHERE id = ?`, ts, ts, data.game.id);
    if (data.game.event_id) await fillBracket(db, data.game.event_id);
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
          await db.runAsync(`INSERT OR IGNORE INTO point_player (point_id, team_id, person_id) VALUES (?, ?, ?)`, current.id, lastInPoint.team_id, lastInPoint.actor_id);
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
      // Undone pre-pull timeouts still name this point; unhook them so it can go.
      await db.runAsync(`UPDATE game_event SET point_id = NULL WHERE point_id = ?`, current.id);
      await db.runAsync(`DELETE FROM point_player WHERE point_id = ?`, current.id);
      await db.runAsync(`DELETE FROM point WHERE id = ?`, current.id);
    }
    await db.runAsync(`UPDATE game_event SET voided_at = ? WHERE point_id = ? AND type IN ('score','callahan','halftime') AND voided_at IS NULL`, ts, previous.id);
    await db.runAsync(`UPDATE point SET scored_at = NULL, scoring_team_id = NULL WHERE id = ?`, previous.id);
    if (data.game.status === 'final') {
      await db.runAsync(`UPDATE game SET status = 'live', ended_at = NULL WHERE id = ?`, data.game.id);
      await db.runAsync(`UPDATE game_event SET voided_at = ? WHERE game_id = ? AND type = 'end' AND voided_at IS NULL`, ts, data.game.id);
    }
    return 'score';
  });
}

export function setPlayerStatus(db: SQLiteDatabase, gameId: string, personId: string, status: GamePlayer['status']) {
  return write(db, () => db.runAsync(`UPDATE game_player SET status = ? WHERE game_id = ? AND person_id = ?`, status, gameId, personId));
}

export function addGamePlayer(db: SQLiteDatabase, gameId: string, teamId: string, personId: string, jersey: string | null) {
  return write(db, () =>
    db.runAsync(`INSERT OR IGNORE INTO game_player (id, game_id, team_id, person_id, jersey_number, added_in_game) VALUES (?, ?, ?, ?, ?, 1)`, uuid(), gameId, teamId, personId, jersey),
  );
}

/** After the game: team staff confirm or remove, or a player confirms they played. */
export function setConfirmation(db: SQLiteDatabase, gameId: string, personId: string, confirmation: GamePlayer['confirmation']) {
  return write(db, () => db.runAsync(`UPDATE game_player SET confirmation = ? WHERE game_id = ? AND person_id = ?`, confirmation, gameId, personId));
}

export function confirmTeamRoster(db: SQLiteDatabase, gameId: string, teamId: string) {
  return write(db, () => db.runAsync(`UPDATE game_player SET confirmation = 'confirmed' WHERE game_id = ? AND team_id = ? AND confirmation IN ('pending','played')`, gameId, teamId));
}

/* ---------------- Spirit ---------------- */

export function spiritForGame(db: SQLiteDatabase, gameId: string) {
  return db.getAllAsync<SpiritScore>(`SELECT * FROM spirit_score WHERE game_id = ?`, gameId);
}

export function spiritForEvent(db: SQLiteDatabase, eventId: string) {
  return db.getAllAsync<SpiritScore>(`SELECT s.* FROM spirit_score s JOIN game g ON g.id = s.game_id WHERE g.event_id = ? AND g.deleted_at IS NULL`, eventId);
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

/* ---------------- Light results: final score, winner only, or just played ---------------- */

export type ResultMode = 'score' | 'winner' | 'none';

/** Record a game's result without point-by-point tracking, and finish it. */
export function setGameResult(db: SQLiteDatabase, gameId: string, r: { mode: ResultMode; finalA?: number | null; finalB?: number | null; winnerTeamId?: string | null }) {
  return write(db, async () => {
    const ts = now();
    await db.runAsync(
      `UPDATE game SET result_mode = ?, final_a = ?, final_b = ?, winner_team_id = ?, status = 'final',
         started_at = COALESCE(started_at, scheduled_at, ?), ended_at = COALESCE(ended_at, ?), updated_at = ? WHERE id = ?`,
      r.mode,
      r.mode === 'score' ? (r.finalA ?? 0) : null,
      r.mode === 'score' ? (r.finalB ?? 0) : null,
      r.mode === 'winner' ? (r.winnerTeamId ?? null) : null,
      ts,
      ts,
      ts,
      gameId,
    );
    const ev = await db.getFirstAsync<{ event_id: string | null }>(`SELECT event_id FROM game WHERE id = ?`, gameId);
    if (ev?.event_id) await fillBracket(db, ev.event_id);
  });
}

/* ---------------- Formats: standings, playoff brackets, Swiss ---------------- */

/**
 * Standings from finished non-playoff games, ordered with head-to-head tiebreaks.
 * rankings(pool) is null while that pool (or the event) still has unfinished games.
 */
export async function eventRankings(db: SQLiteDatabase, eventId: string) {
  const [teams, games] = await Promise.all([eventTeams(db, eventId), listGamesForEvent(db, eventId)]);
  const pool = games.filter((g) => g.stage !== 'playoff');
  // "Just played" games (no result) don't count; winner-only games count as a win/loss with no points.
  const done = pool.filter((g) => g.status === 'final' && g.result_mode !== 'none');
  const results: Result[] = done.map((g) => ({ a: g.team_a_id, b: g.team_b_id, scoreA: g.score_a, scoreB: g.score_b }));
  const noPoints = new Set(done.filter((g) => g.result_mode === 'winner').map((g) => `${g.team_a_id}|${g.team_b_id}|${g.score_a}|${g.score_b}`));
  const row = (teamId: string): TableRow & Standing => {
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let pf = 0;
    let pa = 0;
    for (const r of results) {
      if (r.a !== teamId && r.b !== teamId) continue;
      const [f, a] = r.a === teamId ? [r.scoreA, r.scoreB] : [r.scoreB, r.scoreA];
      if (!noPoints.has(`${r.a}|${r.b}|${r.scoreA}|${r.scoreB}`)) {
        pf += f;
        pa += a;
      }
      if (f > a) wins += 1;
      else if (f < a) losses += 1;
      else draws += 1;
    }
    return { teamId, wins, draws, losses, pointsFor: pf, pointsAgainst: pa, diff: pf - pa };
  };
  const all = teams.map((t) => t.id);
  const open = (ids: string[]) => pool.some((g) => g.status !== 'final' && (ids.includes(g.team_a_id) || ids.includes(g.team_b_id)));
  const ordered = (ids: string[]) => orderTable(ids.map(row), results);
  const poolNames = Array.from(new Set(teams.map((t) => t.pool).filter((p): p is string => !!p))).sort();
  const rankings = (p: string | null) => {
    const ids = p ? teams.filter((t) => (t.pool ?? '') === p).map((t) => t.id) : all;
    if (!ids.length || open(ids) || !done.length) return null;
    return ordered(ids);
  };
  return {
    teams,
    games,
    standings: ordered(all).map(row),
    rankings,
    /** A1, B1, A2, B2 … once every pool is finished (crossover seeding). */
    poolOrder: () => {
      if (!poolNames.length) return rankings(null);
      const per = poolNames.map((p) => rankings(p));
      if (per.some((x) => !x)) return null;
      const out: string[] = [];
      for (let i = 0; i < Math.max(...per.map((x) => x!.length)); i += 1) per.forEach((x) => x![i] && out.push(x![i]));
      return out;
    },
    seeds: () => teams.map((t) => t.id),
  };
}

export type BracketSlotRow = {
  id: string;
  event_id: string;
  name: string;
  round: number;
  position: number;
  source_a: string;
  source_b: string;
  game_id: string | null;
  grp: string | null;
  place: number | null;
  scheduled_at: string | null;
  venue_id: string | null;
};

export function bracketSlots(db: SQLiteDatabase, eventId: string) {
  return db.getAllAsync<BracketSlotRow>(`SELECT * FROM bracket_slot WHERE event_id = ? ORDER BY round, position`, eventId);
}

/** Lay out a playoff bracket. Slots fill with teams (and become games) as results come in. */
export function createBracket(db: SQLiteDatabase, eventId: string, template: SlotTemplate[]) {
  return write(db, async () => {
    const ids = new Map(template.map((sl) => [sl.key, uuid()]));
    const map = (src: Source): Source => (src.type === 'winner' || src.type === 'loser' ? { ...src, slot: ids.get(src.slot)! } : src);
    let position = 0;
    for (const sl of template) {
      position += 1;
      await db.runAsync(
        `INSERT INTO bracket_slot (id, event_id, name, round, position, source_a, source_b, grp, place, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ids.get(sl.key)!,
        eventId,
        sl.name,
        sl.round,
        position,
        JSON.stringify(map(sl.a)),
        JSON.stringify(map(sl.b)),
        sl.group,
        sl.place,
        now(),
      );
    }
    return fillBracket(db, eventId);
  });
}

/** Set a playoff slot's time and field ahead of time; its game (now or later) uses them. */
export function scheduleSlot(db: SQLiteDatabase, slotId: string, scheduledAt: string | null, venueId: string | null) {
  return write(db, async () => {
    await db.runAsync(`UPDATE bracket_slot SET scheduled_at = ?, venue_id = ? WHERE id = ?`, scheduledAt, venueId, slotId);
    const sl = await db.getFirstAsync<{ game_id: string | null }>(`SELECT game_id FROM bracket_slot WHERE id = ?`, slotId);
    if (sl?.game_id) {
      await db.runAsync(`UPDATE game SET scheduled_at = ?, venue_id = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'`, scheduledAt, venueId, now(), sl.game_id);
    }
  });
}

export function deleteBracket(db: SQLiteDatabase, eventId: string) {
  return write(db, async () => {
    const slots = await bracketSlots(db, eventId);
    for (const sl of slots) {
      if (sl.game_id) await db.runAsync(`UPDATE game SET deleted_at = ? WHERE id = ? AND status = 'scheduled'`, now(), sl.game_id);
    }
    await db.runAsync(`DELETE FROM bracket_slot WHERE event_id = ?`, eventId);
  });
}

export type SlotState = { a: string | null; b: string | null; winner: string | null; loser: string | null; walkover: boolean };

/**
 * Work out every slot: who is in it (team id, NOBODY for a bye, null if not decided) and, when it's
 * finished, who won. A slot with a team against NOBODY is a walkover — no game is played.
 */
export async function resolveBracket(db: SQLiteDatabase, eventId: string) {
  const slots = await bracketSlots(db, eventId);
  const ctx = await eventRankings(db, eventId);
  const byId = new Map(ctx.games.map((g) => [g.id, g]));
  const state = new Map<string, SlotState>();
  for (const sl of slots) {
    const result = (slotId: string) => {
      const st = state.get(slotId);
      return st?.winner && st.loser ? { winner: st.winner, loser: st.loser } : null;
    };
    const rc = { rankings: ctx.rankings, poolOrder: ctx.poolOrder, seeds: ctx.seeds, result };
    const a = resolveSource(JSON.parse(sl.source_a), rc);
    const b = resolveSource(JSON.parse(sl.source_b), rc);
    let winner: string | null = null;
    let loser: string | null = null;
    let walkover = false;
    if (a && b && (a === NOBODY || b === NOBODY)) {
      walkover = true;
      winner = a === NOBODY ? b : a;
      loser = NOBODY;
    } else {
      const g = sl.game_id ? byId.get(sl.game_id) : undefined;
      if (g && g.status === 'final' && g.score_a !== g.score_b) {
        const aWon = g.score_a > g.score_b;
        winner = aWon ? g.team_a_id : g.team_b_id;
        loser = aWon ? g.team_b_id : g.team_a_id;
      }
    }
    state.set(sl.id, { a, b, winner, loser, walkover });
  }
  return { slots, state, ...ctx };
}

/**
 * Create the playoff games whose two teams are now known. Runs after every finished or forfeited game
 * in the event, so teams advance on their own. Returns how many games were created.
 */
export async function fillBracket(db: SQLiteDatabase, eventId: string) {
  const { slots, state } = await resolveBracket(db, eventId);
  if (!slots.length) return 0;
  const event = await getEvent(db, eventId);
  const rules = rulesFor(event?.kind === 'league' ? 'league' : 'wfdf', event?.division ?? 'mixed');
  let created = 0;
  for (const sl of slots) {
    const st = state.get(sl.id)!;
    if (sl.game_id || st.walkover || !st.a || !st.b || st.a === NOBODY || st.b === NOBODY || st.a === st.b) continue;
    const id = await insertFixture(db, {
      eventId,
      homeId: st.a,
      awayId: st.b,
      scheduledAt: sl.scheduled_at,
      venueId: sl.venue_id,
      rules,
      stage: 'playoff',
      round: sl.round,
    });
    await db.runAsync(`UPDATE bracket_slot SET game_id = ? WHERE id = ?`, id, sl.id);
    created += 1;
  }
  // New games can unlock nothing further until they're played, so one pass is enough.
  return created;
}

export function fillBracketNow(db: SQLiteDatabase, eventId: string) {
  return write(db, () => fillBracket(db, eventId));
}

/**
 * Final placings: places decided by placing games (final, 3rd place, 5th place…), then everyone else
 * in standings order. `decided` is false while any placing game is unfinished.
 */
export async function finalPlacings(db: SQLiteDatabase, eventId: string) {
  const { slots, state, standings, teams } = await resolveBracket(db, eventId);
  const place = new Map<string, number>();
  let decided = slots.length > 0;
  for (const sl of slots.filter((x) => x.place != null)) {
    const st = state.get(sl.id)!;
    if (!st.winner) {
      // A placing game with nobody on either side decides nothing; otherwise we're still waiting.
      if (st.a !== NOBODY || st.b !== NOBODY) decided = false;
      continue;
    }
    if (st.winner !== NOBODY) place.set(st.winner, sl.place!);
    if (st.loser && st.loser !== NOBODY) place.set(st.loser, sl.place! + 1);
  }
  const placed = [...place.entries()].sort((a, b) => a[1] - b[1]).map(([teamId, p]) => ({ teamId, place: p }));
  let next = placed.length ? Math.max(...placed.map((p) => p.place)) + 1 : 1;
  const rest = standings.filter((s) => !place.has(s.teamId)).map((s) => ({ teamId: s.teamId, place: next++ }));
  return { placings: [...placed, ...rest], decided, teams, hasBracket: slots.length > 0 };
}

/** Pair and create the next Swiss round from the current standings (no rematches where possible). */
export function createSwissRound(db: SQLiteDatabase, eventId: string, opts: { scheduledAt: string | null; venueIds: string[] }) {
  return write(db, async () => {
    const { teams, games, standings } = await eventRankings(db, eventId);
    const swiss = games.filter((g) => g.stage === 'swiss');
    const unfinished = swiss.filter((g) => g.status !== 'final');
    if (unfinished.length) throw new Error(`Finish the current round first (${unfinished.length} game${unfinished.length > 1 ? 's' : ''} left).`);
    const round = Math.max(0, ...swiss.map((g) => g.round ?? 0)) + 1;
    const played = new Set<string>();
    for (const g of games.filter((x) => x.stage !== 'playoff')) {
      played.add(`${g.team_a_id}|${g.team_b_id}`);
      played.add(`${g.team_b_id}|${g.team_a_id}`);
    }
    const hadBye = new Set<string>();
    for (let r = 1; r < round; r += 1) {
      const inRound = new Set(swiss.filter((g) => g.round === r).flatMap((g) => [g.team_a_id, g.team_b_id]));
      teams.forEach((t) => !inRound.has(t.id) && hadBye.add(t.id));
    }
    const { pairs, bye } = swissRound(standings, played, hadBye);
    const homes = new Map<string, number>();
    for (const g of swiss) homes.set(g.home_team_id ?? g.team_a_id, (homes.get(g.home_team_id ?? g.team_a_id) ?? 0) + 1);
    const event = await getEvent(db, eventId);
    const rules = rulesFor(event?.kind === 'league' ? 'league' : 'wfdf', event?.division ?? 'mixed');
    let i = 0;
    for (const [x, y] of pairs) {
      // Whoever has hosted less this Swiss stage hosts (sets up the field).
      const [home, away] = (homes.get(x) ?? 0) <= (homes.get(y) ?? 0) ? [x, y] : [y, x];
      homes.set(home, (homes.get(home) ?? 0) + 1);
      await insertFixture(db, {
        eventId,
        homeId: home,
        awayId: away,
        scheduledAt: opts.scheduledAt,
        venueId: opts.venueIds.length ? opts.venueIds[i % opts.venueIds.length] : null,
        rules,
        stage: 'swiss',
        round,
      });
      i += 1;
    }
    return { round, games: pairs.length, bye };
  });
}
