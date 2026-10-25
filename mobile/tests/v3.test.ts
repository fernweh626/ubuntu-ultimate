import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import { distanceM } from '@/domain/geo';
import { rulesFor } from '@/domain/rules';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, x);
const dropSyncTriggers = async (db: any) => {
  for (const t of await db.getAllAsync("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'sync_%'")) await db.execAsync(`DROP TRIGGER ${t.name}`);
};
(async () => {
  const db: any = open();
  await migrate(db);
  await seedIfEmpty(db);
  // simulate phone on v2 → upgrade
  await dropSyncTriggers(db);
  await db.execAsync(
    `ALTER TABLE feedback DROP COLUMN images_json; ALTER TABLE team DROP COLUMN banking_details; ALTER TABLE club DROP COLUMN banking_details; DROP TABLE association_membership; DROP TABLE person_demographic; ALTER TABLE event DROP COLUMN website; ALTER TABLE event DROP COLUMN map_url; ALTER TABLE pickup_spot DROP COLUMN editor_ids; ALTER TABLE pickup_spot DROP COLUMN created_by_person; ALTER TABLE registration DROP COLUMN emergency_phone; ALTER TABLE registration DROP COLUMN emergency_name; DROP TABLE pickup_rsvp; ALTER TABLE event DROP COLUMN pop_contact; ALTER TABLE event DROP COLUMN eft_details; DROP TABLE hat_signup; ALTER TABLE event DROP COLUMN team_count; ALTER TABLE event DROP COLUMN hat_status; ALTER TABLE event DROP COLUMN venue_id; ALTER TABLE event DROP COLUMN start_time; ALTER TABLE event DROP COLUMN details; ALTER TABLE event DROP COLUMN payment_url; ALTER TABLE event DROP COLUMN cost; ALTER TABLE event DROP COLUMN is_hat; ALTER TABLE game DROP COLUMN result_mode; ALTER TABLE game DROP COLUMN final_a; ALTER TABLE game DROP COLUMN final_b; ALTER TABLE game DROP COLUMN winner_team_id; DROP TABLE meeting_rsvp; DROP TABLE announcement; ALTER TABLE calendar_entry DROP COLUMN start_time; ALTER TABLE calendar_entry DROP COLUMN end_time; ALTER TABLE calendar_entry DROP COLUMN meeting_url; DROP TABLE club_staff; DROP TABLE org_link; DROP TABLE association_standing; DROP TABLE registration; ALTER TABLE team DROP COLUMN club_id; ALTER TABLE team DROP COLUMN division; DROP TABLE club; DROP TABLE feedback; DROP TABLE practice_attendance; DROP TABLE game_availability; DROP TABLE fitness_test; DROP TABLE self_rating; DROP TABLE accreditation; DROP TABLE practice_rsvp; DROP TABLE sync_outbox; DROP TABLE role_grant; DROP TABLE join_request; ALTER TABLE person DROP COLUMN is_minor; DROP TABLE bracket_slot; ALTER TABLE game DROP COLUMN stage; ALTER TABLE game DROP COLUMN round; DROP TABLE shoutout; DROP TABLE reflection; DROP TABLE session; DROP TABLE game_status_log; ALTER TABLE game DROP COLUMN home_team_id; ALTER TABLE game DROP COLUMN postponements; ALTER TABLE game DROP COLUMN forfeit_team_id; DROP TABLE follow; ALTER TABLE game_player DROP COLUMN confirmation; ALTER TABLE game_player DROP COLUMN added_in_game; PRAGMA user_version = 2;`,
  );
  await migrate(db);
  ok('upgrade v2→v20', (await db.getFirstAsync('PRAGMA user_version')).user_version === 27);
  const ts = await repo.listTeams(db);
  const a = ts.find((t) => t.name === 'Sample Light')!,
    b = ts.find((t) => t.name === 'Sample Dark')!,
    far = ts.find((t) => t.name === 'Gale Force')!;
  ok('access with nobody picked = player', (await repo.getAccess(db)).level === 'player');
  const ra = await repo.roster(db, a.id);
  await repo.setMeId(db, ra[0].id);
  await repo.setTestLevel(db, 'scorekeeper');
  ok('scorekeeper flag', (await repo.getAccess(db)).level === 'scorekeeper');
  await repo.setMembershipRole(db, ra[0].id, a.id, 'captain');
  const acc = await repo.getAccess(db);
  ok('captain = staff of Light', acc.level === 'staff' && acc.staffTeamIds[0] === a.id);
  await repo.setFollowing(db, 'team', far.id, true);
  await repo.setFollowing(db, 'team', far.id, true);
  let sc = await repo.myScope(db);
  ok('scope: my team + followed far team', sc.teamIds.has(a.id) && sc.teamIds.has(far.id) && !sc.teamIds.has(b.id) && sc.myTeamIds.size === 1);
  await repo.setFollowing(db, 'team', far.id, false);
  ok('unfollow', !(await repo.isFollowing(db, 'team', far.id)));
  const gid = await repo.createGame(db, {
    eventId: null,
    venueId: null,
    teamAId: a.id,
    teamBId: b.id,
    trackingMode: 'lite',
    rules: { ...rulesFor('casual', 'mixed'), mixedRatio: false },
    firstPullTeamId: a.id,
    ratioPoint1: null,
    squads: ra.map((p) => ({ teamId: a.id, personId: p.id, jersey: null, position: null })),
  });
  const pid = await repo.savePerson(db, { first_name: 'Late', last_name: 'Arrival', gender: 'M' }, { teamId: a.id, kind: 'guest' });
  await repo.addGamePlayer(db, gid, a.id, pid, null);
  let d = (await repo.loadGameData(db, gid))!;
  ok('casual game has no ratio', d.points[0].ratio === null);
  ok('added on the day flagged, all pending', d.players.find((p) => p.person_id === pid)!.added_in_game === 1 && d.players.every((p) => p.confirmation === 'pending'));
  await repo.setConfirmation(db, gid, ra[1].id, 'played');
  await repo.setConfirmation(db, gid, ra[2].id, 'removed');
  await repo.confirmTeamRoster(db, gid, a.id);
  d = (await repo.loadGameData(db, gid))!;
  const c = (id: string) => d.players.find((p) => p.person_id === id)!.confirmation;
  ok('confirm all keeps removed', c(ra[1].id) === 'confirmed' && c(ra[2].id) === 'removed' && c(pid) === 'confirmed');
  const vid = await repo.saveVenue(db, { name: 'Green Point back field', city: 'Green Point', latitude: -33.9036, longitude: 18.4087 });
  const v = await repo.getVenue(db, vid);
  ok('venue saved', v?.name === 'Green Point back field');
  ok('distance Plumstead1→2 ~ 60m', Math.abs(distanceM({ latitude: -34.026253, longitude: 18.4741681 }, { latitude: -34.0265125, longitude: 18.4735879 }) - 60) < 15);
  await repo.deleteVenue(db, vid);
  ok('venue deleted', !(await repo.listVenues(db)).some((x) => x.id === vid));
})();
