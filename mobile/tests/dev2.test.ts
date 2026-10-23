import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import * as dev from '@/db/development';
import { loadFinishedGames, peopleById } from '@/db/reports';
import { planNotifications } from '@/notify/plan';
import { deriveState } from '@/domain/engine';
import { csv, eventsCsv, gamesCsv, playerGamesCsv, pointsCsv } from '@/domain/export';
import { rulesFor } from '@/domain/rules';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x));
(async () => {
  const db: any = open(); await migrate(db); await seedIfEmpty(db);
  const ts = await repo.listTeams(db); const light = ts.find((t) => t.name === 'Sample Light')!, dark = ts.find((t) => t.name === 'Sample Dark')!;
  const rl = await repo.roster(db, light.id), rd = await repo.roster(db, dark.id);
  const me = rl[0].id; await repo.setMeId(db, me);
  const now = new Date('2026-10-23T10:00:00');
  await dev.saveAccreditation(db, me, { level: 'advanced', expiresOn: '2027-05-31', photoUri: null });
  await dev.addSelfRating(db, me, { experience: 3, throwing: 4, receiving: 3, defence: 3, athleticism: 4, notes: null });
  let plan = await planNotifications(db, now);
  const acc = plan.filter((p) => p.kind === 'accreditation');
  ok('accreditation: 6 months, 1 month, 1 week, day of', acc.length === 4 && acc[0].at.getMonth() === 10 && acc[0].at.getDate() === 30, acc.map((a) => a.at.toDateString()));
  ok('rating due in six months', plan.some((p) => p.kind === 'development' && p.at.getFullYear() === 2027 && p.at.getMonth() === 3));
  const [g] = await repo.createFixtures(db, [{ eventId: null, homeId: light.id, awayId: dark.id, scheduledAt: new Date('2026-11-01T09:00:00').toISOString(), venueId: null, rules: rulesFor('league', 'mixed') }]);
  plan = await planNotifications(db, now);
  const av = plan.find((p) => p.key.startsWith(`avail:${g}`));
  ok('availability ask 5 days before', !!av && av.at.getDate() === 27, av);
  await dev.setAvailability(db, g, light.id, me, 'available');
  ok('answering removes the ask', !(await planNotifications(db, now)).some((p) => p.key.startsWith('avail:')));

  // play a quick game with a sub and export
  const gid = await repo.createGame(db, { eventId: null, venueId: null, teamAId: light.id, teamBId: dark.id, trackingMode: 'lite', rules: rulesFor('wfdf', 'mixed'), firstPullTeamId: light.id, ratioPoint1: 'W', squads: [...rl.map((p) => ({ teamId: light.id, personId: p.id, jersey: p.jersey_number, position: null })), ...rd.map((p) => ({ teamId: dark.id, personId: p.id, jersey: p.jersey_number, position: null }))] });
  const L = (r: any[]) => [...r.filter((p) => p.gender === 'W').slice(0, 4), ...r.filter((p) => p.gender === 'M').slice(0, 3)].map((p) => p.id);
  for (let i = 0; i < 3; i++) {
    let d = (await repo.loadGameData(db, gid))!; const st = deriveState(d);
    await repo.setLine(db, st.point!.id, light.id, L(rl)); await repo.setLine(db, st.point!.id, dark.id, L(rd));
    await repo.pull(db, gid, st.point!.id);
    if (i === 1) {
      const out = L(rl)[0]; const inn = rl.find((p) => !L(rl).includes(p.id) && p.gender === 'W')!.id;
      await repo.substitute(db, gid, st.point!.id, light.id, out, inn, 'injury');
      const dd = (await repo.loadGameData(db, gid))!;
      const onNow = (await db.getAllAsync('SELECT person_id FROM point_player WHERE point_id = ? AND team_id = ?', st.point!.id, light.id)).map((r: any) => r.person_id);
      ok('injury sub: event with reason', dd.events.some((e) => e.type === 'injury_sub' && e.value === 'injury'));
      ok('injury sub: player marked injured', dd.players.find((p) => p.person_id === out)!.status === 'injured');
      ok('injury sub: line updated (out off, sub on)', !onNow.includes(out) && onNow.includes(inn), onNow);
    }
    d = (await repo.loadGameData(db, gid))!;
    await repo.scorePoint(db, d, i % 2 ? dark.id : light.id, { scorerId: (i % 2 ? rd : rl)[1].id, assistId: (i % 2 ? rd : rl)[2].id });
  }
  await repo.endGame(db, (await repo.loadGameData(db, gid))!);
  const games = await loadFinishedGames(db, await repo.listGamesForTeam(db, light.id));
  const people = await peopleById(db, [...rl, ...rd].map((p) => p.id));
  const gc = gamesCsv(games).split('\r\n');
  ok('games.csv: header + 1 row, score 2-1', gc.length === 3 && gc[1].includes(',2,1,'), gc[1]);
  const pc = playerGamesCsv(games, people, light.id).split('\r\n').filter(Boolean);
  ok('player-games.csv only my team', pc.length > 2 && pc.slice(1).every((r) => r.includes('Sample Light,Sample Dark')), pc.slice(0, 2));
  const pts = pointsCsv(games, people).split('\r\n').filter(Boolean);
  ok('points.csv: 3 points with F1/M1 ratio', pts.length === 4 && pts[1].includes(',F1,') && pts[2].includes(',M1,'), pts.slice(0, 3));
  ok('events.csv includes the sub', eventsCsv(games, people).includes('injury_sub'));
  ok('csv escaping', csv([['a,b', 'say "hi"', null]]).includes('"a,b","say ""hi""",'));
  ok('no emails in exports', !(gamesCsv(games) + playerGamesCsv(games, people) + pointsCsv(games, people) + eventsCsv(games, people)).includes('@'));
})();
