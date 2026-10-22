/* Competition formats beyond a plain round robin: Swiss rounds and playoff brackets. */

export type Standing = { teamId: string; wins: number; losses: number; diff: number; pointsFor: number };

const rankKey = (a: Standing, b: Standing) => b.wins - a.wins || a.losses - b.losses || b.diff - a.diff || b.pointsFor - a.pointsFor;

/**
 * Pair the next Swiss round: teams sorted by record play the nearest team below them they haven't met.
 * With an odd count, the lowest-ranked team that hasn't had a bye sits out.
 * `played` holds "a|b" keys (both orders) for games already scheduled or played.
 */
export function swissRound(standings: Standing[], played: Set<string>, hadBye: Set<string>) {
  const order = [...standings].sort(rankKey).map((s) => s.teamId);
  let bye: string | null = null;
  if (order.length % 2) {
    const candidates = [...order].reverse();
    bye = candidates.find((t) => !hadBye.has(t)) ?? candidates[0];
    order.splice(order.indexOf(bye), 1);
  }
  const met = (a: string, b: string) => played.has(`${a}|${b}`);

  // Backtracking keeps it rematch-free whenever that's possible; otherwise it allows the fewest rematches.
  const pairs: [string, string][] = [];
  const solve = (left: string[], allowRematch: boolean): boolean => {
    if (!left.length) return true;
    const [a, ...rest] = left;
    for (let i = 0; i < rest.length; i += 1) {
      const b = rest[i];
      if (!allowRematch && met(a, b)) continue;
      pairs.push([a, b]);
      if (solve([...rest.slice(0, i), ...rest.slice(i + 1)], allowRematch)) return true;
      pairs.pop();
    }
    return false;
  };
  if (!solve(order, false)) {
    pairs.length = 0;
    solve(order, true);
  }
  return { pairs, bye };
}

/* ---------------- Playoff brackets ---------------- */

export type Source = { type: 'rank'; pool: string | null; rank: number } | { type: 'winner'; slot: string } | { type: 'loser'; slot: string };

export type SlotTemplate = { key: string; name: string; round: number; a: Source; b: Source };

export type BracketTemplate = { id: string; name: string; summary: string; needs: string; slots: SlotTemplate[] };

const rank = (r: number, pool: string | null = null): Source => ({ type: 'rank', pool, rank: r });
const winner = (slot: string): Source => ({ type: 'winner', slot });
const loser = (slot: string): Source => ({ type: 'loser', slot });

export const BRACKETS: BracketTemplate[] = [
  {
    id: 'top4',
    name: 'Top 4 playoffs',
    summary: 'Semis 1 v 4 and 2 v 3, then a final and 3rd place',
    needs: 'At least 4 teams in the standings',
    slots: [
      { key: 'sf1', name: 'Semi-final 1', round: 1, a: rank(1), b: rank(4) },
      { key: 'sf2', name: 'Semi-final 2', round: 1, a: rank(2), b: rank(3) },
      { key: 'final', name: 'Final', round: 2, a: winner('sf1'), b: winner('sf2') },
      { key: 'third', name: '3rd place', round: 2, a: loser('sf1'), b: loser('sf2') },
    ],
  },
  {
    id: 'top8',
    name: 'Top 8 playoffs',
    summary: 'Quarters 1v8, 4v5, 2v7, 3v6, then semis, final and 3rd place',
    needs: 'At least 8 teams in the standings',
    slots: [
      { key: 'qf1', name: 'Quarter-final 1', round: 1, a: rank(1), b: rank(8) },
      { key: 'qf2', name: 'Quarter-final 2', round: 1, a: rank(4), b: rank(5) },
      { key: 'qf3', name: 'Quarter-final 3', round: 1, a: rank(2), b: rank(7) },
      { key: 'qf4', name: 'Quarter-final 4', round: 1, a: rank(3), b: rank(6) },
      { key: 'sf1', name: 'Semi-final 1', round: 2, a: winner('qf1'), b: winner('qf2') },
      { key: 'sf2', name: 'Semi-final 2', round: 2, a: winner('qf3'), b: winner('qf4') },
      { key: 'final', name: 'Final', round: 3, a: winner('sf1'), b: winner('sf2') },
      { key: 'third', name: '3rd place', round: 3, a: loser('sf1'), b: loser('sf2') },
    ],
  },
  {
    id: 'crossover2',
    name: 'Crossovers from 2 pools',
    summary: 'A1 v B2 and B1 v A2, then a final and 3rd place; A3 v B3 for 5th',
    needs: 'Pools A and B with at least 2 teams each',
    slots: [
      { key: 'x1', name: 'Crossover 1', round: 1, a: rank(1, 'A'), b: rank(2, 'B') },
      { key: 'x2', name: 'Crossover 2', round: 1, a: rank(1, 'B'), b: rank(2, 'A') },
      { key: 'fifth', name: '5th place', round: 1, a: rank(3, 'A'), b: rank(3, 'B') },
      { key: 'final', name: 'Final', round: 2, a: winner('x1'), b: winner('x2') },
      { key: 'third', name: '3rd place', round: 2, a: loser('x1'), b: loser('x2') },
    ],
  },
];

/** How a side is described before its team is known: "1st overall", "2nd Pool B", "Winner of Semi-final 1". */
export function describeSource(s: Source, slotName: (key: string) => string) {
  if (s.type === 'rank') {
    const ord = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][s.rank] ?? `${s.rank}th`;
    return s.pool ? `${ord} Pool ${s.pool}` : `${ord} overall`;
  }
  return `${s.type === 'winner' ? 'Winner' : 'Loser'} of ${slotName(s.slot)}`;
}

/**
 * Work out which team fills a side, or null if it isn't decided yet.
 * Rank sources wait until every pool-stage game in that pool (or the whole event) is finished.
 */
export function resolveSource(
  s: Source,
  ctx: {
    rankings: (pool: string | null) => string[] | null;
    result: (slotKey: string) => { winner: string; loser: string } | null;
  },
) {
  if (s.type === 'rank') return ctx.rankings(s.pool)?.[s.rank - 1] ?? null;
  const r = ctx.result(s.slot);
  if (!r) return null;
  return s.type === 'winner' ? r.winner : r.loser;
}
