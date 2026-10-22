import type { SQLiteDatabase } from 'expo-sqlite';

import type { GameData } from '@/domain/engine';
import {
  addGameToAggregate,
  addPlayerStats,
  computeGameStats,
  emptyAggregate,
  emptyPlayer,
  type GameStats,
  type PlayerGameStats,
  type TeamAggregate,
} from '@/domain/stats';

import { loadGameData, personCols, type GameListItem } from './repo';
import type { Person } from './types';

export type LoadedGame = { item: GameListItem; data: GameData; stats: GameStats };

export async function loadFinishedGames(db: SQLiteDatabase, items: GameListItem[]): Promise<LoadedGame[]> {
  const finished = items.filter((g) => g.status === 'final');
  const out: LoadedGame[] = [];
  for (const item of finished) {
    const data = await loadGameData(db, item.id);
    if (data) out.push({ item, data, stats: computeGameStats(data) });
  }
  return out;
}

export function teamAggregate(teamId: string, games: LoadedGame[]): TeamAggregate {
  const agg = emptyAggregate(teamId);
  for (const g of [...games].sort((a, b) => (a.item.started_at ?? '').localeCompare(b.item.started_at ?? ''))) {
    addGameToAggregate(agg, g.data.game, g.stats);
  }
  return agg;
}

export type PlayerTotals = PlayerGameStats & { games: number };

/** Sum player stats across games, optionally only for one team. */
export function playerTotals(games: LoadedGame[], teamId?: string): Map<string, PlayerTotals> {
  const totals = new Map<string, PlayerTotals>();
  for (const g of games) {
    for (const s of Object.values(g.stats.players)) {
      if (teamId && s.teamId !== teamId) continue;
      if (!totals.has(s.personId)) totals.set(s.personId, { ...emptyPlayer(s.personId, s.teamId), games: 0 });
      const t = totals.get(s.personId)!;
      addPlayerStats(t, s);
      if (s.points > 0 || s.goals || s.assists || s.intercepts) t.games += 1;
    }
  }
  return totals;
}

export async function peopleById(db: SQLiteDatabase, ids: string[]) {
  if (ids.length === 0) return new Map<string, Person>();
  const rows = await db.getAllAsync<Person>(
    `SELECT ${personCols()} FROM person WHERE id IN (${ids.map(() => '?').join(',')})`,
    ...ids,
  );
  return new Map(rows.map((p) => [p.id, p]));
}
