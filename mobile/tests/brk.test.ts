import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import { breakClock, currentSegment, deriveState } from '@/domain/engine';
import { rulesFor, ratioCode } from '@/domain/rules';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x));
(async () => {
  ok('ABBA codes', [1, 2, 3, 4, 5, 6, 7].map((n) => ratioCode(n === 1 || Math.floor(n / 2) % 2 === 0 ? 'W' : 'M', n)).join(' ') === 'F1 M1 M2 F1 F2 M1 M2');
  const db: any = open();
  await migrate(db);
  await seedIfEmpty(db);
  const ts = await repo.listTeams(db);
  const a = ts.find((t) => t.name === 'Sample Light')!,
    b = ts.find((t) => t.name === 'Sample Dark')!;
  const rl = await repo.roster(db, a.id),
    rd = await repo.roster(db, b.id);
  const rules = rulesFor('wfdf', 'mixed');
  const gid = await repo.createGame(db, {
    eventId: null,
    venueId: null,
    teamAId: a.id,
    teamBId: b.id,
    trackingMode: 'lite',
    rules,
    firstPullTeamId: a.id,
    ratioPoint1: 'W',
    squads: [...rl.map((p) => ({ teamId: a.id, personId: p.id, jersey: null, position: null })), ...rd.map((p) => ({ teamId: b.id, personId: p.id, jersey: null, position: null }))],
  });
  const S = async () => {
    const d = (await repo.loadGameData(db, gid))!;
    return { d, s: deriveState(d) };
  };
  let { d, s } = await S();
  ok('before first point: no clock', breakClock(d, s) == null);
  await repo.pull(db, gid, s.point!.id);
  ({ d, s } = await S());
  ok('in play: no clock', breakClock(d, s) == null);
  await repo.recordEvent(db, { gameId: gid, pointId: s.point!.id, type: 'timeout', teamId: a.id });
  ({ d, s } = await S());
  const t = breakClock(d, s)!;
  const seg = currentSegment(t.segments, Date.now());
  ok('in-point timeout ~75s', seg.kind === 'timeout' && t.teamId === a.id && Math.abs(seg.remaining - 75) < 2, seg);
  await repo.scorePoint(db, d, a.id, { scorerId: rl[0].id, assistId: rl[1].id });
  ({ d, s } = await S());
  let seg2 = currentSegment(breakClock(d, s)!.segments, Date.now());
  ok('between points ~75s', seg2.kind === 'between' && Math.abs(seg2.remaining - 75) < 2, seg2);
  await repo.recordEvent(db, { gameId: gid, pointId: s.point!.id, type: 'timeout', teamId: b.id });
  ({ d, s } = await S());
  seg2 = currentSegment(breakClock(d, s)!.segments, Date.now());
  ok('timeout before pull extends to ~150s', seg2.kind === 'timeout' && Math.abs(seg2.remaining - 150) < 2, seg2);
  for (let i = 0; i < 7; i++) {
    ({ d, s } = await S());
    if (!s.point!.pulled_at) await repo.pull(db, gid, s.point!.id);
    ({ d, s } = await S());
    await repo.scorePoint(db, d, a.id, { scorerId: rl[0].id, assistId: rl[1].id });
  }
  ({ d, s } = await S());
  const h = breakClock(d, s)!;
  const hs = currentSegment(h.segments, Date.now());
  ok('halftime at 8: 7 min, then pull', s.scoreA === 8 && hs.kind === 'halftime' && Math.abs(hs.remaining - 420) < 2 && h.segments[1].kind === 'between', [s.scoreA, hs]);
  const after = currentSegment(h.segments, Date.now() + 430_000);
  ok('after halftime: pull countdown', after.kind === 'between' && Math.abs(after.remaining - 65) < 2, after);
})();
