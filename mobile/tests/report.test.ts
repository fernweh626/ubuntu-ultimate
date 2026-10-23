import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import { loadFinishedGames } from '@/db/reports';
import { deriveState } from '@/domain/engine';
import { rulesFor } from '@/domain/rules';
import { biggestRun, connections, gameLine, pace, squadTotals, teamTotals } from '@/domain/report';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x));
(async () => {
  const db: any = open(); await migrate(db); await seedIfEmpty(db);
  const teams = await repo.listTeams(db);
  const light = teams.find((t) => t.name === 'Sample Light')!, dark = teams.find((t) => t.name === 'Sample Dark')!;
  const rl = await repo.roster(db, light.id), rd = await repo.roster(db, dark.id);
  const ev = await repo.saveEvent(db, { name: 'Cup', kind: 'tournament', level: 'regional', division: 'mixed', teams: [{ teamId: light.id, pool: 'A' }, { teamId: dark.id, pool: 'A' }] });
  const gid = await repo.createGame(db, { eventId: ev, venueId: null, teamAId: light.id, teamBId: dark.id, trackingMode: 'standard', rules: rulesFor('wfdf', 'mixed'), firstPullTeamId: light.id, ratioPoint1: 'W',
    squads: [...rl, ...rd].map((p) => ({ teamId: rl.includes(p) ? light.id : dark.id, personId: p.id, jersey: p.jersey_number, position: p.position })) });
  const L = (r: any[]) => [...r.filter((p) => p.gender === 'W').slice(0, 4), ...r.filter((p) => p.gender === 'M').slice(0, 3)].map((p) => p.id);
  // pattern: light scores 3, dark 1, repeat; varied scorers
  const who = [light.id, light.id, light.id, dark.id];
  for (let i = 0; i < 40; i++) {
    let data = (await repo.loadGameData(db, gid))!; const st = deriveState(data);
    await repo.setLine(db, st.point!.id, light.id, L(rl)); await repo.setLine(db, st.point!.id, dark.id, L(rd));
    await repo.pull(db, gid, st.point!.id);
    data = (await repo.loadGameData(db, gid))!;
    const t = who[i % 4]; const r = t === light.id ? rl : rd;
    const r2 = await repo.scorePoint(db, data, t, { scorerId: r[(i % 3) + 1].id, assistId: r[i % 2 ? 0 : 5].id });
    if (r2.gameOver) break;
  }
  await repo.endGame(db, (await repo.loadGameData(db, gid))!);
  const games = await loadFinishedGames(db, await repo.listGamesForEvent(db, ev));
  const g = games[0];
  const line = gameLine(g, light.id, null);
  ok('game line result', line.result === 'W' && line.for === 15, line);
  ok('halftime captured and sums sensibly', !!line.half1 && line.half1.for === 8 && line.half1.for <= line.for, line.half1);
  const run = biggestRun(g)!;
  ok('biggest run 3 by light', run.n === 3 && run.teamId === light.id, run);
  const gender = (id: string) => [...rl, ...rd].find((p) => p.id === id)!.gender;
  const c = connections(games, light.id, gender);
  ok('connections count every assisted light goal', c.assisted === 15, c.assisted);
  ok('gender split adds up', Object.values(c.byGender).reduce((a, b) => a + b, 0) === 15, c.byGender);
  const sq = squadTotals(games, light.id);
  ok('squad includes all 12 and goals sum to 15', sq.length === 12 && sq.reduce((a, s) => a + s.goals, 0) === 15, sq.length);
  const tt = teamTotals(games, light.id);
  ok('holds+breaks = 15', tt.holds + tt.breaks === 15, tt);
  const pc = pace(games, light.id, (id) => id);
  ok('pace has a dot per point', pc.points.length === line.for + line.against, pc.points.length);
})();
