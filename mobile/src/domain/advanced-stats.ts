import { live, otherTeam, type GameData } from './engine';

/*
 * The stats full scoring mode unlocks (every pass recorded): possessions, pass chains, pass pairs,
 * conversion after a turnover, and which seven on the field together did best. Raw counts per game
 * that add up across a season; rates are worked out when shown.
 */

export type LineRecord = { ids: string[]; played: number; scored: number; conceded: number };

export type TeamAdvanced = {
  teamId: string;
  /** Times the team had the disc: the start of each offence point, and every turnover won. */
  possessions: number;
  scoringPossessions: number;
  /** Possessions that began with winning the disc back (turn or D), and how many of them scored. */
  afterTurn: number;
  afterTurnScored: number;
  completions: number;
  /** Completed passes in possessions that ended in a goal (including the goal). */
  passesInScoring: number;
  longestChain: number;
  /** "thrower>receiver" → completed passes (goals included). */
  pairs: Record<string, number>;
  /** Sorted person ids of the seven on the field → how those points went. */
  lines: Record<string, LineRecord>;
};

const emptyTeam = (teamId: string): TeamAdvanced => ({
  teamId,
  possessions: 0,
  scoringPossessions: 0,
  afterTurn: 0,
  afterTurnScored: 0,
  completions: 0,
  passesInScoring: 0,
  longestChain: 0,
  pairs: {},
  lines: {},
});

export function computeAdvanced(data: GameData): Record<string, TeamAdvanced> {
  const { game } = data;
  const teams: Record<string, TeamAdvanced> = { [game.team_a_id]: emptyTeam(game.team_a_id), [game.team_b_id]: emptyTeam(game.team_b_id) };
  const events = live(data.events);

  for (const p of [...data.points].sort((a, b) => a.number - b.number)) {
    if (!p.pulled_at && !p.scored_at) continue;
    // Who was on, per side, and how the point went for that seven.
    for (const side of [game.team_a_id, game.team_b_id]) {
      const ids = data.lines
        .filter((l) => l.point_id === p.id && l.team_id === side)
        .map((l) => l.person_id)
        .sort();
      if (!ids.length || !p.scoring_team_id) continue;
      const key = ids.join(',');
      const rec = (teams[side].lines[key] ??= { ids, played: 0, scored: 0, conceded: 0 });
      rec.played += 1;
      if (p.scoring_team_id === side) rec.scored += 1;
      else rec.conceded += 1;
    }

    let team = p.offense_team_id;
    let chain = 0;
    let fromTurn = false;
    const start = (t: string, afterTurn: boolean) => {
      team = t;
      chain = 0;
      fromTurn = afterTurn;
      teams[t].possessions += 1;
      if (afterTurn) teams[t].afterTurn += 1;
    };
    const scored = (t: string) => {
      teams[t].scoringPossessions += 1;
      teams[t].passesInScoring += chain;
      if (fromTurn) teams[t].afterTurnScored += 1;
    };
    const pass = (t: string, from: string | null, to: string | null) => {
      chain += 1;
      teams[t].completions += 1;
      teams[t].longestChain = Math.max(teams[t].longestChain, chain);
      if (from && to) teams[t].pairs[`${from}>${to}`] = (teams[t].pairs[`${from}>${to}`] ?? 0) + 1;
    };
    start(p.offense_team_id, false);

    for (const e of events.filter((ev) => ev.point_id === p.id)) {
      if (e.type === 'pass') pass(team, e.actor_id, e.secondary_id);
      else if (e.type === 'drop' || e.type === 'throwaway' || e.type === 'stall') start(otherTeam(game, e.team_id ?? team), true);
      else if (e.type === 'intercept') start(e.team_id ?? otherTeam(game, team), true);
      else if (e.type === 'callahan') {
        start(e.team_id ?? otherTeam(game, team), true);
        scored(team);
      } else if (e.type === 'score') {
        const t = e.team_id ?? team;
        if (t !== team) start(t, true);
        if (e.secondary_id) pass(t, e.secondary_id, e.actor_id);
        scored(t);
      }
    }
  }
  return teams;
}

/** Add one team's numbers from many games (a season, a league, a tournament). */
export function addAdvanced(list: TeamAdvanced[], teamId: string): TeamAdvanced {
  const out = emptyTeam(teamId);
  for (const t of list) {
    out.possessions += t.possessions;
    out.scoringPossessions += t.scoringPossessions;
    out.afterTurn += t.afterTurn;
    out.afterTurnScored += t.afterTurnScored;
    out.completions += t.completions;
    out.passesInScoring += t.passesInScoring;
    out.longestChain = Math.max(out.longestChain, t.longestChain);
    for (const [k, n] of Object.entries(t.pairs)) out.pairs[k] = (out.pairs[k] ?? 0) + n;
    for (const [k, r] of Object.entries(t.lines)) {
      const o = (out.lines[k] ??= { ids: r.ids, played: 0, scored: 0, conceded: 0 });
      o.played += r.played;
      o.scored += r.scored;
      o.conceded += r.conceded;
    }
  }
  return out;
}

export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
export const per = (n: number, d: number) => (d ? Math.round((n / d) * 100) / 100 : null);

/** The most-used pass pairs, both directions kept apart (A→B isn't B→A). */
export function topPairs(t: TeamAdvanced, n = 5) {
  return Object.entries(t.pairs)
    .map(([k, count]) => ({ from: k.split('>')[0], to: k.split('>')[1], count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/** Lines that played at least `min` points together, best point difference first. */
export function bestLines(t: TeamAdvanced, min = 2, n = 3) {
  return Object.values(t.lines)
    .filter((l) => l.played >= min)
    .sort((a, b) => b.scored - b.conceded - (a.scored - a.conceded) || b.played - a.played)
    .slice(0, n);
}

/** Per-point rates for a player (or team): how often per point played. */
export function perPoint(s: { points: number; goals: number; assists: number; intercepts: number; drops: number; throwaways: number; stalls: number }) {
  return {
    goals: per(s.goals, s.points),
    assists: per(s.assists, s.points),
    ds: per(s.intercepts, s.points),
    drops: per(s.drops, s.points),
    throwaways: per(s.throwaways, s.points),
    turns: per(s.drops + s.throwaways + s.stalls, s.points),
  };
}

/** Throwing and catching percentages from full mode. */
export function completionRates(s: { completions: number; catches: number; throwaways: number; stalls: number; drops: number; assists: number; goals: number }) {
  const thrown = s.completions + s.assists + s.throwaways + s.stalls;
  const caught = s.catches + s.goals;
  return { throwing: pct(s.completions + s.assists, thrown), catching: pct(caught, caught + s.drops) };
}
