import type { Game, Point } from '@/db/types';

import { live, otherTeam, type GameData } from './engine';
import { parseRules } from './rules';

export type TeamGameStats = {
  teamId: string;
  score: number;
  oPoints: number;
  dPoints: number;
  holds: number;
  cleanHolds: number;
  breaks: number;
  breakChances: number;
  turnovers: number;
  drops: number;
  throwaways: number;
  stalls: number;
  interceptedAgainst: number;
  intercepts: number;
  callahans: number;
  timeouts: number;
  pulls: { in: number; out: number; brick: number; total: number };
  pullDelaySum: number;
  pullDelayCount: number;
};

export type PlayerGameStats = {
  personId: string;
  teamId: string;
  points: number;
  oPoints: number;
  dPoints: number;
  goals: number;
  assists: number;
  hockeyAssists: number;
  intercepts: number;
  callahans: number;
  drops: number;
  throwaways: number;
  stalls: number;
  completions: number;
  catches: number;
  pulls: number;
  plusMinus: number;
};

export type PointSummary = {
  point: Point;
  scoringTeamId: string | null;
  startedOnOffense: string;
  kind: 'hold' | 'break' | null;
  clean: boolean;
  turnovers: number;
  seconds: number | null;
  scoreA: number;
  scoreB: number;
  scorerId: string | null;
  assistId: string | null;
  callahan: boolean;
};

export type GameStats = {
  teams: Record<string, TeamGameStats>;
  players: Record<string, PlayerGameStats>;
  timeline: PointSummary[];
  connections: { assistId: string; scorerId: string; count: number }[];
  durationSeconds: number | null;
  avgPointSeconds: number | null;
  winnerId: string | null;
};

function emptyTeam(teamId: string): TeamGameStats {
  return {
    teamId,
    score: 0,
    oPoints: 0,
    dPoints: 0,
    holds: 0,
    cleanHolds: 0,
    breaks: 0,
    breakChances: 0,
    turnovers: 0,
    drops: 0,
    throwaways: 0,
    stalls: 0,
    interceptedAgainst: 0,
    intercepts: 0,
    callahans: 0,
    timeouts: 0,
    pulls: { in: 0, out: 0, brick: 0, total: 0 },
    pullDelaySum: 0,
    pullDelayCount: 0,
  };
}

export function emptyPlayer(personId: string, teamId: string): PlayerGameStats {
  return {
    personId,
    teamId,
    points: 0,
    oPoints: 0,
    dPoints: 0,
    goals: 0,
    assists: 0,
    hockeyAssists: 0,
    intercepts: 0,
    callahans: 0,
    drops: 0,
    throwaways: 0,
    stalls: 0,
    completions: 0,
    catches: 0,
    pulls: 0,
    plusMinus: 0,
  };
}

