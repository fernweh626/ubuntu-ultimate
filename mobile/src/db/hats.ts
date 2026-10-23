import type { SQLiteDatabase } from 'expo-sqlite';

import { roundRobin } from '@/domain/fixtures';
import { bestTeamIndex, hatSlots, SKILL_FRESH_DAYS, type HatPlayer, type HatTeam } from '@/domain/hat';
import type { Rules } from '@/domain/rules';

import { createFixtures, now, uuid, write } from './repo';
import type { Gender } from './types';

/*
 * Hat tournaments are events (is_hat = 1). Players sign up themselves (hat_signup); the organiser
 * draws teams, which become ordinary teams (kind 'hat') with event-scoped memberships, plus a round
 * robin of short games. Original sign-ups are never reshuffled once teams are drawn.
 */

export type Hat = {
  id: string;
  name: string;
  region: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  venue_id: string | null;
  venue_name?: string | null;
  cost: string | null;
  payment_url: string | null;
  eft_details?: string | null;
  pop_contact?: string | null;
  map_url?: string | null;
  website?: string | null;
  details: string | null;
  rules_json: string | null;
  hat_status: 'signups' | 'drawn' | 'done' | null;
  team_count: number | null;
};

export type HatInput = {
  id?: string;
  name: string;
  region: string | null;
  location: string | null;
  startDate: string;
  endDate: string | null;
  startTime: string;
  venueId: string | null;
  cost: string | null;
  paymentUrl: string | null;
  eftDetails: string | null;
  popContact: string | null;
  mapUrl?: string | null;
  website?: string | null;
  details: string | null;
  perSide: number;
  gameMinutes: number;
  pointTarget: number;
  teamCount: number | null;
};

export function hatRules(i: Pick<HatInput, 'perSide' | 'gameMinutes' | 'pointTarget'>): Rules {
  return {
    pointTarget: i.pointTarget,
    halftimeTarget: Math.ceil(i.pointTarget / 2),
    softCapMinutes: null,
    hardCapMinutes: i.gameMinutes,
    timeoutsPerTeam: 0,
    timeoutSeconds: 60,
    pullWithinSeconds: 60,
    mixedRatio: i.perSide % 2 === 1,
    halftimeMinutes: 2,
    playersPerSide: i.perSide,
  };
}

