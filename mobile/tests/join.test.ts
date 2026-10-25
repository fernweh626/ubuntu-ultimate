import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { ensureDemoContent, ensureStarterContent, seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import { myDataExport } from '@/db/my-data';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x).slice(0, 300));
(async () => {
  const db: any = open();
  await migrate(db);
  await seedIfEmpty(db);
  await ensureStarterContent(db);
  await ensureDemoContent(db);
  const me = await repo.savePerson(db, { first_name: 'Test', last_name: 'Joiner', gender: 'W' });
  await repo.setMeId(db, me);
  const [t1, t2] = (await repo.listTeams(db)).filter((t: any) => !t.is_sample);
  ok('signed out: joins straight away', (await repo.joinOrRequest(db, me, t1.id, 'core')) === 'joined');
  ok(
    'on the roster',
    (await repo.myRoles(db, me)).some((r: any) => r.team_id === t1.id),
  );
  await db.runAsync(`INSERT INTO app_meta (key, value) VALUES ('signed_in', 'u1')`);
  ok('signed in, not staff: asks', (await repo.joinOrRequest(db, me, t2.id, 'guest', 'hi')) === 'requested');
  ok('not on roster yet', !(await repo.myRoles(db, me)).some((r: any) => r.team_id === t2.id));
  const again = await repo.joinOrRequest(db, me, t2.id, 'core');
  const pend = await repo.pendingJoinRequests(db, t2.id);
  ok('asking again keeps one request', again === 'requested' && pend.filter((p: any) => p.person_id === me).length === 1 && pend[0].kind === 'core', pend);
  ok('my request visible', !!(await repo.myJoinRequest(db, me, t2.id)));
  ok('request is queued to sync', !!(await db.getFirstAsync(`SELECT 1 FROM sync_outbox WHERE tbl = 'join_request'`)));
  await repo.decideJoinLocally(db, pend[0].id, true);
  ok(
    'approved: on roster',
    (await repo.myRoles(db, me)).some((r: any) => r.team_id === t2.id),
  );
  ok('request closed', !(await repo.myJoinRequest(db, me, t2.id)));
  const data: any = await myDataExport(db, me);
  ok('my data export: profile + memberships + request', data.person?.id === me && data.membership.length === 2 && data.join_request.length === 1, Object.keys(data));
})();
