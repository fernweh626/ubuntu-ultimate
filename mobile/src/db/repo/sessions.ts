/* Practices and other sessions, who is coming, reflections and shout-outs, and the personal log. */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { Answers, NiggleSeverity, PlayingTime, ReflectionKind, ReflectionRow } from '@/domain/reflection';
import type { Gender } from '../types';
import { now, uuid, write } from './core';

/* ---------------- Sessions (practices, pickups) ---------------- */

export type SessionRow = {
  id: string;
  kind: 'practice' | 'pickup' | 'gym' | 'physio' | 'other';
  team_id: string | null;
  title: string | null;
  started_at: string;
  duration_min: number;
  venue_id: string | null;
  created_by_id: string | null;
  notes?: string | null;
  cancelled_at?: string | null;
  series_id?: string | null;
};

export function createSession(
  db: SQLiteDatabase,
  s: { kind: SessionRow['kind']; teamId: string | null; title: string | null; startedAt: string; durationMin: number; venueId: string | null; createdById: string | null },
) {
  return write(db, async () => {
    const id = uuid();
    const ts = now();
    await db.runAsync(
      `INSERT INTO session (id, kind, team_id, title, started_at, duration_min, venue_id, created_by_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      s.kind,
      s.teamId,
      s.title,
      s.startedAt,
      s.durationMin,
      s.venueId,
      s.createdById,
      ts,
      ts,
    );
    return id;
  });
}

export function getSession(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<SessionRow>(`SELECT * FROM session WHERE id = ?`, id);
}

export function sessionsForTeam(db: SQLiteDatabase, teamId: string) {
  return db.getAllAsync<SessionRow>(`SELECT * FROM session WHERE team_id = ? AND deleted_at IS NULL ORDER BY started_at DESC`, teamId);
}

/* ---------------- Scheduled practices & who's coming ---------------- */

export type PracticeInput = { teamId: string; title: string | null; notes: string | null; startAt: string; durationMin: number; venueId: string | null; createdById: string | null };

/** Schedule a practice, or the same practice weekly for `weeks` weeks (one series). Returns the first id. */
export function schedulePractices(db: SQLiteDatabase, p: PracticeInput, weeks = 1) {
  return write(db, async () => {
    const series = weeks > 1 ? uuid() : null;
    const ts = now();
    let first = '';
    for (let w = 0; w < weeks; w++) {
      const at = new Date(p.startAt);
      at.setDate(at.getDate() + 7 * w);
      const id = uuid();
      if (!first) first = id;
      await db.runAsync(
        `INSERT INTO session (id, kind, team_id, title, notes, started_at, duration_min, venue_id, created_by_id, series_id, created_at, updated_at)
         VALUES (?, 'practice', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        p.teamId,
        p.title,
        p.notes,
        at.toISOString(),
        p.durationMin,
        p.venueId,
        p.createdById,
        series,
        ts,
        ts,
      );
    }
    return first;
  });
}

export function updatePractice(db: SQLiteDatabase, id: string, p: Omit<PracticeInput, 'teamId' | 'createdById'>) {
  return write(db, () =>
    db.runAsync(
      `UPDATE session SET title = ?, notes = ?, started_at = ?, duration_min = ?, venue_id = ?, updated_at = ? WHERE id = ?`,
      p.title,
      p.notes,
      p.startAt,
      p.durationMin,
      p.venueId,
      now(),
      id,
    ),
  );
}

/** Cancel (or un-cancel) one practice, or it and every later one in its weekly series. */
export function cancelPractice(db: SQLiteDatabase, id: string, cancel: boolean, laterToo = false) {
  return write(db, async () => {
    const s = await db.getFirstAsync<{ series_id: string | null; started_at: string }>(`SELECT series_id, started_at FROM session WHERE id = ?`, id);
    if (!s) return;
    const value = cancel ? now() : null;
    if (laterToo && s.series_id) {
      await db.runAsync(`UPDATE session SET cancelled_at = ?, updated_at = ? WHERE series_id = ? AND started_at >= ?`, value, now(), s.series_id, s.started_at);
    } else {
      await db.runAsync(`UPDATE session SET cancelled_at = ?, updated_at = ? WHERE id = ?`, value, now(), id);
    }
  });
}

export type RsvpStatus = 'going' | 'late' | 'not_going';

/** Answer for a practice; `null` clears the answer. One row per player per practice. */
export function setRsvp(db: SQLiteDatabase, sessionId: string, personId: string, status: RsvpStatus | null, reason: string | null = null) {
  return write(db, async () => {
    const id = `${sessionId}:${personId}`;
    if (!status) return void (await db.runAsync(`DELETE FROM practice_rsvp WHERE id = ?`, id));
    const ts = now();
    await db.runAsync(
      `INSERT INTO practice_rsvp (id, session_id, person_id, status, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, reason = excluded.reason, updated_at = excluded.updated_at`,
      id,
      sessionId,
      personId,
      status,
      status === 'going' ? null : reason,
      ts,
      ts,
    );
  });
}

