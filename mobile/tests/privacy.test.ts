import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import { peopleById } from '@/db/reports';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x).slice(0, 300));
(async () => {
  const db: any = open(); await migrate(db); await seedIfEmpty(db);
  const t = (await repo.listTeams(db))[0];
  const id = await repo.savePerson(db, { first_name: 'Kid', last_name: 'Player', gender: 'W', email: 'kid@example.com', birth_date: '2012-01-01' }, { teamId: t.id });
  const e = await repo.getPersonForEdit(db, id);
  ok('edit form hides email but knows it exists', !('email' in (e as object)) && e!.has_email === 1 && e!.is_minor === 1, e);
  await repo.savePerson(db, { id, first_name: 'Kid', last_name: 'Player', gender: 'W', email: null, birth_date: null });
  const raw = await db.getFirstAsync('SELECT email, birth_date FROM person WHERE id = ?', id);
  ok('saving with blanks keeps email and birth date', raw.email === 'kid@example.com' && raw.birth_date === '2012-01-01', raw);
  ok('email never leaves via roster, getPerson or peopleById', !(await repo.roster(db, t.id)).find((p) => p.id === id)!.email && !(await repo.getPerson(db, id))!.email && !(await peopleById(db, [id])).get(id)!.email);
  await repo.clearPrivateField(db, id, 'email');
  ok('remove clears email', (await db.getFirstAsync('SELECT email FROM person WHERE id = ?', id)).email === null);
})();
