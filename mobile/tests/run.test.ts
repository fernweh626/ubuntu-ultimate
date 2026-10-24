import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { ensureStarterContent, seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import { loadFinishedGames, teamAggregate, playerTotals } from '@/db/reports';
import { deriveState } from '@/domain/engine';
import { computeGameStats } from '@/domain/stats';
import { rulesFor } from '@/domain/rules';

const ok = (name: string, cond: boolean, extra: unknown = '') => console.log(cond ? 'ok  ' : 'FAIL', name, extra);
(async () => {
  const db: any = open();
  await migrate(db); await migrate(db);
  ok('migrate twice', (await db.getFirstAsync('PRAGMA user_version')).user_version === 26);
  await seedIfEmpty(db); await seedIfEmpty(db); await ensureStarterContent(db);
  const teams = await repo.listTeams(db);
  ok('seed teams (24 clubs + 2 samples)', teams.length === 26, teams.length);
  const light = teams.find((t) => t.name === 'Sample Light')!, dark = teams.find((t) => t.name === 'Sample Dark')!;
  const rl = await repo.roster(db, light.id), rd = await repo.roster(db, dark.id);
  ok('rosters sorted by first name', rl.length === 12 && rl[0].first_name === 'Aisha' && rl[11].first_name === 'Liam');
  ok('pickups/calendar/venues', (await repo.listPickups(db)).length === 3 && (await repo.listCalendar(db)).length === 11 && (await repo.listVenues(db)).length === 3);

  const ev = await repo.saveEvent(db, { name: 'Test Cup', kind: 'tournament', level: 'regional', division: 'mixed', teams: [{ teamId: light.id, pool: 'A' }, { teamId: dark.id, pool: 'A' }] });
  const gid = await repo.createGame(db, { eventId: ev, venueId: null, teamAId: light.id, teamBId: dark.id, trackingMode: 'standard', rules: rulesFor('wfdf', 'mixed'), firstPullTeamId: light.id, ratioPoint1: 'W',
    squads: [...rl.map((p) => ({ teamId: light.id, personId: p.id, jersey: p.jersey_number, position: p.position })), ...rd.map((p) => ({ teamId: dark.id, personId: p.id, jersey: p.jersey_number, position: p.position }))] });
  const L = (r: any[]) => [...r.filter((p) => p.gender === 'W').slice(0, 4), ...r.filter((p) => p.gender === 'M').slice(0, 3)].map((p) => p.id);
  let data = (await repo.loadGameData(db, gid))!;
  ok('point 1 created, dark receives', data.points.length === 1 && data.points[0].offense_team_id === dark.id && data.points[0].ratio === 'W');

  // play to 15-? : light scores every point after one dark drop
  for (let i = 0; i < 30; i++) {
    data = (await repo.loadGameData(db, gid))!;
    let st = deriveState(data);
    if (st.point!.scored_at) break;
    await repo.setLine(db, st.point!.id, light.id, L(rl));
    await repo.setLine(db, st.point!.id, dark.id, L(rd));
    await repo.pull(db, gid, st.point!.id);
    await repo.setPullDetails(db, st.point!.id, null, 'in');
    data = (await repo.loadGameData(db, gid))!; st = deriveState(data);
    if (st.possession === dark.id) await repo.recordEvent(db, { gameId: gid, pointId: st.point!.id, type: 'drop', teamId: dark.id, actorId: rd[0].id });
    data = (await repo.loadGameData(db, gid))!;
    const r = await repo.scorePoint(db, data, light.id, { scorerId: rl[1].id, assistId: rl[0].id });
    if (r.gameOver) break;
  }
  data = (await repo.loadGameData(db, gid))!;
  let st = deriveState(data);
  ok('light reaches 15', st.scoreA === 15 && st.scoreB === 0, [st.scoreA, st.scoreB]);
  ok('halftime recorded once', data.events.filter((e) => e.type === 'halftime').length === 1);
  ok('second half: dark (first receiver) pulls -> light receives', data.points.find((p) => p.number === 9)?.offense_team_id === light.id, data.points.find((p) => p.number === 9)?.offense_team_id === light.id);

  // undo last score then rescore
  await repo.undo(db, data);
  data = (await repo.loadGameData(db, gid))!; st = deriveState(data);
  ok('undo score', st.scoreA === 14 && st.phase === 'inpoint', [st.scoreA, st.phase]);
  await repo.scorePoint(db, data, light.id, { scorerId: rl[1].id, assistId: rl[0].id });
  data = (await repo.loadGameData(db, gid))!;
  await repo.endGame(db, data);
  data = (await repo.loadGameData(db, gid))!;
  const s = computeGameStats(data);
  ok('final status', data.game.status === 'final');
  ok('breaks/holds', s.teams[light.id].breaks + s.teams[light.id].holds === 15, [s.teams[light.id].holds, s.teams[light.id].breaks]);
  ok('scorer goals', s.players[rl[1].id].goals === 15);
  const lg = await loadFinishedGames(db, await repo.listGamesForEvent(db, ev));
  const agg = teamAggregate(light.id, lg);
  ok('event aggregate', agg.wins === 1 && agg.pointsFor === 15, [agg.wins, agg.pointsFor]);
  ok('player totals', playerTotals(lg).get(rl[0].id)?.assists === 15);
  const listed = await repo.listGames(db);
  ok('game list score', listed[0].score_a === 15 && listed[0].score_b === 0);
  await repo.saveSpirit(db, { game_id: gid, from_team_id: light.id, to_team_id: dark.id, rules: 2, fouls: 3, fairness: 2, attitude: 2, communication: 2, comments_json: '{}', overall_comment: 'gg' });
  await repo.saveSpirit(db, { game_id: gid, from_team_id: light.id, to_team_id: dark.id, rules: 3, fouls: 3, fairness: 2, attitude: 2, communication: 2, comments_json: '{}', overall_comment: 'gg' });
  ok('spirit upsert', (await repo.spiritForGame(db, gid)).length === 1);
  await repo.reopenGame(db, data);
  data = (await repo.loadGameData(db, gid))!;
  ok('reopen', data.game.status === 'live' && deriveState(data).phase === 'between');
  const pid = await repo.savePerson(db, { first_name: 'Zed', last_name: 'Test', gender: 'X' }, { teamId: light.id, kind: 'mercenary', jersey: '99' });
  await repo.joinTeam(db, pid, dark.id, 'guest', null);
  ok('person history', (await repo.personHistory(db, pid)).length === 2);
  await repo.saveLine(db, light.id, 'Super O', 'O', L(rl));
  ok('saved line', (await repo.savedLines(db, light.id))[0].member_ids.length === 7);
  console.log('done');
})().catch((e) => { console.log('CRASH', e); process.exit(1); });
