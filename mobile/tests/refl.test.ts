import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import { debriefText, summarise } from '@/domain/reflection';
import { rulesFor } from '@/domain/rules';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, x);
(async () => {
  const db: any = open(); await migrate(db); await seedIfEmpty(db);
  const ts = await repo.listTeams(db); const a = ts.find((t) => t.name === 'Sample Light')!, b = ts.find((t) => t.name === 'Sample Dark')!;
  const ra = await repo.roster(db, a.id), rb = await repo.roster(db, b.id);
  const line = (r: any[]) => [...r.filter((p) => p.gender === 'W').slice(0, 4), ...r.filter((p) => p.gender === 'M').slice(0, 3)].map((p) => p.id);
  const gid = await repo.createGame(db, { eventId: null, venueId: null, teamAId: a.id, teamBId: b.id, trackingMode: 'lite', rules: rulesFor('wfdf', 'mixed'), firstPullTeamId: a.id, ratioPoint1: 'W',
    squads: [...ra.map((p) => ({ teamId: a.id, personId: p.id, jersey: null, position: null })), ...rb.map((p) => ({ teamId: b.id, personId: p.id, jersey: null, position: null }))] });
  for (let i = 0; i < 3; i++) {
    const d = (await repo.loadGameData(db, gid))!; const pt = [...d.points].sort((x, y) => y.number - x.number)[0];
    await repo.setLine(db, pt.id, a.id, line(ra)); await repo.setLine(db, pt.id, b.id, line(rb));
    await db.runAsync(`UPDATE point SET pulled_at = ? WHERE id = ?`, new Date(Date.now() - (10 - i * 3) * 60000).toISOString(), pt.id);
    const d2 = (await repo.loadGameData(db, gid))!;
    await repo.scorePoint(db, d2, a.id);
    await db.runAsync(`UPDATE point SET scored_at = ? WHERE id = ?`, new Date(Date.now() - (8 - i * 3) * 60000).toISOString(), pt.id);
  }
  await repo.endGame(db, (await repo.loadGameData(db, gid))!);
  const me = line(ra)[0];
  await repo.saveReflection(db, { personId: me, teamId: a.id, gameId: gid, sessionId: null, kind: 'game', minutes: null, rpe: 7, selfRating: 4, playingTime: 'too_little', niggleArea: 'Hamstring', niggleSeverity: 'mild', answers: { wentWell: 'Zone D', workOn: 'Break throws', leadership: 'More O time please', teamOffence: 3, teamDefence: 4 } });
  await repo.saveReflection(db, { personId: me, teamId: a.id, gameId: gid, sessionId: null, kind: 'game', minutes: null, rpe: 8, selfRating: 4, playingTime: 'too_little', niggleArea: null, niggleSeverity: null, answers: { wentWell: 'Zone D', teamOffence: 3 } });
  await repo.saveReflection(db, { personId: line(ra)[1], teamId: a.id, gameId: gid, sessionId: null, kind: 'game', minutes: null, rpe: 5, selfRating: 3, playingTime: 'right', niggleArea: null, niggleSeverity: null, answers: { workOn: 'Spacing', roleClear: 'no', teamOffence: 5 } });
  await repo.saveReflection(db, { personId: line(rb)[0], teamId: b.id, gameId: gid, sessionId: null, kind: 'game', minutes: null, rpe: 9, selfRating: 2, playingTime: 'right', niggleArea: null, niggleSeverity: null, answers: {} });
  const mine = await repo.reflectionsFor(db, { gameId: gid }, a.id);
  ok('one reflection per person (update, not duplicate), staff see own team only', mine.length === 2 && (await repo.reflectionsFor(db, { gameId: gid })).length === 3);
  const people = await repo.roster(db, a.id);
  const s = summarise(mine, (pid) => people.find((p) => p.id === pid)!.first_name);
  ok('summary', s.avgRpe === 6.5 && s.avgOffence === 4 && s.playingTime.too_little.length === 1 && s.roleUnclear.length === 1 && s.niggles.length === 0 && s.workOn.length === 1, s);
  const txt = debriefText('Light v Dark', s, 12);
  ok('debrief text has no names or leadership notes', !people.some((p) => txt.includes(p.first_name)) && !txt.includes('More O time'), txt);
  await repo.saveShoutout(db, { fromId: me, toId: line(ra)[1], teamId: a.id, gameId: gid, sessionId: null, reason: 'Great D' });
  await repo.saveShoutout(db, { fromId: me, toId: line(ra)[2], teamId: a.id, gameId: gid, sessionId: null, reason: 'Hucks' });
  const so = await repo.shoutoutsForTeam(db, a.id);
  ok('one shout-out per person per game', so.length === 1 && so[0].to_person_id === line(ra)[2]);
  const sid = await repo.createSession(db, { kind: 'practice', teamId: a.id, title: 'Zone practice', startedAt: new Date(Date.now() - 3 * 3600000).toISOString(), durationMin: 90, venueId: null, createdById: me });
  await repo.saveReflection(db, { personId: me, teamId: a.id, gameId: null, sessionId: sid, kind: 'practice', minutes: 80, rpe: 6, selfRating: 3, playingTime: null, niggleArea: null, niggleSeverity: null, answers: { drill: '3-man weave' } });
  const pid2 = await repo.createSession(db, { kind: 'pickup', teamId: null, title: null, startedAt: new Date().toISOString(), durationMin: 60, venueId: null, createdById: me });
  await repo.saveReflection(db, { personId: me, teamId: null, gameId: null, sessionId: pid2, kind: 'pickup', minutes: null, rpe: 4, selfRating: null, playingTime: null, niggleArea: null, niggleSeverity: null, answers: {} });
  const log = await repo.personLog(db, me);
  ok('log has game (minutes from points played) + practice + pickup', log.length === 3 && log.find((e) => e.kind === 'game')!.minutes === 6 && log.find((e) => e.kind === 'practice')!.minutes === 80 && log.find((e) => e.kind === 'pickup')!.minutes === 60, log.map((e) => [e.kind, e.minutes]));
  const load = await repo.recentLoad(db, [me, line(ra)[1]]);
  ok('recent load = game 8×6? no minutes for game → practice 6×80 + pickup 4×60', load.get(me) === 480 + 240, [...load.entries()]);
})();
