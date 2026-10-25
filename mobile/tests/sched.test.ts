import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import { loadFinishedGames, teamAggregate } from '@/db/reports';
import { assignSlots, canPostpone, parseSchedule, roundRobin } from '@/domain/fixtures';
import { rulesFor } from '@/domain/rules';
import { deriveState } from '@/domain/engine';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, x);
(async () => {
  // Round robin fairness
  for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10, 12]) {
    const ids = Array.from({ length: n }, (_, i) => `t${i}`);
    const p = roundRobin(ids);
    const pairs = new Set(p.map((x) => [x.homeId, x.awayId].sort().join('-')));
    const homes = ids.map((id) => p.filter((x) => x.homeId === id).length);
    const perRound = new Map<number, string[]>();
    p.forEach((x) => perRound.set(x.round, [...(perRound.get(x.round) ?? []), x.homeId, x.awayId]));
    const noDouble = [...perRound.values()].every((ts) => new Set(ts).size === ts.length);
    ok(
      `RR ${n} teams: every pair once, no team twice a round, home balanced`,
      pairs.size === (n * (n - 1)) / 2 && p.length === pairs.size && noDouble && Math.max(...homes) - Math.min(...homes) <= 1,
      homes,
    );
  }
  const twice = roundRobin(['a', 'b', 'c', 'd'], 2);
  ok('double RR flips home', twice.length === 12 && ['a-b', 'b-a'].every((k) => twice.some((x) => `${x.homeId}-${x.awayId}` === k)));
  const slotted = assignSlots(roundRobin(['a', 'b', 'c', 'd']), '2027-03-06', 7, [
    { venueId: 'p1', time: '18:00' },
    { venueId: 'p2', time: '18:00' },
  ]);
  const d = (iso: string) => new Date(iso);
  ok(
    'round 1 both fields 18:00 on 6 Mar, round 2 a week later',
    d(slotted[0].scheduledAt).getDate() === 6 &&
      slotted[0].venueId === 'p1' &&
      slotted[1].venueId === 'p2' &&
      d(slotted[0].scheduledAt).getHours() === 18 &&
      d(slotted[2].scheduledAt).getDate() === 13,
  );

  const db: any = open();
  await migrate(db);
  await seedIfEmpty(db);
  const teams = await repo.listTeams(db);
  const rows = parseSchedule(
    'date;time;field;home;away\n06/03/2027;18:00;Plumstead 1;Chilli Legends;GHO\n31/02/2027;18:00;Plumstead 2;Nomad;Ghost\n06/03/2027;19:30;Plumstead 2;Chilli Legends;Nobody FC',
    teams,
  );
  ok(
    'CSV: semicolons, short names, header skipped, errors caught',
    rows.length === 3 && !rows[0].error && rows[1].error!.includes('dd/mm/yyyy') && rows[2].error!.includes('Nobody FC'),
    rows.map((r) => r.error),
  );

  const chilli = teams.find((t) => t.name === 'Chilli Legends')!,
    ghost = teams.find((t) => t.name === 'Ghost')!,
    nomad = teams.find((t) => t.name === 'Nomad')!;
  const lg = await repo.saveEvent(db, { name: 'CT League', kind: 'league', level: 'league', division: 'mixed', teams: [chilli, ghost, nomad].map((t) => ({ teamId: t.id, pool: null })) });
  const [g1, g2] = await repo.createFixtures(db, [
    { eventId: lg, homeId: chilli.id, awayId: ghost.id, scheduledAt: '2027-03-06T16:00:00.000Z', venueId: null, rules: rulesFor('league', 'mixed') },
    { eventId: lg, homeId: nomad.id, awayId: chilli.id, scheduledAt: '2027-03-06T16:00:00.000Z', venueId: null, rules: rulesFor('league', 'mixed') },
  ]);
  let item = (await repo.getGameListItem(db, g1))!;
  ok('fixture scheduled, home stored', item.status === 'scheduled' && item.home_team_id === chilli.id && item.postponements === 0);
  await repo.postponeGame(db, g1, ghost.id, 'lights', null, null);
  await repo.postponeGame(db, g1, ghost.id, 'other', 'Exams', '2027-03-20T16:00:00.000Z');
  item = (await repo.getGameListItem(db, g1))!;
  ok('two postponements logged', item.postponements === 2 && (await repo.statusLog(db, g1)).length === 2 && !canPostpone('league', item.postponements));
  let third = '';
  try {
    await repo.postponeGame(db, g1, ghost.id, 'weather', null, null);
  } catch (e) {
    third = (e as Error).message;
  }
  ok('third postponement refused', third.includes('forfeit'), third);
  await repo.forfeitGame(db, g1, ghost.id, 'not_enough_women', null);
  item = (await repo.getGameListItem(db, g1))!;
  ok('forfeit: final, 11–0 to Chilli (league target)', item.status === 'final' && item.score_a === 11 && item.score_b === 0, [item.score_a, item.score_b]);
  const loaded = await loadFinishedGames(db, await repo.listGamesForEvent(db, lg));
  const aggC = teamAggregate(chilli.id, loaded),
    aggG = teamAggregate(ghost.id, loaded);
  ok('standings: forfeit is a win and a loss', aggC.wins === 1 && aggG.losses === 1 && aggC.pointsFor === 11, [aggC.wins, aggG.losses]);
  const tourn = await repo.saveEvent(db, { name: 'Regionals', kind: 'tournament', level: 'regional', division: 'mixed', teams: [] });
  const [tg] = await repo.createFixtures(db, [{ eventId: tourn, homeId: chilli.id, awayId: nomad.id, scheduledAt: null, venueId: null, rules: rulesFor('wfdf', 'mixed') }]);
  let tErr = '';
  try {
    await repo.postponeGame(db, tg, nomad.id, 'weather', null, null);
  } catch (e) {
    tErr = (e as Error).message;
  }
  ok('tournament game cannot be postponed', tErr.length > 0 && !canPostpone('tournament', 0));
  // start a fixture
  await repo.startScheduledGame(db, g2, {
    eventId: lg,
    venueId: null,
    teamAId: nomad.id,
    teamBId: chilli.id,
    trackingMode: 'lite',
    rules: rulesFor('league', 'mixed'),
    firstPullTeamId: nomad.id,
    ratioPoint1: 'W',
    squads: [],
  });
  const data = (await repo.loadGameData(db, g2))!;
  ok(
    'fixture started in place (same id, live, point 1, still in event)',
    data.game.status === 'live' && data.points.length === 1 && data.game.event_id === lg && deriveState(data).phase === 'between',
  );
  await repo.updateFixture(db, tg, { scheduledAt: '2027-04-01T08:00:00.000Z', venueId: null, homeId: nomad.id, awayId: chilli.id });
  const t2 = (await repo.getGameListItem(db, tg))!;
  ok('edit fixture: date set, home swapped, reschedule logged', t2.home_team_id === nomad.id && t2.team_a_id === nomad.id && (await repo.statusLog(db, tg))[0].action === 'reschedule');
})();
