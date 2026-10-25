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
  ok('demo v4 loads, FKs hold', (await db.getFirstAsync(`SELECT value FROM app_meta WHERE key = 'demo_version'`)).value === '4' && (await db.getAllAsync('PRAGMA foreign_key_check')).length === 0);
  // a v1 phone upgrading: pretend version 1, run again → only adds
  await db.runAsync(`UPDATE app_meta SET value = '1' WHERE key = 'demo_version'`);
  const before = (await db.getFirstAsync('SELECT COUNT(*) n FROM game')).n;
  await ensureDemoContent(db);
  ok('v1 → v2 adds, no duplicates', (await db.getFirstAsync('SELECT COUNT(*) n FROM game')).n === before);
  // A phone that had the old (export-based) demo: its rows are deleted when v4 loads, with anything hanging off them.
  const demo = require('@/content/demo/demo-2026.json');
  const [oldPerson] = demo.purge.person,
    [oldGame] = demo.purge.game,
    [oldTeam] = demo.purge.team;
  const legends = (await repo.listTeams(db)).find((t: any) => t.name === 'Chilli Legends')!;
  await db.runAsync(`INSERT INTO person (id, first_name, last_name, created_at, updated_at) VALUES (?, 'Old', 'Demo', 'x', 'x')`, oldPerson);
  await db.runAsync(`INSERT INTO team (id, name, kind, created_at, updated_at) VALUES (?, 'Old res team', 'university', 'x', 'x')`, oldTeam);
  await db.runAsync(`INSERT INTO membership (id, person_id, team_id, kind, role, created_at, updated_at) VALUES ('m-old', ?, ?, 'core', 'player', 'x', 'x')`, oldPerson, oldTeam);
  await db.runAsync(
    `INSERT INTO game (id, team_a_id, team_b_id, status, tracking_mode, rules_json, first_pull_team_id, created_at, updated_at) VALUES (?, ?, ?, 'final', 'lite', '{}', ?, 'x', 'x')`,
    oldGame,
    oldTeam,
    legends.id,
    oldTeam,
  );
  await db.runAsync(`INSERT INTO game_player (id, game_id, team_id, person_id) VALUES ('gp-old', ?, ?, ?)`, oldGame, oldTeam, oldPerson);
  await db.runAsync('DELETE FROM sync_outbox');
  await db.runAsync(`UPDATE app_meta SET value = '3' WHERE key = 'demo_version'`);
  await ensureDemoContent(db);
  const gone = await Promise.all(
    [
      ['person', oldPerson],
      ['team', oldTeam],
      ['game', oldGame],
      ['membership', 'm-old'],
      ['game_player', 'gp-old'],
    ].map(([t, id]) => db.getFirstAsync(`SELECT 1 FROM ${t} WHERE id = ?`, id)),
  );
  ok(
    'old demo rows (and what hangs off them) are deleted',
    gone.every((x) => !x),
    gone,
  );
  ok('nothing queued to upload by the clean-up', !(await db.getFirstAsync(`SELECT 1 FROM sync_outbox WHERE pk LIKE ?`, `%${oldPerson}%`)));
  ok('FKs still hold after the clean-up', (await db.getAllAsync('PRAGMA foreign_key_check')).length === 0);
  ok('no spreadsheet events left', !(await repo.listEvents(db)).some((e: any) => /Regionals|Residence/.test(e.name)));
  ok(
    'the made-up Demo Cup final is scored in full mode',
    (await db.getFirstAsync(`SELECT COUNT(*) n FROM game g JOIN event e ON e.id = g.event_id WHERE e.name = 'Demo Cup 2026' AND g.tracking_mode = 'full'`)).n === 1,
  );
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