export type PracticeAttendee = {
  personId: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  gender: Gender | null;
  photo_uri: string | null;
  status: RsvpStatus | null;
  reason: string | null;
};

/** A practice with everyone on the squad and their answer (null = hasn't said). */
export async function practiceDetail(db: SQLiteDatabase, id: string) {
  const session = await db.getFirstAsync<SessionRow & { team_name: string; team_color: string | null; venue_name: string | null }>(
    `SELECT s.*, t.name AS team_name, t.primary_color AS team_color, v.name AS venue_name
       FROM session s LEFT JOIN team t ON t.id = s.team_id LEFT JOIN venue v ON v.id = s.venue_id
      WHERE s.id = ? AND s.deleted_at IS NULL`,
    id,
  );
  if (!session) return null;
  const people = await db.getAllAsync<PracticeAttendee>(
    `SELECT p.id AS personId, p.first_name, p.last_name, p.birth_date, p.gender, p.photo_uri, r.status, r.reason
       FROM person p
       LEFT JOIN practice_rsvp r ON r.person_id = p.id AND r.session_id = ?
      WHERE p.deleted_at IS NULL AND (
            p.id IN (SELECT person_id FROM membership WHERE team_id = ? AND end_date IS NULL AND deleted_at IS NULL)
         OR r.id IS NOT NULL)
      ORDER BY p.first_name COLLATE NOCASE, p.last_name COLLATE NOCASE`,
    id,
    session.team_id,
  );
  return { session, people };
}

/** Upcoming (not yet finished) practices for a team, with answer counts. */
export function upcomingPractices(db: SQLiteDatabase, teamId: string, meId: string | null, from = new Date()) {
  return db.getAllAsync<SessionRow & { going: number; late: number; not_going: number; going_f: number; going_m: number; venue_name: string | null; my_status: RsvpStatus | null }>(
    `SELECT s.*, v.name AS venue_name,
            (SELECT status FROM practice_rsvp r WHERE r.session_id = s.id AND r.person_id = ?) AS my_status,
            (SELECT COUNT(*) FROM practice_rsvp r WHERE r.session_id = s.id AND r.status IN ('going','late')) AS going,
            (SELECT COUNT(*) FROM practice_rsvp r WHERE r.session_id = s.id AND r.status = 'late') AS late,
            (SELECT COUNT(*) FROM practice_rsvp r WHERE r.session_id = s.id AND r.status = 'not_going') AS not_going,
            (SELECT COUNT(*) FROM practice_rsvp r JOIN person p ON p.id = r.person_id WHERE r.session_id = s.id AND r.status IN ('going','late') AND p.gender = 'W') AS going_f,
            (SELECT COUNT(*) FROM practice_rsvp r JOIN person p ON p.id = r.person_id WHERE r.session_id = s.id AND r.status IN ('going','late') AND p.gender = 'M') AS going_m
       FROM session s LEFT JOIN venue v ON v.id = s.venue_id
      WHERE s.team_id = ? AND s.kind = 'practice' AND s.deleted_at IS NULL
        AND datetime(s.started_at, '+' || s.duration_min || ' minutes') >= datetime(?)
      ORDER BY s.started_at`,
    meId,
    teamId,
    from.toISOString(),
  );
}

export function myRsvp(db: SQLiteDatabase, sessionId: string, personId: string) {
  return db.getFirstAsync<{ status: RsvpStatus; reason: string | null }>(`SELECT status, reason FROM practice_rsvp WHERE session_id = ? AND person_id = ?`, sessionId, personId);
}

/* ---------------- Reflections & shout-outs ---------------- */

export type ReflectionInput = {
  personId: string;
  teamId: string | null;
  gameId: string | null;
  sessionId: string | null;
  kind: ReflectionKind;
  minutes: number | null;
  rpe: number | null;
  selfRating: number | null;
  playingTime: PlayingTime | null;
  niggleArea: string | null;
  niggleSeverity: NiggleSeverity | null;
  answers: Answers;
};

export function getMyReflection(db: SQLiteDatabase, personId: string, target: { gameId?: string; sessionId?: string }) {
  return target.gameId
    ? db.getFirstAsync<ReflectionRow>(`SELECT * FROM reflection WHERE person_id = ? AND game_id = ?`, personId, target.gameId)
    : db.getFirstAsync<ReflectionRow>(`SELECT * FROM reflection WHERE person_id = ? AND session_id = ?`, personId, target.sessionId!);
}

