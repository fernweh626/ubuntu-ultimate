import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { ensureStarterContent, seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import { homeFeed, nextPickup, tagName, dayLabel } from '@/db/home';
import { rulesFor } from '@/domain/rules';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x));
(async () => {
  const db: any = open(); await migrate(db); await seedIfEmpty(db); await ensureStarterContent(db);
  ok('v9', (await db.getFirstAsync('PRAGMA user_version')).user_version === 26);
  const ts = await repo.listTeams(db); const T = (n: string) => ts.find((t) => t.name === n)!;
  const chilli = T('Chilli Legends'), ghost = T('Ghost'), catch22 = T('Catch 22'), nomad = T('Nomad'), sky = T('Skyveld');
  const me = await repo.savePerson(db, { first_name: 'Sam', last_name: 'B', gender: 'W' }, { teamId: chilli.id });
  await repo.joinTeam(db, me, catch22.id, 'core', null);
  await repo.setMeId(db, me);
  const now = new Date('2026-10-22T10:00:00');
  const at = (s: string) => new Date(s).toISOString();
  const mixed = await repo.saveEvent(db, { name: 'Cape Town Mixed League 2026', kind: 'league', level: 'league', division: 'mixed', region: 'western', teams: [{ teamId: chilli.id }, { teamId: ghost.id }] } as any);
  const womens = await repo.saveEvent(db, { name: 'Cape Town Women’s League 2026', kind: 'league', level: 'league', division: 'women', region: 'western', teams: [{ teamId: catch22.id }, { teamId: nomad.id }] } as any);
  const other = await repo.saveEvent(db, { name: 'Gauteng Mixed League 2026', kind: 'league', level: 'league', division: 'mixed', region: 'northern', teams: [{ teamId: sky.id }] } as any);
  await repo.createFixtures(db, [
    { eventId: mixed, homeId: chilli.id, awayId: ghost.id, scheduledAt: at('2026-10-25T09:00:00'), venueId: null, rules: rulesFor('league', 'mixed') },
    { eventId: womens, homeId: nomad.id, awayId: catch22.id, scheduledAt: at('2026-10-26T10:00:00'), venueId: null, rules: rulesFor('league', 'mixed') },
    { eventId: womens, homeId: nomad.id, awayId: catch22.id, scheduledAt: at('2026-11-20T10:00:00'), venueId: null, rules: rulesFor('league', 'mixed') },
    { eventId: mixed, homeId: ghost.id, awayId: nomad.id, scheduledAt: at('2026-10-24T09:00:00'), venueId: null, rules: rulesFor('league', 'mixed') },
  ]);
  const pick = (await repo.listPickups(db))[0];
  await repo.setFollowing(db, 'pickup', pick.id, true);
  const f = await homeFeed(db, now);
  ok('competitions: both my leagues + followed pickup, not Gauteng', f.competitions.length === 3 && !f.competitions.some((c) => c.id === other), f.competitions.map((c) => c.name));
  ok('tag names drop the year', f.competitions[0].name.endsWith('League'), f.competitions.map((c) => c.name));
  ok('next fixture line', f.competitions.find((c) => c.id === mixed)!.line1.includes('v Ghost'), f.competitions);
  const games = f.timeline.filter((t) => t.kind === 'game');
  ok('timeline: my 2 games this week only (not other teams in my league, not next month)', games.length === 2, f.timeline.map((t) => t.title));
  ok('two teams → titles say which', games[0].title === 'Chilli Legends v Ghost' && games[1].title === 'Catch 22 v Nomad', games.map((g) => g.title));
  ok('tagged with competition', games[0].tag?.name === 'Cape Town Mixed League' && games[1].tag?.name === 'Cape Town Women’s League');
  ok('home duty noted', games[0].subtitle.includes('cones'));
  ok('pickup in timeline', f.timeline.some((t) => t.kind === 'pickup'));
  ok('sorted by time', f.timeline.every((t, i) => i === 0 || f.timeline[i - 1].at <= t.at));
  // nextPickup: Wednesday (2) 18:00 from Thursday → next Wednesday
  const n = nextPickup({ day_of_week: 2, start_time: '18:00' }, new Date('2026-10-22T10:00:00'));
  ok('nextPickup rolls to next week', n.getDate() === 28 && n.getHours() === 18, n.toString());
  const same = nextPickup({ day_of_week: 3, start_time: '17:30' }, new Date('2026-10-22T18:30:00'));
  ok('pickup that started an hour ago still shows today', same.getDate() === 22);
  ok('dayLabel', dayLabel(at('2026-10-22T18:00:00'), now) === 'Today' && dayLabel(at('2026-10-23T09:00:00'), now) === 'Tomorrow');
  ok('tagName', tagName('Mixed Nationals 2026') === 'Mixed Nationals');
  // follow sync trigger survived the table rebuild
  await repo.setFollowing(db, 'team', sky.id, true);
  ok('follow still goes to outbox after v9 rebuild', !!(await db.getFirstAsync(`SELECT 1 FROM sync_outbox WHERE tbl = 'follow'`)));
})();
