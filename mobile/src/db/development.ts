import type { SQLiteDatabase } from 'expo-sqlite';

import type { AccreditationLevel, FitnessKind, RatingArea } from '@/domain/development';
import { normNumber } from '@/domain/standing';

import { now, uuid, write } from './repo';
import type { Gender } from './types';

/* ---------------- Accreditation ---------------- */

export type CheckStatus = 'unverified' | 'verified' | 'rejected';
export type Accreditation = {
  id: string;
  person_id: string;
  level: AccreditationLevel;
  expires_on: string | null;
  /** The certificate PDF on this phone (or a data: URL on the web) until it's uploaded. */
  photo_uri: string | null;
  /** Where the PDF is in storage, once uploaded: what team staff open to check it. */
  file_path: string | null;
  status: CheckStatus;
  checked_by: string | null;
  checked_at: string | null;
  check_note: string | null;
};

export function getAccreditation(db: SQLiteDatabase, personId: string) {
  return db.getFirstAsync<Accreditation>(`SELECT * FROM accreditation WHERE person_id = ?`, personId);
}

/** Changing the level, expiry or certificate sends it back to "not checked" (the server does the same). */
export function saveAccreditation(db: SQLiteDatabase, personId: string, a: { level: AccreditationLevel; expiresOn: string | null; photoUri: string | null; filePath: string | null }) {
  return write(db, async () => {
    const ts = now();
    await db.runAsync(
      `INSERT INTO accreditation (id, person_id, level, expires_on, photo_uri, file_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'unverified', ?, ?)
       ON CONFLICT(person_id) DO UPDATE SET
         status = CASE WHEN level IS excluded.level AND expires_on IS excluded.expires_on AND file_path IS excluded.file_path THEN status ELSE 'unverified' END,
         checked_by = CASE WHEN level IS excluded.level AND expires_on IS excluded.expires_on AND file_path IS excluded.file_path THEN checked_by END,
         checked_at = CASE WHEN level IS excluded.level AND expires_on IS excluded.expires_on AND file_path IS excluded.file_path THEN checked_at END,
         check_note = CASE WHEN level IS excluded.level AND expires_on IS excluded.expires_on AND file_path IS excluded.file_path THEN check_note END,
         level = excluded.level, expires_on = excluded.expires_on, photo_uri = excluded.photo_uri, file_path = excluded.file_path, updated_at = excluded.updated_at`,
      personId,
      personId,
      a.level,
      a.expiresOn,
      a.photoUri,
      a.filePath,
      ts,
      ts,
    );
  });
}

/* ---------------- Self-rating ---------------- */

export type SelfRating = { id: string; person_id: string; rated_on: string; notes: string | null } & Record<RatingArea, number>;

export function selfRatings(db: SQLiteDatabase, personId: string) {
  return db.getAllAsync<SelfRating>(`SELECT * FROM self_rating WHERE person_id = ? ORDER BY rated_on DESC`, personId);
}

export function addSelfRating(db: SQLiteDatabase, personId: string, r: Record<RatingArea, number> & { notes: string | null }) {
  return write(db, async () => {
    const ts = now();
    await db.runAsync(
      `INSERT INTO self_rating (id, person_id, rated_on, experience, throwing, receiving, defence, athleticism, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      uuid(),
      personId,
      ts.slice(0, 10),
      r.experience,
      r.throwing,
      r.receiving,
      r.defence,
      r.athleticism,
      r.notes,
      ts,
      ts,
    );
  });
}

/* ---------------- Fitness tests ---------------- */

export type FitnessResult = { id: string; person_id: string; kind: FitnessKind; value: number; tested_on: string; notes: string | null; recorded_by_id: string | null };

export function fitnessResults(db: SQLiteDatabase, personId: string) {
  return db.getAllAsync<FitnessResult>(`SELECT * FROM fitness_test WHERE person_id = ? ORDER BY tested_on DESC, created_at DESC`, personId);
}

export function addFitnessResults(db: SQLiteDatabase, rows: { personId: string; kind: FitnessKind; value: number; testedOn: string; notes?: string | null; recordedById: string | null }[]) {
  return write(db, async () => {
    const ts = now();
    for (const r of rows) {
      await db.runAsync(
        `INSERT INTO fitness_test (id, person_id, kind, value, tested_on, notes, recorded_by_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        uuid(),
        r.personId,
        r.kind,
        r.value,
        r.testedOn,
        r.notes ?? null,
        r.recordedById,
        ts,
        ts,
      );
    }
  });
}

export function deleteFitnessResult(db: SQLiteDatabase, id: string) {
  return write(db, () => db.runAsync(`DELETE FROM fitness_test WHERE id = ?`, id));
}

