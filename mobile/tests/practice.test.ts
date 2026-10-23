import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import { homeFeed } from '@/db/home';
import { planNotifications } from '@/notify/plan';
import { detectEvents } from '@/notify/events';
import { dmyTimeToIso } from '@/domain/format';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x));
(async () => {
  const db: any = open(); await migrate(db); await seedIfEmpty(db);
  ok('v10', (await db.getFirstAsync('PRAGMA user_version')).user_version === 21);
  ok('date+time parse', dmyTimeToIso('28/10/2026', '18:00') === new Date('2026-10-28T18:00:00').toISOString() && dmyTimeToIso('28/10/2026', '25:00') === null);
  const chilli = (await repo.listTeams(db)).find((t) => t.name === 'Chilli Legends')!;
  const me = await repo.savePerson(db, { first_name: 'Sam', last_name: 'B', gender: 'W' }, { teamId: chilli.id });
  const a = await repo.savePerson(db, { first_name: 'Ben', last_name: 'C', gender: 'M' }, { teamId: chilli.id });
  const b = await repo.savePerson(db, { first_name: 'Cara', last_name: 'D', gender: 'W' }, { teamId: chilli.id });
  await repo.setMeId(db, me);
  const now = new Date('2026-10-22T10:00:00');
  const first = await repo.schedulePractices(db, { teamId: chilli.id, title: 'Zone D', notes: 'Bring cones', startAt: new Date('2026-10-23T18:00:00').toISOString(), durationMin: 90, venueId: null, createdById: me }, 4);
  let up = await repo.upcomingPractices(db, chilli.id, me, now);
  ok('4 weekly practices, a week apart, one series', up.length === 4 && new Date(up[1].started_at).getDate() === 30 && new Set(up.map((p) => p.series_id)).size === 1 && !!up[0].series_id, up.map((p) => p.started_at));
  await repo.setRsvp(db, first, me, 'going');
  await repo.setRsvp(db, first, a, 'going');
  await repo.setRsvp(db, first, b, 'not_going', 'Work');
  await repo.setRsvp(db, first, b, 'not_going', 'Exam');
  up = await repo.upcomingPractices(db, chilli.id, me, now);
  ok('counts + F/M split + my answer', up[0].going === 2 && up[0].not_going === 1 && up[0].going_f === 1 && up[0].going_m === 1 && up[0].my_status === 'going', up[0]);
  const d = (await repo.practiceDetail(db, first))!;
  ok('detail: whole squad listed, reason updated not duplicated', d.people.length === 3 && d.people.find((p) => p.personId === b)!.reason === 'Exam', d.people);
  await repo.setRsvp(db, first, a, null);
  ok('clearing an answer', !(await repo.myRsvp(db, first, a)));
  ok('rsvp goes to the outbox', !!(await db.getFirstAsync(`SELECT 1 FROM sync_outbox WHERE tbl = 'practice_rsvp'`)));

  const plan = await planNotifications(db, now);
  const keys = plan.map((p) => p.key.split(':')[0] + ':' + (p.key.split(':')[1] === first ? 'first' : 'later'));
  ok('going → reminder 2h before + check-in after', keys.includes('pgo:first') && keys.includes('pafter:first'), keys);
  ok('not answered later weeks → are you coming?', keys.includes('prsvp:later'), keys);
  const go = plan.find((p) => p.key === `pgo:${first}`)!;
  ok('reminder at 16:00', go.at.getHours() === 16);

  const f = await homeFeed(db, now);
  const pr = f.timeline.find((t) => t.kind === 'practice')!;
  ok('home timeline practice with my answer + link', pr.subtitle.startsWith('You’re going') && pr.url === `/practice/${first}`, pr);

  await detectEvents(db); // baseline
  await repo.cancelPractice(db, up[1].id, true, true);
  up = await repo.upcomingPractices(db, chilli.id, me, now);
  ok('cancel this and later weeks', up.filter((p) => p.cancelled_at).length === 3 && !up[0].cancelled_at, up.map((p) => !!p.cancelled_at));
  const ev = await detectEvents(db);
  ok('cancellation notifications (3)', ev.filter((e) => e.title.includes('cancelled')).length === 3, ev);
  ok('cancelled practices drop out of reminders', !(await planNotifications(db, now)).some((p) => p.key.includes(up[1].id)));
  await repo.cancelPractice(db, up[2].id, false);
  ok('un-cancel one', !(await repo.upcomingPractices(db, chilli.id, me, now))[2].cancelled_at);
  await repo.updatePractice(db, first, { title: 'Hucks', notes: null, startAt: new Date('2026-10-23T17:30:00').toISOString(), durationMin: 60, venueId: null });
  ok('edit practice', (await repo.getSession(db, first))!.title === 'Hucks');
  ok('finished practices leave the upcoming list', (await repo.upcomingPractices(db, chilli.id, me, new Date('2026-10-23T19:00:00'))).every((p) => p.id !== first));
})();
