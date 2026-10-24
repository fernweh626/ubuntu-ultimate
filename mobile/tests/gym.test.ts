import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { ensureDemoContent, ensureStarterContent, seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x).slice(0, 300));
(async () => {
  const db: any = open(); await migrate(db); await seedIfEmpty(db); await ensureStarterContent(db); await ensureDemoContent(db);
  ok('v20 and FKs hold after rebuild', (await db.getFirstAsync('PRAGMA user_version')).user_version === 25 && (await db.getAllAsync('PRAGMA foreign_key_check')).length === 0);
  ok('practices kept through the rebuild', (await db.getFirstAsync(`SELECT COUNT(*) n FROM session WHERE kind = 'practice'`)).n > 10);
  ok('sync triggers back', (await db.getAllAsync(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'sync_session_%'`)).length === 3);
  const me = await repo.savePerson(db, { first_name: 'Gym', last_name: 'Rat', gender: 'W' });
  await repo.setMeId(db, me);
  for (const kind of ['gym', 'physio'] as const) {
    const id = await repo.createSession(db, { kind, teamId: null, title: null, startedAt: new Date().toISOString(), durationMin: 45, venueId: null, createdById: me });
    await repo.saveReflection(db, { personId: me, teamId: null, gameId: null, sessionId: id, kind: 'practice', minutes: 45, rpe: kind === 'gym' ? 7 : null, selfRating: null, playingTime: null, niggleArea: null, niggleSeverity: null, answers: { workOn: 'notes' } } as any);
  }
  const log = await repo.personLog(db, me);
  ok('log shows Gym and Physio', log.some((e: any) => e.kind === 'gym' && e.title === 'Gym') && log.some((e: any) => e.kind === 'physio' && e.title === 'Physio'), log);
  ok('session upload queued', !!(await db.getFirstAsync(`SELECT 1 FROM sync_outbox WHERE tbl = 'session'`)));
  const mate = (await db.getFirstAsync(`SELECT id FROM person WHERE id != ? LIMIT 1`, me)).id;
  const g = (await db.getFirstAsync(`SELECT id FROM game WHERE status = 'final' LIMIT 1`)).id;
  await repo.saveShoutout(db, { fromId: mate, toId: me, teamId: null, gameId: g, sessionId: null, reason: 'Huge layout D' });
  const sh = await repo.shoutoutsForPerson(db, me);
  ok('shout-outs for me, with game name', sh.length === 1 && sh[0].reason === 'Huge layout D' && / v /.test(sh[0].what ?? ''), sh);
})();
