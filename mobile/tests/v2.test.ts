import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import { dmyToIso, isoToDmy, maskDmy, isMinor } from '@/domain/format';
const dropSyncTriggers = async (db: any) => { for (const t of await db.getAllAsync("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'sync_%'")) await db.execAsync(`DROP TRIGGER ${t.name}`); };
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x).slice(0, 300));
(async () => {
  ok('date mask', [maskDmy('3'), maskDmy('3006'), maskDmy('30062001'), maskDmy('30/06/2001x9')].join(' ') === '3 30/06 30/06/2001 30/06/2001');
  ok('date parse', [dmyToIso('30/06/2001'), dmyToIso('31/02/2001'), dmyToIso('1/2/2010'), dmyToIso('2001-06-30'), isoToDmy('2001-06-30')].map(String).join(' ') === '2001-06-30 null 2010-02-01 null 30/06/2001');
  ok('born 2012 is a minor', isMinor(dmyToIso('01/01/2012')) === true);
  const db: any = open(); await migrate(db); await seedIfEmpty(db);
  // Simulate a phone still on schema v1, then upgrade.
  await dropSyncTriggers(db); await db.execAsync('ALTER TABLE event DROP COLUMN website; ALTER TABLE event DROP COLUMN map_url; ALTER TABLE pickup_spot DROP COLUMN editor_ids; ALTER TABLE pickup_spot DROP COLUMN created_by_person; ALTER TABLE registration DROP COLUMN emergency_phone; ALTER TABLE registration DROP COLUMN emergency_name; DROP TABLE pickup_rsvp; ALTER TABLE event DROP COLUMN pop_contact; ALTER TABLE event DROP COLUMN eft_details; DROP TABLE hat_signup; ALTER TABLE event DROP COLUMN team_count; ALTER TABLE event DROP COLUMN hat_status; ALTER TABLE event DROP COLUMN venue_id; ALTER TABLE event DROP COLUMN start_time; ALTER TABLE event DROP COLUMN details; ALTER TABLE event DROP COLUMN payment_url; ALTER TABLE event DROP COLUMN cost; ALTER TABLE event DROP COLUMN is_hat; ALTER TABLE game DROP COLUMN result_mode; ALTER TABLE game DROP COLUMN final_a; ALTER TABLE game DROP COLUMN final_b; ALTER TABLE game DROP COLUMN winner_team_id; DROP TABLE meeting_rsvp; DROP TABLE announcement; ALTER TABLE calendar_entry DROP COLUMN start_time; ALTER TABLE calendar_entry DROP COLUMN end_time; ALTER TABLE calendar_entry DROP COLUMN meeting_url; DROP TABLE club_staff; DROP TABLE org_link; DROP TABLE association_standing; DROP TABLE registration; ALTER TABLE team DROP COLUMN club_id; ALTER TABLE team DROP COLUMN division; DROP TABLE club; DROP TABLE feedback; DROP TABLE practice_attendance; DROP TABLE game_availability; DROP TABLE fitness_test; DROP TABLE self_rating; DROP TABLE accreditation; DROP TABLE practice_rsvp; DROP TABLE sync_outbox; DROP TABLE role_grant; DROP TABLE join_request; ALTER TABLE person DROP COLUMN is_minor; DROP TABLE bracket_slot; ALTER TABLE game DROP COLUMN stage; ALTER TABLE game DROP COLUMN round; DROP TABLE shoutout; DROP TABLE reflection; DROP TABLE session; DROP TABLE game_status_log; ALTER TABLE game DROP COLUMN home_team_id; ALTER TABLE game DROP COLUMN postponements; ALTER TABLE game DROP COLUMN forfeit_team_id; DROP TABLE follow; ALTER TABLE game_player DROP COLUMN confirmation; ALTER TABLE game_player DROP COLUMN added_in_game; ALTER TABLE person DROP COLUMN photo_uri; PRAGMA user_version = 1;');
  await migrate(db);
  ok('v1 phone upgrades to v23', (await db.getFirstAsync('PRAGMA user_version')).user_version === 23);
  const t = (await repo.listTeams(db))[0];
  const p = (await repo.roster(db, (await repo.listTeams(db)).find((x) => x.is_sample)!.id))[0];
  await repo.setPersonPhoto(db, p.id, 'file:///photos/x.jpg'); await repo.setTeamLogo(db, t.id, 'file:///photos/t.jpg');
  ok('photos and logo saved', (await repo.getPerson(db, p.id))!.photo_uri === 'file:///photos/x.jpg' && (await repo.getPersonForEdit(db, p.id))!.photo_uri === 'file:///photos/x.jpg' && (await repo.getTeam(db, t.id))!.logo_uri === 'file:///photos/t.jpg');
  await repo.saveTeam(db, { ...(await repo.getTeam(db, t.id))!, about: 'x' });
  ok('logo kept after team edit', (await repo.getTeam(db, t.id))!.logo_uri === 'file:///photos/t.jpg');
})();