/** Local start of the hat as ISO (date + HH:MM). */
export function hatStart(h: Pick<Hat, 'start_date' | 'start_time'>) {
  if (!h.start_date) return null;
  const [hh, mm] = (h.start_time ?? '09:00').split(':').map(Number);
  const d = new Date(`${h.start_date}T00:00:00`);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

export function saveHat(db: SQLiteDatabase, i: HatInput) {
  return write(db, async () => {
    const id = i.id ?? uuid();
    const ts = now();
    await db.runAsync(
      `INSERT INTO event (id, name, kind, level, division, region, location, start_date, end_date, rules_json, is_hat, cost, payment_url, details,
         start_time, venue_id, hat_status, team_count, eft_details, pop_contact, map_url, website, created_at, updated_at)
       VALUES (?, ?, 'tournament', 'social', 'mixed', ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'signups', ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, region = excluded.region, location = excluded.location, start_date = excluded.start_date,
         end_date = excluded.end_date, rules_json = excluded.rules_json, cost = excluded.cost, payment_url = excluded.payment_url, details = excluded.details,
         eft_details = excluded.eft_details, pop_contact = excluded.pop_contact, map_url = excluded.map_url, website = excluded.website,
         start_time = excluded.start_time, venue_id = excluded.venue_id, team_count = excluded.team_count, updated_at = excluded.updated_at`,
      id,
      i.name.trim(),
      i.region,
      i.location,
      i.startDate,
      i.endDate ?? i.startDate,
      JSON.stringify(hatRules(i)),
      i.cost,
      i.paymentUrl,
      i.details,
      i.startTime,
      i.venueId,
      i.teamCount,
      i.eftDetails,
      i.popContact,
      i.mapUrl ?? null,
      i.website ?? null,
      ts,
      ts,
    );
    return id;
  });
}

export function listHats(db: SQLiteDatabase) {
  return db.getAllAsync<Hat & { signups: number }>(
    `SELECT e.*, v.name AS venue_name, (SELECT COUNT(*) FROM hat_signup s WHERE s.event_id = e.id AND s.attending = 'yes') AS signups
       FROM event e LEFT JOIN venue v ON v.id = e.venue_id
      WHERE e.is_hat = 1 AND e.deleted_at IS NULL ORDER BY e.start_date DESC`,
  );
}

export function getHat(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<Hat>(`SELECT e.*, v.name AS venue_name FROM event e LEFT JOIN venue v ON v.id = e.venue_id WHERE e.id = ? AND e.is_hat = 1`, id);
}

/* ---------------- Sign-ups ---------------- */

export type Signup = {
  id: string;
  event_id: string;
  person_id: string;
  attending: 'yes' | 'maybe' | 'no';
  wants_captain: number;
  skill: number | null;
  paid: number;
  paid_confirmed: number;
  on_the_day: number;
  note: string | null;
};

export function mySignup(db: SQLiteDatabase, eventId: string, personId: string) {
  return db.getFirstAsync<Signup>(`SELECT * FROM hat_signup WHERE event_id = ? AND person_id = ?`, eventId, personId);
}

export function saveSignup(db: SQLiteDatabase, eventId: string, personId: string, s: { attending: Signup['attending']; wantsCaptain: boolean; skill: number | null; paid: boolean; note?: string | null; onTheDay?: boolean }) {
  return write(db, async () => {
    const ts = now();
    await db.runAsync(
      `INSERT INTO hat_signup (id, event_id, person_id, attending, wants_captain, skill, paid, on_the_day, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET attending = excluded.attending, wants_captain = excluded.wants_captain, skill = COALESCE(excluded.skill, hat_signup.skill),
         paid = excluded.paid, note = excluded.note, updated_at = excluded.updated_at`,
      `${eventId}:${personId}`,
      eventId,
      personId,
      s.attending,
      s.wantsCaptain ? 1 : 0,
      s.skill,
      s.paid ? 1 : 0,
      s.onTheDay ? 1 : 0,
      s.note ?? null,
      ts,
      ts,
    );
  });
}

/** Organiser marks a payment as received (players can only say they've paid). */
export function confirmPaid(db: SQLiteDatabase, signupId: string, confirmed: boolean) {
  return write(db, () => db.runAsync(`UPDATE hat_signup SET paid_confirmed = ?, paid = CASE WHEN ? THEN 1 ELSE paid END, updated_at = ? WHERE id = ?`, confirmed ? 1 : 0, confirmed ? 1 : 0, now(), signupId));
}

export type SignupRow = Signup & { first_name: string; last_name: string; birth_date: string | null; gender: Gender | null; rating: number | null; rated_on: string | null };

/** Everyone who signed up, with their latest self-rating (average of the five areas). */
export function hatSignups(db: SQLiteDatabase, eventId: string) {
  return db.getAllAsync<SignupRow>(
    `SELECT s.*, p.first_name, p.last_name, p.birth_date, p.gender,
            (SELECT (r.experience + r.throwing + r.receiving + r.defence + r.athleticism) / 5.0 FROM self_rating r WHERE r.person_id = s.person_id ORDER BY r.rated_on DESC LIMIT 1) AS rating,
            (SELECT r.rated_on FROM self_rating r WHERE r.person_id = s.person_id ORDER BY r.rated_on DESC LIMIT 1) AS rated_on
       FROM hat_signup s JOIN person p ON p.id = s.person_id
      WHERE s.event_id = ?
      ORDER BY s.on_the_day, p.first_name COLLATE NOCASE`,
    eventId,
  );
}

/** Skill for the draw: a self-rating from the last six months, else the quick one from sign-up, else 3. */
export function drawSkill(s: Pick<SignupRow, 'rating' | 'rated_on' | 'skill'>, now = new Date()) {
  const fresh = s.rated_on && (now.getTime() - new Date(s.rated_on).getTime()) / 86400_000 < SKILL_FRESH_DAYS;
  return fresh && s.rating != null ? s.rating : (s.skill ?? s.rating ?? 3);
}

/** Who goes into the draw: coming, and paid (said so, or confirmed by the organiser). */
export function drawPool(rows: SignupRow[]): HatPlayer[] {
  return rows
    .filter((s) => s.attending === 'yes' && (s.paid || s.paid_confirmed) && !s.on_the_day)
    .map((s) => ({ id: s.person_id, gender: s.gender, skill: drawSkill(s), wantsCaptain: !!s.wants_captain }));
}

/* ---------------- Teams ---------------- */

export function hatTeams(db: SQLiteDatabase, eventId: string) {
  return db.getAllAsync<{ team_id: string; name: string; color: string | null; person_id: string; role: string; first_name: string; last_name: string; birth_date: string | null; gender: Gender | null }>(
    `SELECT t.id AS team_id, t.name, t.primary_color AS color, m.person_id, m.role, p.first_name, p.last_name, p.birth_date, p.gender
       FROM event_team et JOIN team t ON t.id = et.team_id
       JOIN membership m ON m.team_id = t.id AND m.deleted_at IS NULL AND m.end_date IS NULL
       JOIN person p ON p.id = m.person_id
      WHERE et.event_id = ? ORDER BY et.seed, m.role != 'captain', p.first_name COLLATE NOCASE`,
    eventId,
  );
}

/** Save the draw: one team per entry (captain first), memberships for this hat only, and a round robin. */
export function commitDraw(db: SQLiteDatabase, eventId: string, teams: HatTeam[], opts: { startIso: string; gameMinutes: number; fields: number; venueId: string | null; rules: Rules; region: string | null }) {
  return write(db, async () => {
    const ts = now();
    const ids: string[] = [];
    for (const [i, t] of teams.entries()) {
      const teamId = uuid();
      ids.push(teamId);
      await db.runAsync(
        `INSERT INTO team (id, name, short_name, kind, region, primary_color, about, is_sample, created_at, updated_at) VALUES (?, ?, ?, 'hat', ?, ?, ?, 0, ?, ?)`,
        teamId,
        t.name,
        t.name.slice(0, 3).toUpperCase(),
        opts.region,
        t.color,
        'Hat team',
        ts,
        ts,
      );
      await db.runAsync(`INSERT INTO event_team (id, event_id, team_id, seed, created_at) VALUES (?, ?, ?, ?, ?)`, uuid(), eventId, teamId, i + 1, ts);
      for (const pid of t.playerIds) {
        await db.runAsync(
          `INSERT INTO membership (id, person_id, team_id, kind, scope, scope_ref_id, role, created_at, updated_at) VALUES (?, ?, ?, 'guest', 'event', ?, ?, ?, ?)`,
          uuid(),
          pid,
          teamId,
          eventId,
          pid === t.captainId ? 'captain' : 'player',
          ts,
          ts,
        );
      }
    }
    const pairs = roundRobin(ids).sort((a, b) => a.round - b.round);
    const slots = hatSlots(opts.startIso, pairs.length, opts.gameMinutes, 10, Math.max(1, opts.fields));
    await createFixtures(
      db,
      pairs.map((p, k) => ({ eventId, homeId: p.homeId, awayId: p.awayId, scheduledAt: slots[k].at, venueId: opts.venueId, rules: opts.rules, round: p.round })),
    );
    await db.runAsync(`UPDATE event SET hat_status = 'drawn', team_count = ?, updated_at = ? WHERE id = ?`, teams.length, ts, eventId);
    return ids;
  });
}

/** Start again: remove the drawn teams and their (unplayed) games. */
export function undoDraw(db: SQLiteDatabase, eventId: string) {
  return write(db, async () => {
    const teams = (await db.getAllAsync<{ team_id: string }>(`SELECT team_id FROM event_team WHERE event_id = ?`, eventId)).map((t) => t.team_id);
    const played = await db.getFirstAsync(`SELECT 1 FROM game WHERE event_id = ? AND status != 'scheduled'`, eventId);
    if (played) throw new Error('Games have started, so the teams can’t be redrawn.');
    const q = teams.map(() => '?').join(',') || "''";
    await db.runAsync(`DELETE FROM game WHERE event_id = ?`, eventId);
    await db.runAsync(`DELETE FROM membership WHERE team_id IN (${q})`, ...teams);
    await db.runAsync(`DELETE FROM event_team WHERE event_id = ?`, eventId);
    await db.runAsync(`UPDATE team SET deleted_at = ? WHERE id IN (${q})`, now(), ...teams);
    await db.runAsync(`UPDATE event SET hat_status = 'signups', updated_at = ? WHERE id = ?`, now(), eventId);
  });
}

/**
 * On-the-day sign-up: record it and, if teams are already drawn, put them in the team they balance
 * best. Nobody already placed moves. Returns the team they joined (or null before the draw).
 */
export async function addLatePlayer(db: SQLiteDatabase, eventId: string, personId: string, opts: { paid: boolean; skill: number | null; teamId?: string | null }) {
  await saveSignup(db, eventId, personId, { attending: 'yes', wantsCaptain: false, skill: opts.skill, paid: opts.paid, onTheDay: true });
  const hat = await getHat(db, eventId);
  if (hat?.hat_status !== 'drawn') return null;
  const rows = await hatTeams(db, eventId);
  if (rows.some((r) => r.person_id === personId)) return rows.find((r) => r.person_id === personId)!.team_id;
  const signups = await hatSignups(db, eventId);
  const byId = new Map<string, HatPlayer>(signups.map((s) => [s.person_id, { id: s.person_id, gender: s.gender, skill: drawSkill(s), wantsCaptain: !!s.wants_captain }]));
  const teamIds = [...new Set(rows.map((r) => r.team_id))];
  const teams = teamIds.map((id) => ({ id, playerIds: rows.filter((r) => r.team_id === id).map((r) => r.person_id) }));
  const me = byId.get(personId)!;
  const teamId = opts.teamId ?? teams[bestTeamIndex(teams, me, byId)].id;
  await write(db, () =>
    db.runAsync(
      `INSERT INTO membership (id, person_id, team_id, kind, scope, scope_ref_id, role, created_at, updated_at) VALUES (?, ?, ?, 'guest', 'event', ?, 'player', ?, ?)`,
      uuid(),
      personId,
      teamId,
      eventId,
      now(),
      now(),
    ),
  );
  return teamId;
}
