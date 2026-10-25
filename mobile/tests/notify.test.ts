import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import { planNotifications, setPrefs, DEFAULT_PREFS } from '@/notify/plan';
import { detectEvents } from '@/notify/events';
import { rulesFor } from '@/domain/rules';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x));
(async () => {
  const db: any = open();
  await migrate(db);
  await seedIfEmpty(db);
  const ts = await repo.listTeams(db);
  const chilli = ts.find((t) => t.name === 'Chilli Legends')!,
    ghost = ts.find((t) => t.name === 'Ghost')!;
  const me = await repo.savePerson(db, { first_name: 'Sam', last_name: 'B', gender: 'W' }, { teamId: chilli.id });
  const mate = await repo.savePerson(db, { first_name: 'Lerato', last_name: 'K', gender: 'W' }, { teamId: chilli.id });
  await repo.setMeId(db, me);
  const now = new Date('2026-10-22T10:00:00');
  const ev = await repo.saveEvent(db, { name: 'League', kind: 'league', level: 'league', division: 'mixed', teams: [] });
  const at = (d: string) => new Date(d).toISOString();
  const [g1, g2] = await repo.createFixtures(db, [
    { eventId: ev, homeId: chilli.id, awayId: ghost.id, scheduledAt: at('2026-10-24T18:00:00'), venueId: null, rules: rulesFor('league', 'mixed') },
    { eventId: ev, homeId: ghost.id, awayId: chilli.id, scheduledAt: at('2026-10-25T06:30:00'), venueId: null, rules: rulesFor('league', 'mixed') },
  ]);
  let plan = await planNotifications(db, now);
  const f = (k: string) => plan.find((p) => p.key.startsWith(k));
  const hm = (d: Date) => `${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  ok(
    '24h reminder: day before 18:00, home duty mentioned',
    f(`game24:${g1}`) && hm(f(`game24:${g1}`)!.at) === '23 18:00' && f(`game24:${g1}`)!.body.includes('cones'),
    plan.map((p) => [p.key.slice(0, 12), hm(p.at)]),
  );
  ok('100-min reminder at 16:20 with a pun', f(`game100:${g1}`) && hm(f(`game100:${g1}`)!.at) === '24 16:20', f(`game100:${g1}`));
  ok('06:30 game: 24h reminder moved out of quiet hours to 07:00 (still before the game)', hm(f(`game24:${g2}`)!.at) === '24 7:00', hm(f(`game24:${g2}`)!.at));
  ok('away game: no cones line', !f(`game24:${g2}`)!.body.includes('cones'));
  await setPrefs(db, { ...DEFAULT_PREFS, gameReminders: false });
  ok('turning reminders off removes them', !(await planNotifications(db, now)).some((p) => p.kind === 'gameReminders'));
  await setPrefs(db, DEFAULT_PREFS);

  // a finished game I played in; I'm captain
  await repo.setMembershipRole(db, me, chilli.id, 'captain');
  await repo.startScheduledGame(db, g1, {
    eventId: ev,
    venueId: null,
    teamAId: chilli.id,
    teamBId: ghost.id,
    trackingMode: 'lite',
    rules: rulesFor('league', 'mixed'),
    firstPullTeamId: chilli.id,
    ratioPoint1: null,
    squads: [
      { teamId: chilli.id, personId: me, jersey: null, position: null },
      { teamId: chilli.id, personId: mate, jersey: null, position: null },
    ],
  });
  await repo.endGame(db, (await repo.loadGameData(db, g1))!);
  await db.runAsync(`UPDATE game SET ended_at = ? WHERE id = ?`, at('2026-10-22T19:30:00'), g1);
  plan = await planNotifications(db, now);
  ok('post-game card + check-in 30 min after (20:00)', hm(f(`post:${g1}`)!.at) === '22 20:00');
  ok('next-morning nudge 09:00', hm(f(`post2:${g1}`)!.at) === '23 9:00');
  ok(
    'spirit due 2h after (21:30 → moved before quiet hours since deadline is 07:30)',
    !!f(`spirit:${g1}`),
    plan.map((p) => [p.key.slice(0, 10), hm(p.at)]),
  );
  ok('roster confirm next morning (staff)', hm(f(`roster:${g1}`)!.at) === '23 9:00');
  await repo.saveReflection(db, {
    personId: me,
    teamId: chilli.id,
    gameId: g1,
    sessionId: null,
    kind: 'game',
    minutes: null,
    rpe: 5,
    selfRating: 3,
    playingTime: null,
    niggleArea: null,
    niggleSeverity: null,
    answers: {},
  });
  ok('answering the check-in cancels both post-game messages', !(await planNotifications(db, now)).some((p) => p.key.startsWith('post')));

  // events: baseline then a shout-out
  ok('first run is a silent baseline', (await detectEvents(db)).length === 0);
  await db.runAsync(
    `INSERT INTO shoutout (id, from_person_id, to_person_id, team_id, game_id, reason, created_at) VALUES ('s1', ?, ?, ?, ?, 'Great D', ?)`,
    mate,
    me,
    chilli.id,
    g1,
    at('2026-10-22T20:00:00'),
  );
  const ev1 = await detectEvents(db);
  ok('shout-out notification', ev1.length === 1 && ev1[0].title.includes('Lerato') && ev1[0].body.includes('Great D'), ev1);
  ok('not repeated', (await detectEvents(db)).length === 0);
  await repo.updateFixture(db, g2, { scheduledAt: at('2026-10-26T09:00:00'), venueId: null, homeId: ghost.id, awayId: chilli.id });
  const ev2 = await detectEvents(db);
  ok('fixture moved notification', ev2.length === 1 && ev2[0].title.includes('moved'), ev2);
})();
