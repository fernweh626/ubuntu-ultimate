import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { ensureDemoContent, ensureStarterContent, seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x).slice(0, 300));
(async () => {
  const db: any = open(); await migrate(db); await seedIfEmpty(db); await ensureStarterContent(db); await ensureDemoContent(db);
  const before = { e: (await db.getFirstAsync('SELECT COUNT(*) n FROM event')).n, g: (await db.getFirstAsync('SELECT COUNT(*) n FROM game')).n };
  await db.execAsync('ALTER TABLE pickup_spot DROP COLUMN editor_ids; ALTER TABLE pickup_spot DROP COLUMN created_by_person; ALTER TABLE registration DROP COLUMN emergency_phone; ALTER TABLE registration DROP COLUMN emergency_name; DROP TABLE pickup_rsvp; ALTER TABLE event DROP COLUMN pop_contact; ALTER TABLE event DROP COLUMN eft_details; PRAGMA user_version = 16'); // pretend this phone is on v16 with data
  let err = ''; try { await migrate(db); } catch (e) { err = String(e); }
  ok('v16 → v17 with events and games in place', !err && (await db.getFirstAsync('PRAGMA user_version')).user_version === 22, err);
  ok('no events or games lost', (await db.getFirstAsync('SELECT COUNT(*) n FROM event')).n === before.e && (await db.getFirstAsync('SELECT COUNT(*) n FROM game')).n === before.g);
  ok('foreign keys intact', (await db.getAllAsync('PRAGMA foreign_key_check')).length === 0);
  const id = await repo.saveEvent(db, { name: 'Clifton Beach Classic', kind: 'tournament', level: 'social', division: 'beach', teams: [] } as any);
  ok('beach events allowed', (await repo.getEvent(db, id))!.division === 'beach');
  ok('event changes still go to the sync outbox', !!(await db.getFirstAsync(`SELECT 1 FROM sync_outbox WHERE tbl = 'event' AND pk LIKE ?`, `%${id}%`)));
  const { rulesFor } = await import('@/domain/rules');
  const r = rulesFor('beach', 'beach');
  ok('beach preset: 5 a side, to 11, ratio on', r.playersPerSide === 5 && r.pointTarget === 11 && r.mixedRatio);
})();
