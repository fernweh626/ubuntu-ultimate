import type { Game, GameEvent, GamePlayer, Point } from '@/db/types';

import { parseRules, type Rules } from './rules';

/** Everything recorded for one game. All live state and all statistics are derived from this. */
export type GameData = {
  game: Game;
  points: Point[];
  events: GameEvent[];
  lines: { point_id: string; team_id: string; person_id: string }[];
  players: GamePlayer[];
};

export type Phase = 'between' | 'inpoint' | 'final';

export type LiveState = {
  rules: Rules;
  scoreA: number;
  scoreB: number;
  point: Point | null;
  previousPoint: Point | null;
  phase: Phase;
  possession: string | null;
  holder: string | null;
  lastThrower: string | null;
  turnoversThisPoint: number;
  timeoutsUsed: Record<string, number>;
  halftimeTaken: boolean;
  stoppageSince: string | null;
  gameStartedAt: string | null;
  lastEvent: GameEvent | null;
  lastScore: GameEvent | null;
};

export const TURNOVER_TYPES = ['drop', 'throwaway', 'stall'] as const;

export function live(events: GameEvent[]) {
  return events.filter((e) => !e.voided_at).sort((a, b) => a.seq - b.seq);
}

export function otherTeam(game: Game, teamId: string) {
  return teamId === game.team_a_id ? game.team_b_id : game.team_a_id;
}

export function deriveState(data: GameData): LiveState {
  const { game } = data;
  const rules = parseRules(game.rules_json);
  const events = live(data.events);
  const points = [...data.points].sort((a, b) => a.number - b.number);
  const point = points[points.length - 1] ?? null;
  const previousPoint = points.length > 1 ? points[points.length - 2] : null;

  let scoreA = 0;
  let scoreB = 0;
  const timeoutsUsed: Record<string, number> = { [game.team_a_id]: 0, [game.team_b_id]: 0 };
  let halftimeTaken = false;
  let stoppageSince: string | null = null;
  let lastScore: GameEvent | null = null;

  for (const e of events) {
    if (e.type === 'score' || e.type === 'callahan') {
      if (e.team_id === game.team_a_id) scoreA += 1;
      else if (e.team_id === game.team_b_id) scoreB += 1;
      lastScore = e;
    } else if (e.type === 'timeout' && e.team_id) {
      timeoutsUsed[e.team_id] = (timeoutsUsed[e.team_id] ?? 0) + 1;
    } else if (e.type === 'halftime') {
      halftimeTaken = true;
    } else if (e.type === 'stoppage_start') {
      stoppageSince = e.recorded_at;
    } else if (e.type === 'stoppage_end') {
      stoppageSince = null;
    }
  }

  let possession: string | null = null;
  let holder: string | null = null;
  let lastThrower: string | null = null;
  let turnoversThisPoint = 0;
  let phase: Phase = 'between';

  if (game.status === 'final') phase = 'final';
  else if (point?.pulled_at && !point.scored_at) phase = 'inpoint';

  if (point && phase === 'inpoint') {
    possession = point.offense_team_id;
    for (const e of events.filter((ev) => ev.point_id === point.id)) {
      switch (e.type) {
        case 'pass':
          if (e.actor_id) lastThrower = e.actor_id;
          holder = e.secondary_id;
          break;
        case 'drop':
        case 'throwaway':
        case 'stall':
          possession = possession ? otherTeam(game, possession) : null;
          holder = null;
          lastThrower = null;
          turnoversThisPoint += 1;
          break;
        case 'intercept':
          possession = e.team_id;
          holder = e.actor_id;
          lastThrower = null;
          turnoversThisPoint += 1;
          break;
      }
    }
  }

  const gameStartedAt = points.find((p) => p.pulled_at)?.pulled_at ?? null;
  const lastEvent = events[events.length - 1] ?? null;

  return {
    rules,
    scoreA,
    scoreB,
    point,
    previousPoint,
    phase,
    possession,
    holder,
    lastThrower,
    turnoversThisPoint,
    timeoutsUsed,
    halftimeTaken,
    stoppageSince,
    gameStartedAt,
    lastEvent,
    lastScore,
  };
}

/** Which team receives the next point, given who just scored. */
export function nextOffense(game: Game, scoringTeamId: string, startsSecondHalf: boolean) {
  if (startsSecondHalf && game.first_pull_team_id) {
    // Teams swap for the second half: whoever pulled to start the game now receives.
    return game.first_pull_team_id;
  }
  return otherTeam(game, scoringTeamId);
}