export function computeGameStats(data: GameData): GameStats {
  const { game } = data;
  const rules = parseRules(game.rules_json);
  const events = live(data.events);
  const teams: Record<string, TeamGameStats> = {
    [game.team_a_id]: emptyTeam(game.team_a_id),
    [game.team_b_id]: emptyTeam(game.team_b_id),
  };
  const players: Record<string, PlayerGameStats> = {};
  const teamOf = new Map(data.players.map((p) => [p.person_id, p.team_id]));
  const player = (id: string | null, fallbackTeam?: string | null) => {
    if (!id) return null;
    const team = teamOf.get(id) ?? fallbackTeam ?? game.team_a_id;
    players[id] ??= emptyPlayer(id, team);
    return players[id];
  };
  for (const gp of data.players) player(gp.person_id, gp.team_id);

  const points = [...data.points].sort((a, b) => a.number - b.number);
  const timeline: PointSummary[] = [];
  const connections = new Map<string, number>();
  let scoreA = 0;
  let scoreB = 0;
  let pointSecondsSum = 0;
  let pointSecondsCount = 0;
  let prevScoredAt: string | null = null;

  for (const p of points) {
    if (!p.pulled_at && !p.scored_at) continue;
    const offense = p.offense_team_id;
    const defense = otherTeam(game, offense);
    teams[offense].oPoints += 1;
    teams[defense].dPoints += 1;

    for (const l of data.lines.filter((x) => x.point_id === p.id)) {
      const ps = player(l.person_id, l.team_id)!;
      ps.points += 1;
      if (l.team_id === offense) ps.oPoints += 1;
      else ps.dPoints += 1;
    }

    // Pull
    const pullingTeam = defense;
    if (p.pulled_at) {
      const t = teams[pullingTeam].pulls;
      t.total += 1;
      if (p.pull_outcome === 'in') t.in += 1;
      if (p.pull_outcome === 'out') t.out += 1;
      if (p.pull_outcome === 'brick') t.brick += 1;
      if (p.puller_id) player(p.puller_id, pullingTeam)!.pulls += 1;
      if (prevScoredAt) {
        const delay = (Date.parse(p.pulled_at) - Date.parse(prevScoredAt)) / 1000 - rules.pullWithinSeconds;
        // Ignore gaps that include halftime or long stoppages; they say nothing about pull timing.
        if (delay < 10 * 60) {
          teams[pullingTeam].pullDelaySum += delay;
          teams[pullingTeam].pullDelayCount += 1;
        }
      }
    }

    let possession = offense;
    let turnovers = 0;
    const hadDisc = new Set<string>([offense]);
    let scorerId: string | null = null;
    let assistId: string | null = null;
    let callahan = false;

    for (const e of events.filter((ev) => ev.point_id === p.id)) {
      switch (e.type) {
        case 'pass': {
          if (e.actor_id) {
            player(e.actor_id, possession)!.completions += 1;
          }
          if (e.secondary_id) player(e.secondary_id, possession)!.catches += 1;
          break;
        }
        case 'drop':
        case 'throwaway':
        case 'stall': {
          const team = e.team_id ?? possession;
          teams[team].turnovers += 1;
          if (e.type === 'drop') teams[team].drops += 1;
          if (e.type === 'throwaway') teams[team].throwaways += 1;
          if (e.type === 'stall') teams[team].stalls += 1;
          const ps = player(e.actor_id, team);
          if (ps) {
            if (e.type === 'drop') ps.drops += 1;
            if (e.type === 'throwaway') ps.throwaways += 1;
            if (e.type === 'stall') ps.stalls += 1;
          }
          possession = otherTeam(game, team);
          hadDisc.add(possession);
          turnovers += 1;
          break;
        }
        case 'intercept': {
          const gaining = e.team_id ?? otherTeam(game, possession);
          const losing = otherTeam(game, gaining);
          teams[gaining].intercepts += 1;
          teams[losing].turnovers += 1;
          teams[losing].interceptedAgainst += 1;
          const ps = player(e.actor_id, gaining);
          if (ps) ps.intercepts += 1;
          possession = gaining;
          hadDisc.add(gaining);
          turnovers += 1;
          break;
        }
        case 'callahan': {
          const gaining = e.team_id ?? otherTeam(game, possession);
          const losing = otherTeam(game, gaining);
          teams[gaining].intercepts += 1;
          teams[gaining].callahans += 1;
          teams[losing].turnovers += 1;
          teams[losing].interceptedAgainst += 1;
          const ps = player(e.actor_id, gaining);
          if (ps) {
            ps.intercepts += 1;
            ps.callahans += 1;
            ps.goals += 1;
          }
          hadDisc.add(gaining);
          turnovers += 1;
          scorerId = e.actor_id;
          callahan = true;
          break;
        }
        case 'score': {
          const team = e.team_id ?? possession;
          const scorer = player(e.actor_id, team);
          const assist = player(e.secondary_id, team);
          const hockey = player(e.tertiary_id, team);
          if (scorer) scorer.goals += 1;
          if (assist) assist.assists += 1;
          if (hockey) hockey.hockeyAssists += 1;
          scorerId = e.actor_id;
          assistId = e.secondary_id;
          if (e.actor_id && e.secondary_id) {
            const key = `${e.secondary_id}>${e.actor_id}`;
            connections.set(key, (connections.get(key) ?? 0) + 1);
          }
          break;
        }
        case 'timeout':
          if (e.team_id) teams[e.team_id].timeouts += 1;
          break;
      }
    }

    if (hadDisc.has(defense)) teams[defense].breakChances += 1;

    let kind: PointSummary['kind'] = null;
    if (p.scoring_team_id) {
      teams[p.scoring_team_id].score += 1;
      if (p.scoring_team_id === game.team_a_id) scoreA += 1;
      else scoreB += 1;
      if (p.scoring_team_id === offense) {
        kind = 'hold';
        teams[offense].holds += 1;
        if (turnovers === 0) teams[offense].cleanHolds += 1;
      } else {
        kind = 'break';
        teams[defense].breaks += 1;
      }
    }

    let seconds: number | null = null;
    if (p.pulled_at && p.scored_at) {
      seconds = (Date.parse(p.scored_at) - Date.parse(p.pulled_at)) / 1000;
      pointSecondsSum += seconds;
      pointSecondsCount += 1;
    }
    if (p.scored_at) prevScoredAt = p.scored_at;

    timeline.push({
      point: p,
      scoringTeamId: p.scoring_team_id,
      startedOnOffense: offense,
      kind,
      clean: kind === 'hold' && turnovers === 0,
      turnovers,
      seconds,
      scoreA,
      scoreB,
      scorerId,
      assistId,
      callahan,
    });
  }

  for (const ps of Object.values(players)) {
    ps.plusMinus = ps.goals + ps.assists + ps.intercepts - ps.drops - ps.throwaways - ps.stalls;
  }

  const first = points.find((p) => p.pulled_at)?.pulled_at;
  const last = [...points].reverse().find((p) => p.scored_at)?.scored_at;
  const durationSeconds = first && last ? (Date.parse(last) - Date.parse(first)) / 1000 : null;
  const a = teams[game.team_a_id].score;
  const b = teams[game.team_b_id].score;

  return {
    teams,
    players,
    timeline,
    connections: [...connections.entries()]
      .map(([key, count]) => {
        const [assistId, scorerId] = key.split('>');
        return { assistId, scorerId, count };
      })
      .sort((x, y) => y.count - x.count),
    durationSeconds,
    avgPointSeconds: pointSecondsCount ? pointSecondsSum / pointSecondsCount : null,
    winnerId: game.status === 'final' && a !== b ? (a > b ? game.team_a_id : game.team_b_id) : null,
  };
}

