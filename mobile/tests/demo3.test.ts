import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { ensureDemoContent, ensureStarterContent, seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import * as hats from '@/db/hats';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x).slice(0, 300));
(async () => {
  const db: any = open();
  await migrate(db);
  await seedIfEmpty(db);
  await ensureStarterContent(db);
  await ensureDemoContent(db);
  ok('demo v3 loads, FKs hold', (await db.getFirstAsync(`SELECT value FROM app_meta WHERE key = 'demo_version'`)).value === '3' && (await db.getAllAsync('PRAGMA foreign_key_check')).length === 0);
  // a v1 phone upgrading: pretend version 1, run again → only adds
  await db.runAsync(`UPDATE app_meta SET value = '1' WHERE key = 'demo_version'`);
  const before = (await db.getFirstAsync('SELECT COUNT(*) n FROM game')).n;
  await ensureDemoContent(db);
  ok('v1 → v2 adds, no duplicates', (await db.getFirstAsync('SELECT COUNT(*) n FROM game')).n === before);
  const list = await hats.listHats(db);
  const beach = list.find((h) => h.name.startsWith('Clifton'))!,
    winter = list.find((h) => h.name.startsWith('Winter'))!;
  ok(
    'two demo hats; beach open with ~40 coming',
    !!beach && beach.hat_status === 'signups' && beach.signups > 30 && !!winter && winter.hat_status === 'drawn',
    list.map((h) => [h.name, h.signups, h.hat_status]),
  );
  ok('beach hat is the beach division, 5v5', (await repo.getEvent(db, beach.id))!.division === 'beach' && JSON.parse(beach.rules_json!).playersPerSide === 5);
  const pool = hats.drawPool(await hats.hatSignups(db, beach.id));
  ok('beach hat has a drawable pool with willing captains', pool.length > 20 && pool.some((p) => p.wantsCaptain));
  const wt = await hats.hatTeams(db, winter.id);
  ok('winter hat: 4 teams with captains', new Set(wt.map((t) => t.team_id)).size === 4 && wt.filter((t) => t.role === 'captain').length === 4);
  const wg = await repo.listGamesForEvent(db, winter.id);
  ok(
    'winter results: final scores, a winner-only and a no-score game',
    wg.filter((g) => g.result_mode === 'score').length === 4 && wg.some((g) => g.result_mode === 'winner') && wg.some((g) => g.result_mode === 'none'),
  );
  const rank = await repo.eventRankings(db, winter.id);
  ok('standings count W/L but ignore "just played"', (rank.standings as any[]).reduce((a: number, r: any) => a + r.wins + r.losses + r.draws, 0) === 10, rank.standings);
  ok('hat teams stay off the Teams list', !(await repo.listTeams(db)).some((t) => t.kind === 'hat'));
})();
