import type { LoadedGame } from '@/db/reports';
import type { Gender } from '@/db/types';

import { otherTeam } from './engine';
import { addPlayerStats, emptyPlayer, type PlayerGameStats } from './stats';

/* Numbers for the shareable report packs (team at an event, single game, whole event). Pure functions. */

export type PersonLite = { id: string; first_name: string; last_name: string; gender: Gender | null; birth_date: string | null; is_minor?: number };

export type GameLine = {
  id: string;
  oppName: string;
  oppColor: string | null;
  for: number;
  against: number;
  result: 'W' | 'L' | 'D';
  when: string | null;
  label: string | null;
  half1: { for: number; against: number } | null;
  forfeit: boolean;
};

export type PacePoint = { gameIndex: number; seconds: number; ours: boolean; scorerId: string | null; scoreText: string };

function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Score at halftime for `teamId` (null if the game never reached halftime). */
function halftime(g: LoadedGame, teamId: string) {
  const tl = g.stats.timeline.filter((t) => t.scoringTeamId);
  const lastFirst = [...tl].reverse().find((t) => t.point.half === 1);
  if (!lastFirst || !tl.some((t) => t.point.half === 2)) return null;
  const aSide = g.data.game.team_a_id === teamId;
  return { for: aSide ? lastFirst.scoreA : lastFirst.scoreB, against: aSide ? lastFirst.scoreB : lastFirst.scoreA };
}

export function gameLine(g: LoadedGame, teamId: string, label: string | null): GameLine {
  const opp = otherTeam(g.data.game, teamId);
  const f = g.stats.teams[teamId].score;
  const a = g.stats.teams[opp].score;
  const aSide = g.item.team_a_id === teamId;
  return {
    id: g.item.id,
    oppName: aSide ? g.item.b_name : g.item.a_name,
    oppColor: aSide ? g.item.b_color : g.item.a_color,
    for: f,
    against: a,
    result: f > a ? 'W' : f < a ? 'L' : 'D',
    when: g.item.started_at ?? g.item.scheduled_at,
    label,
    half1: halftime(g, teamId),
    forfeit: !!g.item.forfeit_team_id,
  };
}

export type Connections = {
  pairs: { from: string; to: string; count: number }[];
  byGender: { mm: number; mw: number; wm: number; ww: number };
  setUpMostDifferent: { id: string; n: number }[];
  scoredOffMostDifferent: { id: string; n: number }[];
  mostConnections: { id: string; n: number }[];
  assisted: number;
  twoWay: number;
};