/* ---------- Aggregates across many games (team season / event / league reports) ---------- */

export type TeamAggregate = {
  teamId: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
  oPoints: number;
  dPoints: number;
  holds: number;
  cleanHolds: number;
  breaks: number;
  turnovers: number;
  intercepts: number;
  pointsPlayed: number;
  form: ('W' | 'L' | 'D')[];
};

export function emptyAggregate(teamId: string): TeamAggregate {
  return {
    teamId,
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    oPoints: 0,
    dPoints: 0,
    holds: 0,
    cleanHolds: 0,
    breaks: 0,
    turnovers: 0,
    intercepts: 0,
    pointsPlayed: 0,
    form: [],
  };
}

export function addGameToAggregate(agg: TeamAggregate, game: Game, stats: GameStats) {
  const mine = stats.teams[agg.teamId];
  const theirs = stats.teams[otherTeam(game, agg.teamId)];
  if (!mine || !theirs) return;
  agg.games += 1;
  agg.pointsFor += mine.score;
  agg.pointsAgainst += theirs.score;
  const r = mine.score > theirs.score ? 'W' : mine.score < theirs.score ? 'L' : 'D';
  if (r === 'W') agg.wins += 1;
  if (r === 'L') agg.losses += 1;
  if (r === 'D') agg.draws += 1;
  agg.form.push(r);
  agg.oPoints += mine.oPoints;
  agg.dPoints += mine.dPoints;
  agg.holds += mine.holds;
  agg.cleanHolds += mine.cleanHolds;
  agg.breaks += mine.breaks;
  agg.turnovers += mine.turnovers;
  agg.intercepts += mine.intercepts;
  agg.pointsPlayed += mine.oPoints + mine.dPoints;
}

export function addPlayerStats(into: PlayerGameStats, s: PlayerGameStats) {
  const keys: (keyof PlayerGameStats)[] = [
    'points',
    'oPoints',
    'dPoints',
    'goals',
    'assists',
    'hockeyAssists',
    'intercepts',
    'callahans',
    'drops',
    'throwaways',
    'stalls',
    'completions',
    'catches',
    'pulls',
    'plusMinus',
  ];
  for (const k of keys) (into[k] as number) += s[k] as number;
}

/** Standings order: wins, fewest losses, point difference, points scored. Head-to-head comes with brackets. */
export function rankStandings(rows: TeamAggregate[]) {
  return [...rows].sort(
    (a, b) =>
      b.wins - a.wins ||
      a.losses - b.losses ||
      b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst) ||
      b.pointsFor - a.pointsFor,
  );
}
