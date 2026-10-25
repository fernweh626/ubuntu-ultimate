import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import * as dev from '@/db/development';
import * as clubs from '@/db/clubs';
import { mySchedule } from '@/db/schedule';
import { normNumber, parseStandingCsv, standingCheck, whatsappLink } from '@/domain/standing';
import { rulesFor } from '@/domain/rules';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x));
(async () => {
  // standing CSV parsing
  const p1 = parseStandingCsv('Name,Membership No,Status,Paid until\nSam B,ctf-0123,Paid,31/03/2027\nBen,CTF 0456,Unpaid,\nCara,0789,paid,01/01/2026\n,,\n', '2026-10-23');
  ok('csv: number column found + normalised', p1.rows[0].number === 'CTF0123' && p1.rows[1].number === 'CTF0456' && p1.columns.number === 'membership no', p1);
  ok(
    'csv: status + paid until; past date = lapsed',
    p1.rows[0].status === 'good' && p1.rows[0].paidUntil === '2027-03-31' && p1.rows[1].status === 'unpaid' && p1.rows[2].status === 'lapsed',
    p1.rows,
  );
  const p2 = parseStandingCsv('number;name\n1001;A\n1002;B', '2026-10-23');
  ok('csv: semicolons, no status column = good', p2.rows.length === 2 && p2.rows.every((r) => r.status === 'good'));
  let threw = false;
  try {
    parseStandingCsv('name,email\na,b');
  } catch {
    threw = true;
  }
  ok('csv: no number column is an error', threw);
  ok(
    'standing checks',
    standingCheck(null, null, true).check === 'missing' &&
      standingCheck('1', null, false).check === 'unknown' &&
      standingCheck('1', null, true).check === 'warn' &&
      standingCheck('1', { status: 'good', paid_until: null }, true).check === 'ok',
  );
  ok('whatsapp link SA number', whatsappLink('082 123 4567') === 'https://wa.me/27821234567' && whatsappLink('') === null);

  const db: any = open();
  await migrate(db);
  await seedIfEmpty(db);
  ok('v17', (await db.getFirstAsync('PRAGMA user_version')).user_version === 27);
  const ts = await repo.listTeams(db);
  const chilli = ts.find((t) => t.name === 'Chilli Legends')!,
    ghost = ts.find((t) => t.name === 'Ghost')!;
  const me = await repo.savePerson(db, { first_name: 'Sam', last_name: 'B', gender: 'W' }, { teamId: chilli.id });
  const ben = await repo.savePerson(db, { first_name: 'Ben', last_name: 'C', gender: 'M' }, { teamId: chilli.id });
  await repo.setMeId(db, me);

  // late answers
  const pr = await repo.schedulePractices(db, {
    teamId: chilli.id,
    title: null,
    notes: null,
    startAt: new Date(Date.now() + 2 * 86400_000).toISOString(),
    durationMin: 90,
    venueId: null,
    createdById: me,
  });
  await repo.setRsvp(db, pr, me, 'late', '20 min');
  await repo.setRsvp(db, pr, ben, 'going');
  const up = (await repo.upcomingPractices(db, chilli.id, me))[0];
  ok('late counts as coming, and is counted', up.going === 2 && up.late === 1 && up.my_status === 'late', up);
  ok('late note kept', (await repo.myRsvp(db, pr, me))!.reason === '20 min');
  const [g] = await repo.createFixtures(db, [
    { eventId: null, homeId: chilli.id, awayId: ghost.id, scheduledAt: new Date(Date.now() + 5 * 86400_000).toISOString(), venueId: null, rules: rulesFor('league', 'mixed') },
  ]);
  await dev.setAvailability(db, g, chilli.id, me, 'late', 'work');
  const sch = await mySchedule(db);
  ok(
    'schedule: practice + game with my answers',
    sch.items.length === 2 &&
      sch.items.find((i) => i.kind === 'practice')!.status === 'late' &&
      sch.items.find((i) => i.kind === 'game')!.status === 'late' &&
      sch.items.find((i) => i.kind === 'game')!.coming === 1,
    sch.items,
  );

  // registration + readiness
  await dev.saveAccreditation(db, me, { level: 'standard', expiresOn: '2027-12-31', photoUri: null });
  await dev.saveRegistration(db, me, { safda_number: 'sa-001', region_code: 'western', region_number: 'ctf 0123', phone: '0821234567' });
  await dev.saveRegistration(db, ben, { safda_number: 'SA002', region_code: 'western', region_number: null, phone: null });
  let r = await dev.readiness(db, chilli.id);
  ok('readiness before lists: unknown standing', r.find((x) => x.id === me)!.safdaListed === false);
  // simulate a pulled list
  const at = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO association_standing (id, association, number, status, paid_until, uploaded_at, updated_at) VALUES (?, 'safda', ?, 'good', NULL, ?, ?)`,
    `safda:${normNumber('SA001')}`,
    normNumber('SA001'),
    at,
    at,
  );
  await db.runAsync(
    `INSERT INTO association_standing (id, association, number, status, paid_until, uploaded_at, updated_at) VALUES (?, 'western', ?, 'good', '2027-03-31', ?, ?)`,
    `western:CTF0123`,
    'CTF0123',
    at,
    at,
  );
  r = await dev.readiness(db, chilli.id);
  const amy = r.find((x) => x.id === me)!,
    b = r.find((x) => x.id === ben)!;
  ok('readiness: Sam matched on both lists (number formats differ)', amy.safda?.status === 'good' && amy.region?.status === 'good' && amy.safdaListed && amy.regionListed);
  ok(
    'readiness: Ben not on list, no region number',
    !b.safda && standingCheck(b.reg?.safda_number, b.safda, b.safdaListed).check === 'warn' && standingCheck(b.reg?.region_number, b.region, b.regionListed).check === 'missing',
  );
  ok('registration goes to outbox; standing does not push', !!(await db.getFirstAsync(`SELECT 1 FROM sync_outbox WHERE tbl = 'registration'`)));

  // clubs
  const clubId = await clubs.saveClub(db, { name: 'Chilli Ultimate Club', region: 'western', primary_color: '#BF0000' }, ben);
  await repo.saveTeam(db, { ...chilli, club_id: clubId, division: 'mixed' });
  const open_ = await repo.saveTeam(db, { name: 'Chilli Open', club_id: clubId, division: 'open', region: 'western' });
  const ct = await clubs.clubTeams(db, clubId);
  ok(
    'club has two teams with divisions',
    ct.length === 2 &&
      ct
        .map((t) => t.division)
        .sort()
        .join() === 'mixed,open',
    ct.map((t) => [t.name, t.division]),
  );
  ok(
    'creator is club admin',
    (await clubs.clubStaff(db, clubId)).some((s) => s.person_id === ben && s.role === 'admin'),
  );
  await repo.setMeId(db, ben);
  const acc = await repo.getAccess(db);
  ok('club admin is staff on all club teams (even ones not on)', acc.staffTeamIds.includes(open_) && acc.staffTeamIds.includes(chilli.id), acc.staffTeamIds);
  await repo.joinTeam(db, me, open_, 'core', null);
  const sq = await clubs.clubSquad(db, clubId);
  ok(
    'club squad merges people across teams',
    sq.find((p) => p.id === me)!.teams.length === 2 && sq.length === 2,
    sq.map((p) => [p.first_name, p.teams.length]),
  );
})();
