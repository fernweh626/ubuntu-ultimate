import type { LoadedGame } from '@/db/reports';
import type { Person } from '@/db/types';

import { displayName } from './format';
import { ratioCode } from './rules';

/*
 * CSV exports for staff who want to dig into the numbers (pandas, R, Excel, Sheets).
 * One row per game / player-game / point / event. Ids are included so files join on game_id and
 * person_id. Names follow the app's privacy rule (under-18s as first name + initial); no emails or
 * birth dates ever.
 */

export function csv(rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel opens accents (Pietermaritzburg, Zoë) correctly.
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

type Names = Map<string, Person>;
const nameOf = (people: Names, id: string | null | undefined) => (id && people.get(id) ? displayName(people.get(id)!) : '');
const teamName = (g: LoadedGame, id: string | null | undefined) => (id === g.item.team_a_id ? g.item.a_name : id === g.item.team_b_id ? g.item.b_name : '');
const date = (g: LoadedGame) => (g.item.started_at ?? g.item.scheduled_at ?? '').slice(0, 10);

export function gamesCsv(games: LoadedGame[]) {
  const head = [
    'game_id',
    'date',
    'event',
    'round',
    'venue',
    'team_a',
    'team_b',
    'score_a',
    'score_b',
    'winner',
    'forfeit_by',
    'tracking',
    'duration_min',
    'avg_point_s',
    'a_holds',
    'a_o_points',
    'a_breaks',
    'a_d_points',
    'a_clean_holds',
    'a_turnovers',
    'a_drops',
    'a_throwaways',
    'a_stalls',
    'a_intercepts',
    'b_holds',
    'b_o_points',
    'b_breaks',
    'b_d_points',
    'b_clean_holds',
    'b_turnovers',
    'b_drops',
    'b_throwaways',
    'b_stalls',
    'b_intercepts',
  ];
  const rows = games.map((g) => {
    const A = g.stats.teams[g.item.team_a_id];
    const B = g.stats.teams[g.item.team_b_id];
    const t = (s: typeof A) => [s.holds, s.oPoints, s.breaks, s.dPoints, s.cleanHolds, s.turnovers, s.drops, s.throwaways, s.stalls, s.intercepts];
    return [
      g.item.id,
      date(g),
      g.item.event_name,
      g.item.round ?? g.item.stage,
      g.item.venue_name,
      g.item.a_name,
      g.item.b_name,
      A.score,
      B.score,
      teamName(g, g.stats.winnerId),
      teamName(g, g.item.forfeit_team_id),
      g.item.tracking_mode,
      g.stats.durationSeconds != null ? Math.round(g.stats.durationSeconds / 60) : null,
      g.stats.avgPointSeconds != null ? Math.round(g.stats.avgPointSeconds) : null,
      ...t(A),
      ...t(B),
    ];
  });
  return csv([head, ...rows]);
}

export function playerGamesCsv(games: LoadedGame[], people: Names, onlyTeam?: string) {
  const head = [
    'game_id',
    'date',
    'event',
    'team',
    'opponent',
    'person_id',
    'player',
    'gender',
    'jersey',
    'points',
    'o_points',
    'd_points',
    'goals',
    'assists',
    'hockey_assists',
    'intercepts',
    'callahans',
    'drops',
    'throwaways',
    'stalls',
    'plus_minus',
    'pulls',
  ];
  const rows: (string | number | null)[][] = [];
  for (const g of games) {
    for (const s of Object.values(g.stats.players)) {
      if (onlyTeam && s.teamId !== onlyTeam) continue;
      const gp = g.data.players.find((p) => p.person_id === s.personId);
      rows.push([
        g.item.id,
        date(g),
        g.item.event_name,
        teamName(g, s.teamId),
        teamName(g, s.teamId === g.item.team_a_id ? g.item.team_b_id : g.item.team_a_id),
        s.personId,
        nameOf(people, s.personId),
        people.get(s.personId)?.gender ?? '',
        gp?.jersey_number ?? '',
        s.points,
        s.oPoints,
        s.dPoints,
        s.goals,
        s.assists,
        s.hockeyAssists,
        s.intercepts,
        s.callahans,
        s.drops,
        s.throwaways,
        s.stalls,
        s.plusMinus,
        s.pulls,
      ]);
    }
  }
  return csv([head, ...rows]);
}

export function pointsCsv(games: LoadedGame[], people: Names) {
  const head = [
    'game_id',
    'date',
    'point',
    'half',
    'ratio',
    'offence_team',
    'scoring_team',
    'score_a',
    'score_b',
    'result',
    'clean',
    'turnovers',
    'seconds',
    'scorer',
    'assist',
    'callahan',
    'team_a_line',
    'team_b_line',
  ];
  const rows: (string | number | null)[][] = [];
  for (const g of games) {
    for (const t of g.stats.timeline) {
      const line = (team: string) =>
        g.data.lines
          .filter((l) => l.point_id === t.point.id && l.team_id === team)
          .map((l) => nameOf(people, l.person_id))
          .join('; ');
      rows.push([
        g.item.id,
        date(g),
        t.point.number,
        t.point.half,
        ratioCode(t.point.ratio, t.point.number),
        teamName(g, t.startedOnOffense),
        teamName(g, t.scoringTeamId),
        t.scoreA,
        t.scoreB,
        t.kind,
        t.clean ? 1 : 0,
        t.turnovers,
        t.seconds != null ? Math.round(t.seconds) : null,
        nameOf(people, t.scorerId),
        nameOf(people, t.assistId),
        t.callahan ? 1 : 0,
        line(g.item.team_a_id),
        line(g.item.team_b_id),
      ]);
    }
  }
  return csv([head, ...rows]);
}

export function eventsCsv(games: LoadedGame[], people: Names) {
  const head = ['game_id', 'point', 'seq', 'type', 'team', 'actor_id', 'actor', 'secondary_id', 'secondary', 'value', 'recorded_at'];
  const rows: (string | number | null)[][] = [];
  for (const g of games) {
    const pointNo = new Map(g.data.points.map((p) => [p.id, p.number]));
    for (const e of g.data.events.filter((x) => !x.voided_at).sort((a, b) => a.seq - b.seq)) {
      rows.push([
        g.item.id,
        e.point_id ? (pointNo.get(e.point_id) ?? null) : null,
        e.seq,
        e.type,
        teamName(g, e.team_id),
        e.actor_id,
        nameOf(people, e.actor_id),
        e.secondary_id,
        nameOf(people, e.secondary_id),
        e.value,
        e.recorded_at,
      ]);
    }
  }
  return csv([head, ...rows]);
}

export function attendanceCsv(rows: { date: string; title: string | null; cancelled: boolean; personId: string; name: string; gender: string | null; rsvp: string | null; attended: number | null }[]) {
  return csv([
    ['date', 'practice', 'cancelled', 'person_id', 'player', 'gender', 'said', 'attended'],
    ...rows.map((r) => [r.date, r.title, r.cancelled ? 1 : 0, r.personId, r.name, r.gender, r.rsvp, r.attended]),
  ]);
}

type DevPerson = { id: string; first_name: string; last_name: string; birth_date: string | null; gender: string | null };

/** Every self-rating in the history, one row per player per check-in (1–5). */
export function ratingsCsv(
  people: DevPerson[],
  ratings: { person_id: string; rated_on: string; experience: number; throwing: number; receiving: number; defence: number; athleticism: number; notes: string | null }[],
) {
  const byId = new Map(people.map((p) => [p.id, p]));
  return csv([
    ['person_id', 'player', 'gender', 'rated_on', 'experience', 'throwing', 'cutting_catching', 'defence', 'fitness_athleticism', 'average', 'working_on'],
    ...ratings
      .filter((r) => byId.has(r.person_id))
      .map((r) => {
        const p = byId.get(r.person_id)!;
        const avg = (r.experience + r.throwing + r.receiving + r.defence + r.athleticism) / 5;
        return [r.person_id, displayName(p), p.gender, r.rated_on.slice(0, 10), r.experience, r.throwing, r.receiving, r.defence, r.athleticism, avg.toFixed(1), r.notes];
      }),
  ]);
}

/** Every benchmark result. Beep is given as level and shuttle; the rest in seconds. */
export function fitnessCsv(people: DevPerson[], tests: { person_id: string; kind: string; value: number; tested_on: string; notes: string | null }[]) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const label: Record<string, string> = { beep: 'beep_test', agility_5105: 'agility_5_10_5', sprint_40: 'sprint_40m', sprint_60: 'sprint_60m' };
  return csv([
    ['person_id', 'player', 'gender', 'test', 'tested_on', 'seconds', 'beep_level', 'beep_shuttle', 'notes'],
    ...tests
      .filter((t) => byId.has(t.person_id))
      .map((t) => {
        const p = byId.get(t.person_id)!;
        const beep = t.kind === 'beep';
        const level = Math.floor(t.value + 1e-9);
        return [
          t.person_id,
          displayName(p),
          p.gender,
          label[t.kind] ?? t.kind,
          t.tested_on.slice(0, 10),
          beep ? null : t.value,
          beep ? level : null,
          beep ? Math.round((t.value - level) * 100) : null,
          t.notes,
        ];
      }),
  ]);
}