/** Staff view: everyone on the squad with accreditation, latest self-rating and test results. */
export async function squadDevelopment(db: SQLiteDatabase, teamId: string) {
  const people = await db.getAllAsync<{
    id: string;
    first_name: string;
    last_name: string;
    birth_date: string | null;
    gender: Gender | null;
    photo_uri: string | null;
    level: AccreditationLevel | null;
    expires_on: string | null;
    acc_status: CheckStatus | null;
    acc_file: string | null;
    acc_note: string | null;
    role: string | null;
  }>(
    `SELECT p.id, p.first_name, p.last_name, p.birth_date, p.gender, p.photo_uri, a.level, a.expires_on, a.status AS acc_status, a.file_path AS acc_file, a.check_note AS acc_note, MAX(m.role) AS role
       FROM membership m JOIN person p ON p.id = m.person_id LEFT JOIN accreditation a ON a.person_id = p.id
      WHERE m.team_id = ? AND m.end_date IS NULL AND m.deleted_at IS NULL AND p.deleted_at IS NULL
      GROUP BY p.id ORDER BY p.first_name COLLATE NOCASE`,
    teamId,
  );
  const ids = people.map((p) => p.id);
  const q = ids.map(() => '?').join(',') || "''";
  const ratings = await db.getAllAsync<SelfRating>(`SELECT * FROM self_rating WHERE person_id IN (${q}) ORDER BY rated_on DESC`, ...ids);
  const tests = await db.getAllAsync<FitnessResult>(`SELECT * FROM fitness_test WHERE person_id IN (${q}) ORDER BY tested_on DESC`, ...ids);
  return people.map((p) => ({
    ...p,
    rating: ratings.find((r) => r.person_id === p.id) ?? null,
    tests: tests.filter((t) => t.person_id === p.id),
  }));
}

/* ---------------- Game availability ---------------- */

export type AvailabilityStatus = 'available' | 'late' | 'unavailable';

export function setAvailability(db: SQLiteDatabase, gameId: string, teamId: string, personId: string, status: AvailabilityStatus | null, reason: string | null = null) {
  return write(db, async () => {
    const id = `${gameId}:${personId}`;
    if (!status) return void (await db.runAsync(`DELETE FROM game_availability WHERE id = ?`, id));
    const ts = now();
    await db.runAsync(
      `INSERT INTO game_availability (id, game_id, person_id, team_id, status, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, reason = excluded.reason, updated_at = excluded.updated_at`,
      id,
      gameId,
      personId,
      teamId,
      status,
      status === 'available' ? null : reason,
      ts,
      ts,
    );
  });
}

/** The squad of `teamId` with their answer for a game (null = not answered). */
export function gameAvailability(db: SQLiteDatabase, gameId: string, teamId: string) {
  return db.getAllAsync<{
    personId: string;
    first_name: string;
    last_name: string;
    birth_date: string | null;
    gender: Gender | null;
    photo_uri: string | null;
    status: AvailabilityStatus | null;
    reason: string | null;
  }>(
    `SELECT p.id AS personId, p.first_name, p.last_name, p.birth_date, p.gender, p.photo_uri, a.status, a.reason
       FROM membership m JOIN person p ON p.id = m.person_id
       LEFT JOIN game_availability a ON a.game_id = ? AND a.person_id = p.id
      WHERE m.team_id = ? AND m.end_date IS NULL AND m.deleted_at IS NULL AND p.deleted_at IS NULL
      GROUP BY p.id ORDER BY p.first_name COLLATE NOCASE`,
    gameId,
    teamId,
  );
}

/* ---------------- Practice register & attendance ranking ---------------- */

export function setAttendance(db: SQLiteDatabase, sessionId: string, marks: { personId: string; attended: boolean }[]) {
  return write(db, async () => {
    const ts = now();
    for (const m of marks) {
      await db.runAsync(
        `INSERT INTO practice_attendance (id, session_id, person_id, attended, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET attended = excluded.attended, updated_at = excluded.updated_at`,
        `${sessionId}:${m.personId}`,
        sessionId,
        m.personId,
        m.attended ? 1 : 0,
        ts,
        ts,
      );
    }
  });
}

export function attendanceFor(db: SQLiteDatabase, sessionId: string) {
  return db.getAllAsync<{ person_id: string; attended: number }>(`SELECT person_id, attended FROM practice_attendance WHERE session_id = ?`, sessionId);
}

export type AttendanceRow = {
  personId: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  gender: Gender | null;
  photo_uri: string | null;
  practices: number;
  attended: number;
  noShows: number;
  gamesAvailable: number;
  gamesPlayed: number;
  games: number;
};

/**
 * Who turns up, for selection. A practice counts if it wasn't cancelled and has started. Where staff
 * took a register it decides; otherwise saying "going" counts as attending (and is flagged as such).
 */
