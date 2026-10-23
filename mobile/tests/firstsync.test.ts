import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { ensureDemoContent, ensureStarterContent, seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import { prepareFirstSync, pruneSharedOutbox, sharedContent } from '@/db/sync';
import { rulesFor } from '@/domain/rules';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x).slice(0, 400));
(async () => {
  const db: any = open(); await migrate(db); await seedIfEmpty(db); await ensureStarterContent(db); await ensureDemoContent(db);
  const me = await repo.savePerson(db, { first_name: 'Real', last_name: 'Me', gender: 'W' });
  await repo.setMeId(db, me);
  const [t] = (await repo.listTeams(db)).filter((x: any) => !x.is_sample && x.name === 'Chilli Legends');
  await repo.joinTeam(db, me, t.id, 'core', null);
  const ag = await db.getFirstAsync(`SELECT id FROM calendar_entry WHERE kind = 'agm'`);
  await repo.setMeetingRsvp(db, ag.id, me, 'going');
  await db.runAsync('DELETE FROM sync_outbox');
  // Old builds: everything queued.
  for (const tbl of ['person', 'membership', 'game', 'point', 'game_event', 'team', 'meeting_rsvp']) {
    const rows = await db.getAllAsync(`SELECT id FROM ${tbl}`);
    for (const r of rows) await db.runAsync(`INSERT OR IGNORE INTO sync_outbox (tbl, pk, op, at) VALUES (?, ?, 'upsert', 'x')`, tbl, JSON.stringify({ id: r.id }));
  }
  const before = (await db.getFirstAsync('SELECT COUNT(*) n FROM sync_outbox')).n;
  const dropped = await pruneSharedOutbox(db);
  // Sample-team rows are left for prepareFirstSync, which deletes those teams before any upload.
  const left = await db.getAllAsync(`SELECT o.tbl, o.pk FROM sync_outbox o
    WHERE NOT (o.tbl = 'membership' AND json_extract(o.pk, '$.id') IN (SELECT m.id FROM membership m JOIN team t ON t.id = m.team_id WHERE t.is_sample = 1))
      AND NOT (o.tbl = 'person' AND json_extract(o.pk, '$.id') IN (SELECT m.person_id FROM membership m JOIN team t ON t.id = m.team_id WHERE t.is_sample = 1))
      AND NOT (o.tbl = 'team' AND json_extract(o.pk, '$.id') IN (SELECT id FROM team WHERE is_sample = 1))
      AND NOT (o.tbl IN ('game', 'point', 'game_event') AND 1 = 0)`);
  ok(`old queue ${before} → ${left.length} after clean-up`, before > 5000 && left.length <= 4, left.map((l: any) => l.tbl));
  ok('kept my person, membership and AGM rsvp', ['person', 'membership', 'meeting_rsvp'].every((tb) => left.some((l: any) => l.tbl === tb)), left);
  ok('clean-up runs once', (await pruneSharedOutbox(db)) === 0 && dropped > 0);
  // New first sync on a fresh phone with the same content.
  const db2: any = open(); await migrate(db2); await seedIfEmpty(db2); await ensureStarterContent(db2); await ensureDemoContent(db2);
  const me2 = await repo.savePerson(db2, { first_name: 'New', last_name: 'Phone', gender: 'M' });
  await repo.setMeId(db2, me2);
  const gid = await repo.createGame(db2, { eventId: null, venueId: null, teamAId: t.id, teamBId: (await repo.listTeams(db2)).find((x: any) => x.name === 'Nomad').id, trackingMode: 'lite', rules: rulesFor('wfdf', 'mixed'), firstPullTeamId: t.id, ratioPoint1: 'M', squads: [] } as any);
  await db2.runAsync('DELETE FROM sync_outbox');
  await prepareFirstSync(db2);
  const q = await db2.getAllAsync('SELECT tbl, COUNT(*) n FROM sync_outbox GROUP BY tbl');
  const total = q.reduce((a: number, r: any) => a + r.n, 0);
  ok(`first sync queues only this phone's rows (${total})`, total < 20 && q.some((r: any) => r.tbl === 'game') && q.some((r: any) => r.tbl === 'person'), q);
  const sh = await sharedContent(db2);
  ok('shared: demo team and AGM; mine: my person and game', sh.has('team', { id: t.id }) && sh.has('calendar_entry', { id: ag.id }) && !sh.has('person', { id: me2 }) && !sh.has('game', { id: gid }));
  ok('my game kept', (await db2.getFirstAsync(`SELECT 1 FROM sync_outbox WHERE tbl = 'game' AND pk = ?`, JSON.stringify({ id: gid }))) != null);
})();