export function saveReflection(db: SQLiteDatabase, r: ReflectionInput) {
  return write(db, async () => {
    const existing = r.gameId
      ? await db.getFirstAsync<{ id: string }>(`SELECT id FROM reflection WHERE person_id = ? AND game_id = ?`, r.personId, r.gameId)
      : await db.getFirstAsync<{ id: string }>(`SELECT id FROM reflection WHERE person_id = ? AND session_id = ?`, r.personId, r.sessionId);
    const ts = now();
    const values = [r.teamId, r.minutes, r.rpe, r.selfRating, r.playingTime, r.niggleArea, r.niggleSeverity, JSON.stringify(r.answers)];
    if (existing) {
      await db.runAsync(
        `UPDATE reflection SET team_id = ?, minutes = ?, rpe = ?, self_rating = ?, playing_time = ?, niggle_area = ?,
           niggle_severity = ?, answers_json = ?, updated_at = ? WHERE id = ?`,
        ...values,
        ts,
        existing.id,
      );
      return existing.id;
    }
    const id = uuid();
    await db.runAsync(
      `INSERT INTO reflection (id, person_id, game_id, session_id, kind, team_id, minutes, rpe, self_rating, playing_time,
         niggle_area, niggle_severity, answers_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      r.personId,
      r.gameId,
      r.sessionId,
      r.kind,
      ...values,
      ts,
      ts,
    );
    return id;
  });
}

/** Reflections for a game or session, optionally only one team's (what that team's staff may read). */
export function reflectionsFor(db: SQLiteDatabase, target: { gameId?: string; sessionId?: string }, teamId?: string) {
  const col = target.gameId ? 'game_id' : 'session_id';
  const id = target.gameId ?? target.sessionId!;
  return teamId
    ? db.getAllAsync<ReflectionRow>(`SELECT * FROM reflection WHERE ${col} = ? AND team_id = ? ORDER BY created_at`, id, teamId)
    : db.getAllAsync<ReflectionRow>(`SELECT * FROM reflection WHERE ${col} = ? ORDER BY created_at`, id);
}

export function saveShoutout(db: SQLiteDatabase, s: { fromId: string; toId: string; teamId: string | null; gameId: string | null; sessionId: string | null; reason: string | null }) {
  return write(db, async () => {
    // One shout-out per person per game/session: replace any earlier one.
    await db.runAsync(`DELETE FROM shoutout WHERE from_person_id = ? AND COALESCE(game_id, '') = COALESCE(?, '') AND COALESCE(session_id, '') = COALESCE(?, '')`, s.fromId, s.gameId, s.sessionId);
    await db.runAsync(
      `INSERT INTO shoutout (id, from_person_id, to_person_id, team_id, game_id, session_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      uuid(),
      s.fromId,
      s.toId,
      s.teamId,
      s.gameId,
      s.sessionId,
      s.reason,
      now(),
    );
  });
}

export type ShoutoutRow = { id: string; from_person_id: string; to_person_id: string; reason: string | null; created_at: string; game_id: string | null; session_id: string | null };

export function shoutoutsForTeam(db: SQLiteDatabase, teamId: string, limit = 10) {
  return db.getAllAsync<ShoutoutRow>(`SELECT * FROM shoutout WHERE team_id = ? ORDER BY created_at DESC LIMIT ?`, teamId, limit);
}

/** Shout-outs you got and gave, newest first, with names and what they were for. */
export function shoutoutsForPerson(db: SQLiteDatabase, personId: string) {
  return db.getAllAsync<ShoutoutRow & { from_first: string | null; from_last: string | null; to_first: string | null; to_last: string | null; team: string | null; what: string | null }>(
    `SELECT s.*, pf.first_name AS from_first, pf.last_name AS from_last, pt.first_name AS to_first, pt.last_name AS to_last, t.name AS team,
            COALESCE((SELECT ta.name || ' v ' || tb.name FROM game g JOIN team ta ON ta.id = g.team_a_id JOIN team tb ON tb.id = g.team_b_id WHERE g.id = s.game_id),
                     (SELECT COALESCE(se.title, CASE se.kind WHEN 'pickup' THEN 'Pickup' ELSE 'Practice' END) FROM session se WHERE se.id = s.session_id)) AS what
       FROM shoutout s
       LEFT JOIN person pf ON pf.id = s.from_person_id
       LEFT JOIN person pt ON pt.id = s.to_person_id
       LEFT JOIN team t ON t.id = s.team_id
      WHERE s.from_person_id = ? OR s.to_person_id = ?
      ORDER BY s.created_at DESC`,
    personId,
    personId,
  );
}

export function myShoutout(db: SQLiteDatabase, fromId: string, target: { gameId?: string; sessionId?: string }) {
  return db.getFirstAsync<ShoutoutRow>(
    `SELECT * FROM shoutout WHERE from_person_id = ? AND COALESCE(game_id, '') = ? AND COALESCE(session_id, '') = ?`,
    fromId,
    target.gameId ?? '',
    target.sessionId ?? '',
  );
}

/* ---------------- Personal log ---------------- */

export type LogEntry = {
  key: string;
  kind: 'game' | 'practice' | 'pickup' | 'gym' | 'physio' | 'other';
  date: string;
  title: string;
  minutes: number;
  rpe: number | null;
  gameId: string | null;
  sessionId: string | null;
  reflected: boolean;
};

/**
 * Everything someone has played: finished games they were on the line for (minutes = the points they
 * played), plus practices and pickups they logged.
 */
export async function personLog(db: SQLiteDatabase, personId: string): Promise<LogEntry[]> {
  const games = await db.getAllAsync<{ id: string; date: string; a: string; b: string; seconds: number | null; rpe: number | null; reflected: number }>(
    `SELECT g.id, COALESCE(g.started_at, g.scheduled_at, g.created_at) AS date, ta.name AS a, tb.name AS b,
            (SELECT SUM((julianday(p.scored_at) - julianday(p.pulled_at)) * 86400)
               FROM point p JOIN point_player pp ON pp.point_id = p.id
              WHERE p.game_id = g.id AND pp.person_id = gp.person_id AND p.pulled_at IS NOT NULL AND p.scored_at IS NOT NULL) AS seconds,
            r.rpe, r.id IS NOT NULL AS reflected
       FROM game_player gp
       JOIN game g ON g.id = gp.game_id
       JOIN team ta ON ta.id = g.team_a_id
       JOIN team tb ON tb.id = g.team_b_id
       LEFT JOIN reflection r ON r.game_id = g.id AND r.person_id = gp.person_id
      WHERE gp.person_id = ? AND g.status = 'final' AND g.deleted_at IS NULL AND g.forfeit_team_id IS NULL
        AND gp.confirmation != 'removed'`,
    personId,
  );
  const sessions = await db.getAllAsync<{
    id: string;
    kind: LogEntry['kind'];
    date: string;
    title: string | null;
    team: string | null;
    minutes: number | null;
    duration_min: number;
    rpe: number | null;
  }>(
    `SELECT s.id, s.kind, s.started_at AS date, s.title, t.name AS team, r.minutes, s.duration_min, r.rpe
       FROM reflection r JOIN session s ON s.id = r.session_id LEFT JOIN team t ON t.id = s.team_id
      WHERE r.person_id = ? AND s.deleted_at IS NULL`,
    personId,
  );
  return [
    ...games
      .filter((g) => (g.seconds ?? 0) > 0)
      .map((g) => ({
        key: `g-${g.id}`,
        kind: 'game' as const,
        date: g.date,
        title: `${g.a} v ${g.b}`,
        minutes: Math.round((g.seconds ?? 0) / 60),
        rpe: g.rpe,
        gameId: g.id,
        sessionId: null,
        reflected: !!g.reflected,
      })),
    ...sessions.map((s) => ({
      key: `s-${s.id}`,
      kind: s.kind,
      date: s.date,
      title: s.title || (s.kind === 'practice' ? `${s.team ?? 'Team'} practice` : s.kind === 'pickup' ? 'Pickup' : s.kind === 'gym' ? 'Gym' : s.kind === 'physio' ? 'Physio' : 'Session'),
      minutes: s.minutes ?? s.duration_min,
      rpe: s.rpe,
      gameId: null,
      sessionId: s.id,
      reflected: true,
    })),
  ].sort((x, y) => y.date.localeCompare(x.date));
}

/** Effort × minutes per person from sessions and games they reflected on in the last `hours`. */
export async function recentLoad(db: SQLiteDatabase, personIds: string[], hours = 36) {
  if (!personIds.length) return new Map<string, number>();
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const rows = await db.getAllAsync<{ person_id: string; load: number }>(
    `SELECT r.person_id, SUM(r.rpe * COALESCE(r.minutes, s.duration_min, 0)) AS load
       FROM reflection r
       LEFT JOIN session s ON s.id = r.session_id
       LEFT JOIN game g ON g.id = r.game_id
      WHERE r.person_id IN (${personIds.map(() => '?').join(',')}) AND r.rpe IS NOT NULL
        AND COALESCE(s.started_at, g.started_at, r.created_at) >= ?
      GROUP BY r.person_id`,
    ...personIds,
    since,
  );
  return new Map(rows.map((r) => [r.person_id, r.load ?? 0]));
}
