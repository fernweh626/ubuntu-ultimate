import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { ensureDemoContent, ensureStarterContent, seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import { deriveState } from '@/domain/engine';
(async () => {
  const db: any = open();
  await migrate(db);
  await seedIfEmpty(db);
  await ensureStarterContent(db);
  await ensureDemoContent(db);
  const g = await db.getFirstAsync(
    `SELECT g.id, g.team_a_id, g.team_b_id FROM game g JOIN team a ON a.id = g.team_a_id JOIN team b ON b.id = g.team_b_id WHERE g.status = 'scheduled' AND a.name = 'Chilli Legends' AND b.name LIKE 'Maties%'`,
  );
  const { rulesFor } = await import('@/domain/rules');
  await repo.startScheduledGame(db, g.id, {
    eventId: null,
    venueId: null,
    teamAId: g.team_a_id,
    teamBId: g.team_b_id,
    trackingMode: 'lite',
    rules: rulesFor('wfdf', 'mixed'),
    firstPullTeamId: g.team_a_id,
    ratioPoint1: 'M',
    squads: [],
  } as any);
  let d = (await repo.loadGameData(db, g.id))!;
  for (const team of [g.team_a_id, g.team_b_id]) {
    await repo.pull(db, g.id, deriveState(d).point!.id);
    d = (await repo.loadGameData(db, g.id))!;
    await repo.scorePoint(db, d, team);
    d = (await repo.loadGameData(db, g.id))!;
  }
  try {
    await repo.recordEvent(db, { gameId: g.id, pointId: deriveState(d).point!.id, type: 'timeout', teamId: g.team_a_id });
    d = (await repo.loadGameData(db, g.id))!;
  } catch (e: any) {
    console.log('timeout err', e.message);
  }
  const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x).slice(0, 300));
  let err = '';
  try {
    await repo.endGame(db, d, 'weather');
  } catch (e: any) {
    err = e.message;
  }
  const after = (await repo.loadGameData(db, g.id))!;
  ok('end early after a pre-pull timeout', !err && after.game.status === 'final', err);
  ok(
    'timeout kept',
    after.events.some((e: any) => e.type === 'timeout' && !e.point_id),
  );
  const { computeGameStats } = await import('@/domain/stats');
  const st = computeGameStats(after);
  ok('report still works, 1–1', st.teams[g.team_a_id].score === 1 && st.teams[g.team_b_id].score === 1);
  ok('FKs hold', (await db.getAllAsync('PRAGMA foreign_key_check')).length === 0);
  // Undo twice after a pre-pull timeout: the timeout, then the last score (deletes the waiting point).
  const g2 = await repo.createGame(db, {
    eventId: null,
    venueId: null,
    teamAId: g.team_a_id,
    teamBId: g.team_b_id,
    trackingMode: 'lite',
    rules: (await import('@/domain/rules')).rulesFor('wfdf', 'mixed'),
    firstPullTeamId: g.team_a_id,
    ratioPoint1: 'M',
    squads: [],
  } as any);
  let e2 = (await repo.loadGameData(db, g2))!;
  await repo.pull(db, g2, deriveState(e2).point!.id);
  e2 = (await repo.loadGameData(db, g2))!;
  await repo.scorePoint(db, e2, g.team_a_id);
  e2 = (await repo.loadGameData(db, g2))!;
  await repo.recordEvent(db, { gameId: g2, pointId: deriveState(e2).point!.id, type: 'timeout', teamId: g.team_b_id });
  e2 = (await repo.loadGameData(db, g2))!;
  let uerr = '';
  try {
    ok('undo 1 = the timeout', (await repo.undo(db, e2)) === 'event');
    e2 = (await repo.loadGameData(db, g2))!;
    ok('undo 2 = the score', (await repo.undo(db, e2)) === 'score');
    e2 = (await repo.loadGameData(db, g2))!;
  } catch (e: any) {
    uerr = e.message;
  }
  ok('undo after pre-pull timeout works', !uerr && deriveState(e2).scoreA === 0, uerr);
})();
(async () => {})();