/** Who's ready to play: accreditation and association standing. Phone numbers are deliberately left out. */
export function readinessCsv(
  rows: (DevPerson & {
    level: string | null;
    expires_on: string | null;
    reg: { safda_number: string | null; region_code: string | null; region_number: string | null } | null;
    safda: { status: string; paid_until: string | null } | null;
    region: { status: string; paid_until: string | null } | null;
    safdaListed: boolean;
    regionListed: boolean;
  })[],
  today = new Date().toISOString().slice(0, 10),
) {
  const st = (n: string | null | undefined, row: { status: string } | null, listed: boolean) => (!n ? 'no_number' : !listed ? 'list_not_uploaded' : row ? row.status : 'not_on_list');
  return csv([
    [
      'person_id',
      'player',
      'gender',
      'accreditation',
      'accreditation_expires',
      'accreditation_valid',
      'safda_number',
      'safda_status',
      'safda_paid_until',
      'region',
      'region_number',
      'region_status',
      'region_paid_until',
      'ready',
    ],
    ...rows.map((r) => {
      const accOk = !!r.level && !!r.expires_on && r.expires_on >= today;
      const s = st(r.reg?.safda_number, r.safda, r.safdaListed);
      const g = st(r.reg?.region_number, r.region, r.regionListed);
      return [
        r.id,
        displayName(r),
        r.gender,
        r.level,
        r.expires_on,
        accOk ? 1 : 0,
        r.reg?.safda_number,
        s,
        r.safda?.paid_until,
        r.reg?.region_code,
        r.reg?.region_number,
        g,
        r.region?.paid_until,
        accOk && s === 'good' && g === 'good' ? 1 : 0,
      ];
    }),
  ]);
}