export async function attendanceRanking(db: SQLiteDatabase, teamId: string, since: string, until = new Date().toISOString()) {
  const squad = await db.getAllAsync<Omit<AttendanceRow, 'practices' | 'attended' | 'noShows' | 'gamesAvailable' | 'gamesPlayed' | 'games'>>(
    `SELECT p.id AS personId, p.first_name, p.last_name, p.birth_date, p.gender, p.photo_uri
       FROM membership m JOIN person p ON p.id = m.person_id
      WHERE m.team_id = ? AND m.end_date IS NULL AND m.deleted_at IS NULL AND p.deleted_at IS NULL
      GROUP BY p.id`,
    teamId,
  );
  const practices = await db.getAllAsync<{ id: string; register: number }>(
    `SELECT s.id, EXISTS (SELECT 1 FROM practice_attendance a WHERE a.session_id = s.id) AS register
       FROM session s WHERE s.team_id = ? AND s.kind = 'practice' AND s.deleted_at IS NULL AND s.cancelled_at IS NULL
        AND s.started_at >= ? AND s.started_at <= ?`,
    teamId,
    since,
    until,
  );
  const pq = practices.map((p) => '?').join(',') || "''";
  const pids = practices.map((p) => p.id);
  const marks = await db.getAllAsync<{ session_id: string; person_id: string; attended: number }>(
    `SELECT session_id, person_id, attended FROM practice_attendance WHERE session_id IN (${pq})`,
    ...pids,
  );
  const rsvps = await db.getAllAsync<{ session_id: string; person_id: string; status: string }>(`SELECT session_id, person_id, status FROM practice_rsvp WHERE session_id IN (${pq})`, ...pids);
  const games = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM game WHERE deleted_at IS NULL AND status = 'final' AND forfeit_team_id IS NULL AND (team_a_id = ? OR team_b_id = ?)
       AND COALESCE(started_at, scheduled_at) >= ? AND COALESCE(started_at, scheduled_at) <= ?`,
    teamId,
    teamId,
    since,
    until,
  );
  const gq = games.map(() => '?').join(',') || "''";
  const gids = games.map((g) => g.id);
  const played = await db.getAllAsync<{ person_id: string; n: number }>(
    `SELECT person_id, COUNT(*) AS n FROM game_player WHERE team_id = ? AND confirmation != 'removed' AND game_id IN (${gq}) GROUP BY person_id`,
    teamId,
    ...gids,
  );
  const avail = await db.getAllAsync<{ person_id: string; n: number }>(
    `SELECT person_id, COUNT(*) AS n FROM game_availability WHERE team_id = ? AND status IN ('available','late') AND game_id IN (${gq}) GROUP BY person_id`,
    teamId,
    ...gids,
  );
  const rows: AttendanceRow[] = squad.map((p) => {
    let attended = 0;
    let noShows = 0;
    for (const pr of practices) {
      const said = rsvps.find((r) => r.session_id === pr.id && r.person_id === p.personId)?.status;
      const mark = marks.find((m) => m.session_id === pr.id && m.person_id === p.personId);
      const saidYes = said === 'going' || said === 'late';
      const was = pr.register ? !!mark?.attended : saidYes;
      if (was) attended += 1;
      if (pr.register && saidYes && !mark?.attended) noShows += 1;
    }
    return {
      ...p,
      practices: practices.length,
      attended,
      noShows,
      gamesPlayed: played.find((x) => x.person_id === p.personId)?.n ?? 0,
      gamesAvailable: avail.find((x) => x.person_id === p.personId)?.n ?? 0,
      games: games.length,
    };
  });
  rows.sort((a, b) => b.attended - a.attended || a.noShows - b.noShows || b.gamesPlayed - a.gamesPlayed || a.first_name.localeCompare(b.first_name));
  return { rows, practices: practices.length, withRegister: practices.filter((p) => p.register).length, games: games.length };
}

/* ---------------- Feedback ---------------- */

export type FeedbackKind = 'bug' | 'feature' | 'enhancement' | 'other';
export type FeedbackRow = {
  id: string;
  kind: FeedbackKind;
  title: string;
  body: string | null;
  screen: string | null;
  app_version: string | null;
  device: string | null;
  contact_ok: number;
  person_id: string | null;
  created_at: string;
  sent_at: string | null;
  images_json?: string | null;
};

export function saveFeedback(db: SQLiteDatabase, f: Omit<FeedbackRow, 'id' | 'created_at' | 'sent_at'>) {
  return write(db, async () => {
    const id = uuid();
    await db.runAsync(
      `INSERT INTO feedback (id, kind, title, body, screen, app_version, device, contact_ok, person_id, images_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      f.kind,
      f.title,
      f.body,
      f.screen,
      f.app_version,
      f.device,
      f.contact_ok,
      f.person_id,
      f.images_json ?? null,
      now(),
    );
    return id;
  });
}

