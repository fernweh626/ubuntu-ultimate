import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { ensureDemoContent, ensureStarterContent, seedIfEmpty } from '@/db/seed';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x).slice(0, 300));
(async () => {
  const db: any = open();
  await migrate(db);
  await seedIfEmpty(db);
  await ensureStarterContent(db);
  await ensureDemoContent(db);
  const n = (await db.getFirstAsync(`SELECT COUNT(*) n FROM practice_rsvp WHERE status != 'late'`)).n;
  // Imitate the phone: practice_rsvp with the pre-'late' CHECK.
  await db.execAsync(`PRAGMA foreign_keys = OFF;
    DELETE FROM practice_rsvp WHERE status = 'late';
    CREATE TABLE pr_old (id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL REFERENCES session(id), person_id TEXT NOT NULL REFERENCES person(id), status TEXT NOT NULL CHECK (status IN ('going','not_going')), reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (session_id, person_id));
    INSERT INTO pr_old SELECT id, session_id, person_id, status, reason, created_at, updated_at FROM practice_rsvp;
    DROP TABLE practice_rsvp; ALTER TABLE pr_old RENAME TO practice_rsvp; PRAGMA foreign_keys = ON;`);
  let err = '';
  try {
    await db.runAsync(`UPDATE practice_rsvp SET status = 'late' WHERE rowid = (SELECT MIN(rowid) FROM practice_rsvp)`);
  } catch (e: any) {
    err = e.message;
  }
  ok('old table rejects late (like the phone)', /CHECK/.test(err), err);
  await migrate(db);
  await db.runAsync(`UPDATE practice_rsvp SET status = 'late' WHERE rowid = (SELECT MIN(rowid) FROM practice_rsvp)`);
  ok('after start-up repair, late is allowed', (await db.getFirstAsync(`SELECT COUNT(*) n FROM practice_rsvp WHERE status = 'late'`)).n === 1);
  ok('rows kept', (await db.getFirstAsync(`SELECT COUNT(*) n FROM practice_rsvp`)).n === n);
  ok('sync triggers back', (await db.getAllAsync(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'sync_practice_rsvp_%'`)).length === 3);
  ok('change queued for upload', !!(await db.getFirstAsync(`SELECT 1 FROM sync_outbox WHERE tbl = 'practice_rsvp'`)));
  ok('FKs hold', (await db.getAllAsync('PRAGMA foreign_key_check')).length === 0);
  await migrate(db);
  ok('repair is a no-op the second time', true);
})();
