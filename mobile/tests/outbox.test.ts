import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
(async () => {
  const db: any = open(); await migrate(db); await seedIfEmpty(db);
  const before = (await db.getFirstAsync('SELECT COUNT(*) n FROM sync_outbox')).n;
  const t = (await repo.listTeams(db))[0];
  await repo.savePerson(db, { first_name: 'X', last_name: 'Y', gender: 'W' }, { teamId: t.id });
  await db.runAsync(`INSERT INTO app_meta (key,value) VALUES ('sync_pulling','1')`);
  await repo.savePerson(db, { first_name: 'Pulled', last_name: 'Z', gender: 'M' });
  await db.runAsync(`DELETE FROM app_meta WHERE key='sync_pulling'`);
  const rows = await db.getAllAsync('SELECT tbl, op FROM sync_outbox');
  console.log(rows.length === before + 2 && rows.some((r: any) => r.tbl === 'person') && rows.some((r: any) => r.tbl === 'membership') ? 'ok   outbox records local changes, skips pulled rows' : 'FAIL', before, rows);
})();
