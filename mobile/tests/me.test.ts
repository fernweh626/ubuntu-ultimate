import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x).slice(0, 300));
(async () => {
  const db: any = open();
  await migrate(db);
  await seedIfEmpty(db);
  ok('nobody is me at first', (await repo.getMe(db)) === null);
  const t = (await repo.listTeams(db)).find((x) => x.name === 'Sample Light')!;
  const p = (await repo.roster(db, t.id))[0];
  await repo.setMeId(db, p.id);
  await repo.setMeId(db, p.id);
  const me = await repo.getMe(db);
  ok('picked player is me', me?.id === p.id);
  ok('email never selected', !me?.email);
  await repo.setMembershipRole(db, p.id, t.id, 'captain');
  ok(
    'captain role shows',
    (await repo.myRoles(db, p.id)).some((r) => r.role === 'captain' && r.team_name === 'Sample Light'),
  );
  await repo.setMeId(db, null);
  ok('switch player clears me', (await repo.getMe(db)) === null);
})();