export function myFeedback(db: SQLiteDatabase) {
  return db.getAllAsync<FeedbackRow>(`SELECT * FROM feedback ORDER BY created_at DESC`);
}

export function unsentFeedback(db: SQLiteDatabase) {
  return db.getAllAsync<FeedbackRow>(`SELECT * FROM feedback WHERE sent_at IS NULL ORDER BY created_at`);
}

export function markFeedbackSent(db: SQLiteDatabase, id: string) {
  return write(db, () => db.runAsync(`UPDATE feedback SET sent_at = ? WHERE id = ?`, now(), id));
}

/* ---------------- Registration numbers, good standing, form links ---------------- */

export type Registration = {
  id: string;
  person_id: string;
  safda_number: string | null;
  region_code: string | null;
  region_number: string | null;
  phone: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
};

export function getRegistration(db: SQLiteDatabase, personId: string) {
  return db.getFirstAsync<Registration>(`SELECT * FROM registration WHERE person_id = ?`, personId);
}

export function saveRegistration(db: SQLiteDatabase, personId: string, r: Omit<Registration, 'id' | 'person_id'>) {
  return write(db, async () => {
    const ts = now();
    await db.runAsync(
      `INSERT INTO registration (id, person_id, safda_number, region_code, region_number, phone, emergency_name, emergency_phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(person_id) DO UPDATE SET safda_number = excluded.safda_number, region_code = excluded.region_code,
         region_number = excluded.region_number, phone = excluded.phone, emergency_name = excluded.emergency_name, emergency_phone = excluded.emergency_phone, updated_at = excluded.updated_at`,
      personId,
      personId,
      r.safda_number,
      r.region_code,
      r.region_number,
      r.phone,
      r.emergency_name,
      r.emergency_phone,
      ts,
      ts,
    );
  });
}

export type StandingRecord = { association: string; number: string; status: 'good' | 'unpaid' | 'lapsed'; paid_until: string | null; uploaded_at: string };

export async function standingFor(db: SQLiteDatabase, association: string, number: string | null | undefined) {
  if (!number) return null;
  return db.getFirstAsync<StandingRecord>(`SELECT * FROM association_standing WHERE id = ?`, `${association}:${normNumber(number)}`);
}

/** Which association lists exist on this phone, and when each was last uploaded. */
export async function standingLists(db: SQLiteDatabase) {
  return db.getAllAsync<{ association: string; n: number; uploaded_at: string }>(`SELECT association, COUNT(*) AS n, MAX(uploaded_at) AS uploaded_at FROM association_standing GROUP BY association`);
}

/** Staff: who's ready to play: accreditation, SAFDA and region standing, plus a phone to follow up. */
export async function readiness(db: SQLiteDatabase, teamId: string) {
  const squad = await squadDevelopment(db, teamId);
  const ids = squad.map((p) => p.id);
  const q = ids.map(() => '?').join(',') || "''";
  const regs = await db.getAllAsync<Registration>(`SELECT * FROM registration WHERE person_id IN (${q})`, ...ids);
  const lists = new Set((await standingLists(db)).map((l) => l.association));
  const rows = [];
  for (const p of squad) {
    const reg = regs.find((r) => r.person_id === p.id) ?? null;
    const safda = await standingFor(db, 'safda', reg?.safda_number);
    const region = reg?.region_code ? await standingFor(db, reg.region_code, reg.region_number) : null;
    rows.push({ ...p, reg, safda, region, safdaListed: lists.has('safda'), regionListed: !!reg?.region_code && lists.has(reg.region_code) });
  }
  return rows;
}

export type OrgLink = { id: string; region_code: string | null; kind: string | null; label: string; url: string; sort: number };

export function orgLinks(db: SQLiteDatabase) {
  return db.getAllAsync<OrgLink>(`SELECT * FROM org_link WHERE deleted_at IS NULL ORDER BY region_code IS NOT NULL, region_code, sort, label`);
}

export function saveOrgLink(db: SQLiteDatabase, l: { id?: string; region_code: string | null; kind: string | null; label: string; url: string }) {
  return write(db, async () => {
    const ts = now();
    if (l.id) {
      await db.runAsync(`UPDATE org_link SET region_code = ?, kind = ?, label = ?, url = ?, updated_at = ? WHERE id = ?`, l.region_code, l.kind, l.label, l.url, ts, l.id);
    } else {
      await db.runAsync(
        `INSERT INTO org_link (id, region_code, kind, label, url, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1000, ?, ?)`,
        uuid(),
        l.region_code,
        l.kind,
        l.label,
        l.url,
        ts,
        ts,
      );
    }
  });
}

export function deleteOrgLink(db: SQLiteDatabase, id: string) {
  return write(db, () => db.runAsync(`UPDATE org_link SET deleted_at = ?, updated_at = ? WHERE id = ?`, now(), now(), id));
}
