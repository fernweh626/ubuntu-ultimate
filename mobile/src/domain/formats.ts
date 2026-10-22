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

/* ---------------- Standings with head-to-head ---------------- */

export type Result = { a: string; b: string; scoreA: number; scoreB: number };
export type TableRow = { teamId: string; wins: number; draws: number; losses: number; pointsFor: number; pointsAgainst: number };

/**
 * Order a table: most wins (a draw is half a win), then — among teams still level — head-to-head wins
 * between just those teams, head-to-head point difference, overall point difference, points scored.
 */
export function orderTable(rows: TableRow[], results: Result[]): string[] {
  const pts = (r: TableRow) => r.wins + r.draws / 2;
  const byPts = new Map<number, TableRow[]>();
  rows.forEach((r) => byPts.set(pts(r), [...(byPts.get(pts(r)) ?? []), r]));
  const out: string[] = [];
  for (const level of [...byPts.keys()].sort((x, y) => y - x)) {
    const tied = byPts.get(level)!;
    if (tied.length === 1) {
      out.push(tied[0].teamId);
      continue;
    }
    const ids = new Set(tied.map((t) => t.teamId));
    const h2h = new Map<string, { w: number; d: number }>();
    for (const r of results) {
      if (!ids.has(r.a) || !ids.has(r.b)) continue;
      const a = h2h.get(r.a) ?? { w: 0, d: 0 };
      const b = h2h.get(r.b) ?? { w: 0, d: 0 };
      if (r.scoreA > r.scoreB) a.w += 1;
      else if (r.scoreB > r.scoreA) b.w += 1;
      a.d += r.scoreA - r.scoreB;
      b.d += r.scoreB - r.scoreA;
      h2h.set(r.a, a);
      h2h.set(r.b, b);
    }
    const get = (id: string) => h2h.get(id) ?? { w: 0, d: 0 };
    tied
      .sort(
        (x, y) =>
          get(y.teamId).w - get(x.teamId).w ||
          get(y.teamId).d - get(x.teamId).d ||
          y.pointsFor - y.pointsAgainst - (x.pointsFor - x.pointsAgainst) ||
          y.pointsFor - x.pointsFor,
      )
      .forEach((t) => out.push(t.teamId));
  }
  return out;
}

/* ---------------- Playoff brackets ---------------- */

/**
 * Where a bracket side comes from:
 * - rank: position in the standings, overall (pool null) or in one pool
 * - pools: interleaved pool positions A1, B1, A2, B2, … (crossover seeding)
 * - seed: the coordinator's seeding, for straight knockouts with no pool play
 * - winner / loser of another slot
 * - none: an empty spot (a bye)
 */
export type Source =
  | { type: 'rank'; pool: string | null; rank: number }
  | { type: 'pools'; rank: number }
  | { type: 'seed'; rank: number }
  | { type: 'winner'; slot: string }
  | { type: 'loser'; slot: string }
  | { type: 'none' };

export type SlotTemplate = { key: string; name: string; group: string; round: number; place: number | null; a: Source; b: Source };

export type SeedMode = 'standings' | 'pools' | 'seed';

const ORD = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** Bracket order so 1 and 2 can only meet in the final: 8 → [1,8,4,5,2,7,3,6]. */
function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((x) => [x, n + 1 - x]);
  }
  return order;
}

const roundName = (size: number) => (size === 2 ? 'Final' : size === 4 ? 'Semi-final' : size === 8 ? 'Quarter-final' : `Round of ${size}`);

/**
 * Build a playoff bracket for `teams` entrants (byes fill it up to a power of two).
 * full = every team plays for a final place (5th–8th, 9th–16th …); otherwise the winners' bracket plus 3rd place.
 */
export function buildBracket(teams: number, mode: SeedMode, full: boolean): SlotTemplate[] {
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, teams)));
  const seedSource = (n: number): Source =>
    n > teams ? { type: 'none' } : mode === 'pools' ? { type: 'pools', rank: n } : mode === 'seed' ? { type: 'seed', rank: n } : { type: 'rank', pool: null, rank: n };
  const slots: SlotTemplate[] = [];
  let key = 0;

  const build = (entrants: Source[], placeLo: number, round: number, firstRound: boolean) => {
    const m = entrants.length;
    const group = placeLo === 1 ? 'Championship' : `${ORD(placeLo)}–${ORD(placeLo + m - 1)}`;
    // Places past the number of teams only ever hold byes — skip them.
    if (placeLo > teams) return;
    if (m === 2) {
      slots.push({
        key: `s${key++}`,
        name: placeLo === 1 ? 'Final' : `${ORD(placeLo)} place`,
        group,
        round,
        place: placeLo,
        a: entrants[0],
        b: entrants[1],
      });
      return;
    }
    const pairs: [Source, Source][] = [];
    if (firstRound) {
      const order = seedOrder(m);
      for (let i = 0; i < m; i += 2) pairs.push([entrants[order[i] - 1], entrants[order[i + 1] - 1]]);
    } else {
      for (let i = 0; i < m; i += 2) pairs.push([entrants[i], entrants[i + 1]]);
    }
    const games = pairs.map(([a, b], i) => {
      const k = `s${key++}`;
      const label = placeLo === 1 ? `${roundName(m)} ${i + 1}` : `${group} ${m === 4 ? 'semi' : 'round'} ${i + 1}`;
      slots.push({ key: k, name: label, group, round, place: null, a, b });
      return k;
    });
    build(games.map((g) => ({ type: 'winner', slot: g })), placeLo, round + 1, false);
    if (full || m === 4) build(games.map((g) => ({ type: 'loser', slot: g })), placeLo + m / 2, round + 1, false);
  };

  build(Array.from({ length: size }, (_, i) => seedSource(i + 1)), 1, 1, true);
  return slots;
}

/** How a side is described before its team is known: "1st overall", "A2", "Seed 3", "Winner of Semi-final 1". */
export function describeSource(s: Source, slotName: (key: string) => string) {
  switch (s.type) {
    case 'rank':
      return s.pool ? `${ORD(s.rank)} Pool ${s.pool}` : `${ORD(s.rank)} overall`;
    case 'pools':
      return `${ORD(s.rank)} by pool position`;
    case 'seed':
      return `Seed ${s.rank}`;
    case 'none':
      return 'Bye';
    default:
      return `${s.type === 'winner' ? 'Winner' : 'Loser'} of ${slotName(s.slot)}`;
  }
}

/** Marks a side that will never have a team (a bye, or the loser of a game that was a bye). */
export const NOBODY = '__nobody__';

/**
 * Which team fills a side: a team id, NOBODY, or null if not decided yet.
 */
export function resolveSource(
  s: Source,
  ctx: {
    rankings: (pool: string | null) => string[] | null;
    poolOrder: () => string[] | null;
    seeds: () => string[];
    result: (slotKey: string) => { winner: string; loser: string } | null;
  },
): string | null {
  switch (s.type) {
    case 'none':
      return NOBODY;
    case 'rank':
      return ctx.rankings(s.pool)?.[s.rank - 1] ?? null;
    case 'pools': {
      const order = ctx.poolOrder();
      return order ? (order[s.rank - 1] ?? NOBODY) : null;
    }
    case 'seed':
      return ctx.seeds()[s.rank - 1] ?? NOBODY;
    default: {
      const r = ctx.result(s.slot);
      if (!r) return null;
      return s.type === 'winner' ? r.winner : r.loser;
    }
  }
}
