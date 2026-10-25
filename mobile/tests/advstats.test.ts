import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import { deriveState } from '@/domain/engine';
import { rulesFor } from '@/domain/rules';
import { addAdvanced, bestLines, completionRates, computeAdvanced, perPoint, topPairs } from '@/domain/advanced-stats';
import { computeGameStats } from '@/domain/stats';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x).slice(0, 400));
(async () => {
  const db: any = open(); await migrate(db); await seedIfEmpty(db);
  const teams = await repo.listTeams(db);
  const A = teams.find((t) => t.name === 'Sample Light')!, B = teams.find((t) => t.name === 'Sample Dark')!;
  const ra = await repo.roster(db, A.id), rb = await repo.roster(db, B.id);
  const gid = await repo.createGame(db, { eventId: null, venueId: null, teamAId: A.id, teamBId: B.id, trackingMode: 'full', rules: rulesFor('wfdf', 'mixed'), firstPullTeamId: B.id, ratioPoint1: 'W',
    squads: [...ra, ...rb].map((p) => ({ teamId: ra.includes(p) ? A.id : B.id, personId: p.id, jersey: p.jersey_number, position: p.position })) });
  const L = (r: any[]) => [...r.filter((p) => p.gender === 'W').slice(0, 4), ...r.filter((p) => p.gender === 'M').slice(0, 3)].map((p) => p.id);
  const a = L(ra), b = L(rb);
  const ev = (pointId: string, type: string, teamId: string, actorId: string | null, secondaryId: string | null = null) => repo.recordEvent(db, { gameId: gid, pointId, type: type as never, teamId, actorId, secondaryId });

  // Point 1: A receives. a0→a1→a2→a3, then a3 throws it away. B: b0→b1, b1→b2 goal. (B breaks.)
  let st = deriveState((await repo.loadGameData(db, gid))!);
  const p1 = st.point!.id;
  await repo.setLine(db, p1, A.id, a); await repo.setLine(db, p1, B.id, b); await repo.pull(db, gid, p1);
  await ev(p1, 'pass', A.id, a[0], a[1]); await ev(p1, 'pass', A.id, a[1], a[2]); await ev(p1, 'pass', A.id, a[2], a[3]);
  await ev(p1, 'throwaway', A.id, a[3]);
  await ev(p1, 'pass', B.id, b[0], b[1]);
  await repo.scorePoint(db, (await repo.loadGameData(db, gid))!, B.id, { scorerId: b[2], assistId: b[1] });

  // Point 2: A receives again. a0→a1 x2 then a1→a4 goal (clean hold, chain of 3).
  st = deriveState((await repo.loadGameData(db, gid))!);
  const p2 = st.point!.id;
  await repo.setLine(db, p2, A.id, a); await repo.setLine(db, p2, B.id, b); await repo.pull(db, gid, p2);
  await ev(p2, 'pass', A.id, a[0], a[1]); await ev(p2, 'pass', A.id, a[1], a[0]); await ev(p2, 'pass', A.id, a[0], a[1]);
  await repo.scorePoint(db, (await repo.loadGameData(db, gid))!, A.id, { scorerId: a[4], assistId: a[1] });

  const data = (await repo.loadGameData(db, gid))!;
  const adv = computeAdvanced(data);
  const TA = adv[A.id], TB = adv[B.id];
  ok('possessions: A twice (start of each point), B once (after the throwaway)', TA.possessions === 2 && TB.possessions === 1, [TA.possessions, TB.possessions]);
  ok('scoring possessions', TA.scoringPossessions === 1 && TB.scoringPossessions === 1);
  ok('B scored after a turn (break conversion 1/1)', TB.afterTurn === 1 && TB.afterTurnScored === 1, TB);
  ok('longest chain: A 4 passes (3 + goal)', TA.longestChain === 4, TA.longestChain);
  ok('passes per goal A: 4 in the scoring possession', TA.passesInScoring === 4, TA.passesInScoring);
  ok('completions A: 3 + 3 + goal = 7', TA.completions === 7, TA.completions);
  const pairs = topPairs(TA);
  ok('top pair a0→a1 (3 times), direction kept', pairs[0].from === a[0] && pairs[0].to === a[1] && pairs[0].count === 3, pairs);
  ok('the seven: same line both points, 1 for 1 against', bestLines(TA, 2)[0]?.played === 2 && bestLines(TA, 2)[0].scored === 1 && bestLines(TA, 2)[0].conceded === 1, bestLines(TA, 2));
  const season = addAdvanced([TA, TA], A.id);
  ok('season adds up; longest chain is the max', season.possessions === 4 && season.longestChain === 4 && season.pairs[`${a[0]}>${a[1]}`] === 6, season);
  const ps = computeGameStats(data).players[a[3]];
  const r = perPoint(ps);
  ok('per point: a3 one throwaway in 2 points = 0.5', r.throwaways === 0.5 && r.turns === 0.5, r);
  const cr = completionRates(computeGameStats(data).players[a[1]]);
  ok('a1 threw 3 (incl. the assist), all completed: 100%', cr.throwing === 100, cr);
})();