/** Line on the field for a point, per team. */
export function lineFor(data: GameData, pointId: string, teamId: string) {
  return data.lines.filter((l) => l.point_id === pointId && l.team_id === teamId).map((l) => l.person_id);
}

export type Fitness = {
  personId: string;
  pointsPlayed: number;
  consecutive: number;
  restedPoints: number;
  recentSeconds: number;
  level: 'fresh' | 'tiring' | 'tired';
};

/**
 * Fitness from playing load: consecutive points, minutes played in the last 15 minutes, and the
 * coach/player flag. Points that were long count for more than quick ones.
 */
export function fitness(data: GameData, teamId: string, now = Date.now()): Map<string, Fitness> {
  const points = [...data.points].filter((p) => p.pulled_at).sort((a, b) => a.number - b.number);
  const result = new Map<string, Fitness>();
  const roster = data.players.filter((p) => p.team_id === teamId);
  for (const gp of roster) {
    const onLine = (p: Point) => data.lines.some((l) => l.point_id === p.id && l.person_id === gp.person_id);
    let played = 0;
    let recent = 0;
    for (const p of points) {
      if (!onLine(p)) continue;
      played += 1;
      const start = Date.parse(p.pulled_at!);
      const end = p.scored_at ? Date.parse(p.scored_at) : now;
      if (now - end < 15 * 60 * 1000) recent += Math.max(0, end - start) / 1000;
    }
    // Walk back from the latest point: first the points they've sat out, then (if none) their run on.
    let i = points.length - 1;
    let rested = 0;
    while (i >= 0 && !onLine(points[i])) {
      rested += 1;
      i -= 1;
    }
    let consecutive = 0;
    if (rested === 0) {
      while (i >= 0 && onLine(points[i])) {
        consecutive += 1;
        i -= 1;
      }
    }
    let level: Fitness['level'] = 'fresh';
    const load = consecutive + recent / 240;
    if (gp.status === 'tired' || load >= 4) level = 'tired';
    else if (load >= 2.5) level = 'tiring';
    result.set(gp.person_id, {
      personId: gp.person_id,
      pointsPlayed: played,
      consecutive,
      restedPoints: rested,
      recentSeconds: recent,
      level,
    });
  }
  return result;
}

export type BreakKind = 'timeout' | 'halftime' | 'between';
export type BreakSegment = { kind: BreakKind; endsAt: number };

/**
 * The stoppage running right now, as countdown segments in order (halftime then "pull due", say).
 * Worked out from events alone, so every phone following the game shows the same clock.
 */
export function breakClock(data: GameData, state: LiveState): { teamId: string | null; segments: BreakSegment[] } | null {
  const { game } = data;
  const point = state.point;
  if (game.status !== 'live' || !point || point.scored_at) return null;
  const rules = state.rules;
  const last = state.lastEvent;
  const timeout = last?.type === 'timeout' && last.point_id === point.id ? last : null;

  if (state.phase === 'inpoint') {
    if (!timeout) return null;
    return { teamId: timeout.team_id, segments: [{ kind: 'timeout', endsAt: Date.parse(timeout.recorded_at) + rules.timeoutSeconds * 1000 }] };
  }

  const prev = state.previousPoint;
  if (!prev?.scored_at) return null;
  const scoredAt = Date.parse(prev.scored_at);
  const events = live(data.events);
  const half = events.some((e) => e.point_id === prev.id && e.type === 'halftime');
  const timeouts = events.filter((e) => e.point_id === point.id && e.type === 'timeout').length;
  const halfEnds = scoredAt + (half ? rules.halftimeMinutes * 60_000 : 0);
  const pullDue = halfEnds + (rules.pullWithinSeconds + timeouts * rules.timeoutSeconds) * 1000;
  if (timeout) return { teamId: timeout.team_id, segments: [{ kind: 'timeout', endsAt: pullDue }] };
  return {
    teamId: null,
    segments: half
      ? [
          { kind: 'halftime', endsAt: halfEnds },
          { kind: 'between', endsAt: pullDue },
        ]
      : [{ kind: 'between', endsAt: pullDue }],
  };
}

/** The segment showing at `now`: the first that hasn't ended, else the last (running over time). */
export function currentSegment(segments: BreakSegment[], now: number) {
  const seg = segments.find((s) => now < s.endsAt) ?? segments[segments.length - 1];
  return { ...seg, remaining: (seg.endsAt - now) / 1000 };
}
