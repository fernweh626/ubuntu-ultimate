import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
(async () => {
  const db: any = open(); await migrate(db); await seedIfEmpty(db);
  const ts = await repo.listTeams(db); const ghost = ts.find((t) => t.name === 'Ghost')!;
  const me = await repo.savePerson(db, { first_name: 'Sam', last_name: 'Test', gender: 'W' });
  await repo.setMeId(db, me);
  await repo.joinTeam(db, me, ghost.id, 'core', null);
  await repo.setMembershipRole(db, me, ghost.id, 'captain');
  await repo.setTestLevel(db, 'player');
  const a = await repo.getAccess(db);
  console.log(a.level === 'staff' && a.staffTeamIds[0] === ghost.id ? 'ok   staff via switch' : 'FAIL', a);
  await repo.setMembershipRole(db, me, ghost.id, 'player');
  console.log((await repo.getAccess(db)).level === 'player' ? 'ok   back to player' : 'FAIL');
})();
