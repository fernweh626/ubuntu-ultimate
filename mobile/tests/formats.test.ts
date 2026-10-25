import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import { buildBracket, orderTable, swissRound } from '@/domain/formats';
import { rulesFor } from '@/domain/rules';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x));
(async () => {
  // head-to-head
  const rows = [
    { teamId: 'A', wins: 2, draws: 0, losses: 1, pointsFor: 30, pointsAgainst: 20 },
    { teamId: 'B', wins: 2, draws: 0, losses: 1, pointsFor: 40, pointsAgainst: 20 },
    { teamId: 'C', wins: 1, draws: 1, losses: 1, pointsFor: 30, pointsAgainst: 30 },
    { teamId: 'D', wins: 0, draws: 1, losses: 2, pointsFor: 10, pointsAgainst: 40 },
  ];
  const ord = orderTable(rows, [{ a: 'A', b: 'B', scoreA: 15, scoreB: 13 }]);
  ok('head-to-head beats point difference; a draw counts half', ord.join('') === 'ABCD', ord);
  const st = ['a', 'b', 'c', 'd', 'e', 'f'].map((t, i) => ({ teamId: t, wins: 5 - i, losses: i, diff: 0, pointsFor: 0 }));
  ok('swiss still avoids rematches', !swissRound(st, new Set(['a|b', 'b|a']), new Set()).pairs.some(([x, y]) => x === 'a' && y === 'b'));

  const db: any = open();
  await migrate(db);
  await seedIfEmpty(db);
  const all = (await repo.listTeams(db)).filter((t) => !t.is_sample);
  let evN = 0;
  const playOut = async (ev: string) => {
    // The better seed always wins: the worse-seeded team forfeits.
    const seedOf = new Map((await repo.eventTeams(db, ev)).map((t) => [t.id, t.seed ?? 99]));
    for (let guard = 0; guard < 40; guard++) {
      const open = (await repo.listGamesForEvent(db, ev)).filter((g) => g.stage === 'playoff' && g.status === 'scheduled');
      if (!open.length) break;
      for (const g of open) await repo.forfeitGame(db, g.id, seedOf.get(g.team_a_id)! > seedOf.get(g.team_b_id)! ? g.team_a_id : g.team_b_id, 'other', null);
    }
  };
  for (const n of [2, 3, 4, 5, 6, 7, 8, 11, 12, 16]) {
    const teams = all.slice(0, n);
    const ev = await repo.saveEvent(db, { name: `KO ${++evN}`, kind: 'tournament', level: 'regional', division: 'mixed', teams: teams.map((t, i) => ({ teamId: t.id, pool: null, seed: i + 1 })) });
    await repo.createBracket(db, ev, buildBracket(n, 'seed', true));
    await playOut(ev);
    const { placings, decided } = await repo.finalPlacings(db, ev);
    const places = placings.map((p) => p.place);
    const bySeed = placings.every((p) => teams.findIndex((t) => t.id === p.teamId) + 1 === p.place);
    ok(
      `full placement ${n} teams: decided, places 1..${n} once each, results follow seeds`,
      decided && places.length === n && new Set(places).size === n && Math.max(...places) === n && bySeed,
      placings.map((p) => [p.place, teams.findIndex((t) => t.id === p.teamId) + 1]),
    );
  }
  // top-4 only with 6 teams: places 1-4 from bracket, 5-6 from standings
  {
    const teams = all.slice(0, 6);
    const ev = await repo.saveEvent(db, { name: 'Top4', kind: 'tournament', level: 'regional', division: 'mixed', teams: teams.map((t, i) => ({ teamId: t.id, pool: null, seed: i + 1 })) });
    const tmpl = buildBracket(4, 'seed', false);
    ok(
      'top 4 = 2 semis + final + 3rd place',
      tmpl.length === 4 &&
        tmpl
          .filter((s) => s.place != null)
          .map((s) => s.place)
          .sort()
          .join() === '1,3',
    );
    await repo.createBracket(db, ev, tmpl);
    const slots = await repo.bracketSlots(db, ev);
    const finalSlot = slots.find((s) => s.name === 'Final')!;
    await repo.scheduleSlot(db, finalSlot.id, '2027-03-07T11:00:00.000Z', null);
    await playOut(ev);
    const finId = (await repo.bracketSlots(db, ev)).find((s) => s.name === 'Final')!.game_id;
    const fin = (await repo.listGamesForEvent(db, ev)).find((g) => g.id === finId);
    ok('final pre-scheduled before teams known keeps its time', fin?.scheduled_at === '2027-03-07T11:00:00.000Z', fin?.scheduled_at);
    const { placings } = await repo.finalPlacings(db, ev);
    ok('6 teams, top-4 playoff: 6 placings', placings.length === 6 && placings.map((p) => p.place).join() === '1,2,3,4,5,6', placings);
  }
  // crossovers by pool position from pool play
  {
    const teams = all.slice(0, 6);
    const ev = await repo.saveEvent(db, {
      name: 'Pools',
      kind: 'tournament',
      level: 'regional',
      division: 'mixed',
      teams: teams.map((t, i) => ({ teamId: t.id, pool: i < 3 ? 'A' : 'B', seed: i + 1 })),
    });
    const fx: any[] = [];
    for (const [x, y] of [
      [0, 1],
      [0, 2],
      [1, 2],
      [3, 4],
      [3, 5],
      [4, 5],
    ])
      fx.push({ eventId: ev, homeId: teams[x].id, awayId: teams[y].id, scheduledAt: null, venueId: null, rules: rulesFor('wfdf', 'mixed'), stage: 'pool' });
    const ids = await repo.createFixtures(db, fx);
    await repo.createBracket(db, ev, buildBracket(4, 'pools', false));
    ok('crossovers wait for pools', (await repo.listGamesForEvent(db, ev)).filter((g) => g.stage === 'playoff').length === 0);
    for (const id of ids) {
      const g = (await repo.getGameListItem(db, id))!;
      await repo.forfeitGame(db, id, g.team_b_id, 'other', null);
    }
    const semis = (await repo.listGamesForEvent(db, ev)).filter((g) => g.stage === 'playoff');
    // A1=t0, B1=t3, A2=t1, B2=t4 → semis A1 v B2, B1 v A2
    ok(
      'crossover semis A1 v B2 and B1 v A2',
      semis.length === 2 && semis.some((g) => g.team_a_id === teams[0].id && g.team_b_id === teams[4].id) && semis.some((g) => g.team_a_id === teams[3].id && g.team_b_id === teams[1].id),
      semis.map((g) => `${g.a_name} v ${g.b_name}`),
    );
  }
})();