export function connections(games: LoadedGame[], teamId: string | null, gender: (id: string) => Gender | null): Connections {
  const counts = new Map<string, number>();
  for (const g of games) {
    for (const t of g.stats.timeline) {
      if (!t.scorerId || !t.assistId || t.callahan) continue;
      if (teamId && t.scoringTeamId !== teamId) continue;
      const k = `${t.assistId}>${t.scorerId}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const pairs = [...counts.entries()].map(([k, count]) => {
    const [from, to] = k.split('>');
    return { from, to, count };
  });
  const byGender = { mm: 0, mw: 0, wm: 0, ww: 0 };
  for (const p of pairs) {
    const a = gender(p.from) === 'W' ? 'w' : 'm';
    const b = gender(p.to) === 'W' ? 'w' : 'm';
    byGender[`${a}${b}` as keyof typeof byGender] += p.count;
  }
  const tally = (key: 'from' | 'to', other: 'from' | 'to') => {
    const m = new Map<string, Set<string>>();
    pairs.forEach((p) => m.set(p[key], (m.get(p[key]) ?? new Set()).add(p[other])));
    return [...m.entries()].map(([id, s]) => ({ id, n: s.size })).sort((x, y) => y.n - x.n);
  };
  const total = new Map<string, Set<string>>();
  pairs.forEach((p) => {
    total.set(p.from, (total.get(p.from) ?? new Set()).add(p.to));
    total.set(p.to, (total.get(p.to) ?? new Set()).add(p.from));
  });
  return {
    pairs: pairs.sort((x, y) => y.count - x.count),
    byGender,
    setUpMostDifferent: tally('from', 'to').slice(0, 5),
    scoredOffMostDifferent: tally('to', 'from').slice(0, 5),
    mostConnections: [...total.entries()]
      .map(([id, s]) => ({ id, n: s.size }))
      .sort((x, y) => y.n - x.n)
      .slice(0, 5),
    assisted: pairs.reduce((a, p) => a + p.count, 0),
    twoWay: pairs.filter((p) => counts.has(`${p.to}>${p.from}`)).length / 2,
  };
}

export function pace(games: LoadedGame[], teamId: string | null, name: (id: string) => string) {
  const points: PacePoint[] = [];
  games.forEach((g, gi) => {
    for (const t of g.stats.timeline) {
      if (t.seconds == null || !t.scoringTeamId) continue;
      points.push({
        gameIndex: gi,
        seconds: t.seconds,
        ours: teamId ? t.scoringTeamId === teamId : t.scoringTeamId === g.item.team_a_id,
        scorerId: t.scorerId,
        scoreText: `${t.scoreA}-${t.scoreB}`,
      });
    }
  });
  const secs = points.map((p) => p.seconds);
  const rows = games.map((g, gi) => {
    const s = points.filter((p) => p.gameIndex === gi).map((p) => p.seconds);
    return {
      gameIndex: gi,
      n: s.length,
      avg: s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0,
      median: median(s),
      min: s.length ? Math.min(...s) : 0,
      max: s.length ? Math.max(...s) : 0,
      under3: s.filter((x) => x < 180).length,
      over6: s.filter((x) => x > 360).length,
    };
  });
  const shortest = points.length ? points.reduce((m, p) => (p.seconds < m.seconds ? p : m)) : null;
  const longest = points.length ? points.reduce((m, p) => (p.seconds > m.seconds ? p : m)) : null;
  return {
    points,
    rows,
    avg: secs.length ? secs.reduce((a, b) => a + b, 0) / secs.length : 0,
    median: median(secs),
    min: secs.length ? Math.min(...secs) : 0,
    max: secs.length ? Math.max(...secs) : 0,
    shortest: shortest ? { ...shortest, scorer: shortest.scorerId ? name(shortest.scorerId) : null } : null,
    longest: longest ? { ...longest, scorer: longest.scorerId ? name(longest.scorerId) : null } : null,
  };
}

/** Totals per player for one team across games — everyone in a squad, even with no stats. */
export function squadTotals(games: LoadedGame[], teamId: string) {
  const totals = new Map<string, PlayerGameStats>();
  const row = (id: string) => {
    if (!totals.has(id)) totals.set(id, emptyPlayer(id, teamId));
    return totals.get(id)!;
  };
  for (const g of games) {
    g.data.players.filter((p) => p.team_id === teamId && p.confirmation !== 'removed').forEach((p) => row(p.person_id));
    Object.values(g.stats.players)
      .filter((s) => s.teamId === teamId)
      .forEach((s) => addPlayerStats(row(s.personId), s));
  }
  return [...totals.values()].sort((a, b) => b.goals + b.assists - (a.goals + a.assists) || b.goals - a.goals);
}

/** Team-level sums across games: holds, breaks, turnovers and their types. */
export function teamTotals(games: LoadedGame[], teamId: string) {
  const t = {
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
    intercepted: 0,
    intercepts: 0,
    callahans: 0,
    pullDelay: 0,
    pullCount: 0,
  };
  const o = { holds: 0, oPoints: 0, breaks: 0, dPoints: 0, turnovers: 0 };
  for (const g of games) {
    const s = g.stats.teams[teamId];
    const opp = g.stats.teams[otherTeam(g.data.game, teamId)];
    if (!s || !opp) continue;
    t.oPoints += s.oPoints;
    t.dPoints += s.dPoints;
    t.holds += s.holds;
    t.cleanHolds += s.cleanHolds;
    t.breaks += s.breaks;
    t.breakChances += s.breakChances;
    t.turnovers += s.turnovers;
    t.drops += s.drops;
    t.throwaways += s.throwaways;
    t.stalls += s.stalls;
    t.intercepted += s.interceptedAgainst;
    t.intercepts += s.intercepts;
    t.callahans += s.callahans;
    t.pullDelay += s.pullDelaySum;
    t.pullCount += s.pullDelayCount;
    o.holds += opp.holds;
    o.oPoints += opp.oPoints;
    o.breaks += opp.breaks;
    o.dPoints += opp.dPoints;
    o.turnovers += opp.turnovers;
  }
  return { ...t, opp: o };
}

/** Longest run of consecutive goals by one team in a game. */
export function biggestRun(g: LoadedGame) {
  let best = { teamId: '', n: 0, from: '', to: '' };
  let cur = { teamId: '', n: 0, from: '' };
  for (const t of g.stats.timeline.filter((x) => x.scoringTeamId)) {
    if (t.scoringTeamId === cur.teamId) cur.n += 1;
    else cur = { teamId: t.scoringTeamId!, n: 1, from: `${t.scoreA - (t.scoringTeamId === g.item.team_a_id ? 1 : 0)}-${t.scoreB - (t.scoringTeamId === g.item.team_b_id ? 1 : 0)}` };
    if (cur.n > best.n) best = { ...cur, to: `${t.scoreA}-${t.scoreB}` };
  }
  return best.n ? best : null;
}

export const pctText = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '–');

export function mmss(seconds: number) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
