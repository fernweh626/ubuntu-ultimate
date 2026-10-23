import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import * as dev from '@/db/development';
import { accreditationState, best, formatFitness, parseFitness, ratingDue } from '@/domain/development';
import { rulesFor } from '@/domain/rules';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x));
(async () => {
  const now = new Date('2026-10-23T10:00:00');
  ok('accreditation states', accreditationState('2027-06-01', now) === 'valid' && accreditationState('2026-11-10', now) === 'expiring' && accreditationState('2026-10-01', now) === 'expired' && accreditationState(null) === 'unknown');
  ok('beep parse/format', parseFitness('beep', '10.5') === 10.05 && parseFitness('beep', '9.11') === 9.11 && formatFitness('beep', 10.05) === '10.5' && parseFitness('beep', '25') === null);
  ok('beep 10.5 beats 10.11? no: 10.11 is higher', best('beep', [10.05, 10.11, 9.12]) === 10.11);
  ok('sprints: lower is better', best('sprint_40', [5.8, 5.55, 5.7]) === 5.55 && parseFitness('sprint_40', '5,6') === 5.6);
  ok('rating due after 6 months', ratingDue(null) && ratingDue('2026-04-01', now) && !ratingDue('2026-08-01', now));

  const db: any = open(); await migrate(db); await seedIfEmpty(db);
  ok('v17', (await db.getFirstAsync('PRAGMA user_version')).user_version === 23);
  const ts = await repo.listTeams(db); const chilli = ts.find((t) => t.name === 'Chilli Legends')!, ghost = ts.find((t) => t.name === 'Ghost')!;
  const me = await repo.savePerson(db, { first_name: 'Sam', last_name: 'B', gender: 'W' }, { teamId: chilli.id });
  const a = await repo.savePerson(db, { first_name: 'Ben', last_name: 'C', gender: 'M' }, { teamId: chilli.id });
  const b = await repo.savePerson(db, { first_name: 'Cara', last_name: 'D', gender: 'W' }, { teamId: chilli.id });
  await dev.saveAccreditation(db, me, { level: 'standard', expiresOn: '2027-03-31', photoUri: 'file:///x.jpg' });
  await dev.saveAccreditation(db, me, { level: 'advanced', expiresOn: '2027-04-30', photoUri: 'file:///x.jpg' });
  const acc = await dev.getAccreditation(db, me);
  ok('accreditation upsert (one per person)', acc!.level === 'advanced' && (await db.getAllAsync('SELECT * FROM accreditation')).length === 1);
  const out = await db.getFirstAsync(`SELECT pk FROM sync_outbox WHERE tbl = 'accreditation'`);
  ok('accreditation queued for sync', !!out);
  await dev.addSelfRating(db, me, { experience: 3, throwing: 4, receiving: 3, defence: 2, athleticism: 5, notes: null });
  ok('self rating history', (await dev.selfRatings(db, me)).length === 1);
  await dev.addFitnessResults(db, [{ personId: me, kind: 'beep', value: 10.05, testedOn: '2026-10-01', recordedById: me }, { personId: me, kind: 'beep', value: 11.02, testedOn: '2026-10-20', recordedById: me }, { personId: a, kind: 'sprint_40', value: 5.4, testedOn: '2026-10-20', recordedById: me }]);
  const sq = await dev.squadDevelopment(db, chilli.id);
  const mine = sq.find((p) => p.id === me)!;
  ok('squad view: accreditation, rating, tests', mine.level === 'advanced' && mine.rating?.athleticism === 5 && mine.tests.length === 2 && sq.length === 3, mine);

  // attendance: 3 practices; register on first two
  const p1 = await repo.schedulePractices(db, { teamId: chilli.id, title: null, notes: null, startAt: '2026-10-01T16:00:00.000Z', durationMin: 90, venueId: null, createdById: me }, 3);
  const ps = (await db.getAllAsync(`SELECT id FROM session WHERE series_id = (SELECT series_id FROM session WHERE id = ?) ORDER BY started_at`, p1)).map((r: any) => r.id);
  for (const s of ps) { await repo.setRsvp(db, s, me, 'going'); await repo.setRsvp(db, s, a, 'going'); }
  await dev.setAttendance(db, ps[0], [{ personId: me, attended: true }, { personId: a, attended: false }, { personId: b, attended: true }]);
  await dev.setAttendance(db, ps[1], [{ personId: me, attended: true }, { personId: a, attended: true }]);
  // ps[2] no register → RSVP counts
  const g = (await repo.createFixtures(db, [{ eventId: null, homeId: chilli.id, awayId: ghost.id, scheduledAt: '2026-10-10T08:00:00.000Z', venueId: null, rules: rulesFor('league', 'mixed') }]))[0];
  await dev.setAvailability(db, g, chilli.id, me, 'available');
  await dev.setAvailability(db, g, chilli.id, b, 'unavailable', 'Exam');
  const av = await dev.gameAvailability(db, g, chilli.id);
  ok('game availability list', av.find((x) => x.personId === me)!.status === 'available' && av.find((x) => x.personId === b)!.reason === 'Exam' && av.find((x) => x.personId === a)!.status === null);
  const rank = await dev.attendanceRanking(db, chilli.id, '2026-09-01T00:00:00.000Z', '2026-10-23T00:00:00.000Z');
  const r = (id: string) => rank.rows.find((x) => x.personId === id)!;
  ok('ranking: Sam 3/3, Ben 2/3 with 1 no-show, Cara 1/3', r(me).attended === 3 && r(a).attended === 2 && r(a).noShows === 1 && r(b).attended === 1 && rank.rows[0].personId === me, rank.rows.map((x) => [x.first_name, x.attended, x.noShows]));
  ok('register count', rank.practices === 3 && rank.withRegister === 2);

  const fid = await dev.saveFeedback(db, { kind: 'bug', title: 'Crash on scoring', body: 'steps', screen: 'game', app_version: '1', device: 'android', contact_ok: 1, person_id: me });
  ok('feedback stored unsent', (await dev.unsentFeedback(db)).length === 1);
  await dev.markFeedbackSent(db, fid);
  ok('feedback marked sent', (await dev.unsentFeedback(db)).length === 0 && !(await db.getFirstAsync(`SELECT 1 FROM sync_outbox WHERE tbl = 'feedback'`)));
})();
