/** One finished game from a player's point of view. */
export type PlayerGameLine = {
  date: string | null;
  eventId: string | null;
  eventName: string | null;
  teamId: string;
  teamName: string;
  goals: number;
  assists: number;
  intercepts: number;
  points: number;
  plusMinus: number;
};

export type CompetitionLine = {
  eventId: string | null;
  name: string;
  teamId: string;
  teamName: string;
  games: number;
  goals: number;
  assists: number;
  intercepts: number;
  points: number;
  plusMinus: number;
};
export type SeasonLine = Omit<CompetitionLine, 'eventId' | 'name' | 'teamId' | 'teamName'> & { year: number | null; competitions: CompetitionLine[] };

const empty = () => ({
  games: 0,
  goals: 0,
  assists: 0,
  intercepts: 0,
  points: 0,
  plusMinus: 0,
});
function add(t: ReturnType<typeof empty>, g: PlayerGameLine) {
  t.games += 1;
  t.goals += g.goals;
  t.assists += g.assists;
  t.intercepts += g.intercepts;
  t.points += g.points;
  t.plusMinus += g.plusMinus;
}

/**
 * A player's games grouped by season (calendar year, newest first), then by league / tournament and
 * team. Games outside any event (friendlies, scrimmages, pickups) group as "Friendlies & pickups".
 */
export function playerSeasons(games: PlayerGameLine[]): SeasonLine[] {
  const years = new Map<number | null, { total: ReturnType<typeof empty>; comps: Map<string, CompetitionLine> }>();
  for (const g of games) {
    const year = g.date ? Number(g.date.slice(0, 4)) : null;
    if (!years.has(year)) years.set(year, { total: empty(), comps: new Map() });
    const y = years.get(year)!;
    add(y.total, g);
    const key = `${g.eventId ?? '-'}|${g.teamId}`;
    if (!y.comps.has(key))
      y.comps.set(key, {
        eventId: g.eventId,
        name: g.eventName ?? 'Friendlies & pickups',
        teamId: g.teamId,
        teamName: g.teamName,
        ...empty(),
      });
    add(y.comps.get(key)!, g);
  }
  return [...years.entries()]
    .sort(([a], [b]) => (b ?? 0) - (a ?? 0))
    .map(([year, y]) => ({
      year,
      ...y.total,
      competitions: [...y.comps.values()].sort((a, b) => Number(!a.eventId) - Number(!b.eventId) || b.games - a.games),
    }));
}
