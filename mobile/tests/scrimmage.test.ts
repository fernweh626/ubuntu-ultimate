import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { ensureStarterContent, seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import { rulesFor } from '@/domain/rules';
import { byMatching, posShort } from '@/domain/roster';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x).slice(0, 300));
(async () => {
  const db: any = open();
  await migrate(db);
  await seedIfEmpty(db);
  await ensureStarterContent(db);
  const before = (await repo.listTeams(db)).length;
  const { light, dark } = await repo.createScrimmageSides(db);
  ok('Light and Dark made', light.name === 'Light' && dark.name === 'Dark' && light.kind === 'pickup');
  ok('hidden from team lists', (await repo.listTeams(db)).length === before);
  const a = await repo.savePerson(db, { first_name: 'Zoe', last_name: 'A', gender: 'W', position: 'handler' });
  const b = await repo.savePerson(db, { first_name: 'Abe', last_name: 'B', gender: 'M' });
  const c = await repo.savePerson(db, { first_name: 'Ann', last_name: 'C', gender: 'W', is_placeholder: 1 });
  const gid = await repo.createGame(db, {
    eventId: null,
    venueId: null,
    teamAId: light.id,
    teamBId: dark.id,
    trackingMode: 'lite',
    rules: rulesFor('casual', 'mixed'),
    firstPullTeamId: light.id,
    ratioPoint1: null,
    squads: [
      { teamId: light.id, personId: a, jersey: null, position: 'handler' },
      { teamId: light.id, personId: c, jersey: null, position: null },
      { teamId: dark.id, personId: b, jersey: null, position: null },
    ],
  } as any);
  const d = (await repo.loadGameData(db, gid))!;
  ok('squads on each side', d.players.filter((p) => p.team_id === light.id).length === 2 && d.players.filter((p) => p.team_id === dark.id).length === 1);
  ok('no team memberships created', !(await db.getFirstAsync(`SELECT 1 FROM membership WHERE team_id IN (?, ?)`, light.id, dark.id)));
  const g = byMatching([
    { first_name: 'Zoe', gender: 'W' },
    { first_name: 'Abe', gender: 'M' },
    { first_name: 'Ann', gender: 'W' },
    { first_name: 'Kim', gender: null },
  ]);
  ok('roster: female first, alphabetical, then male, then other', g.map((x) => `${x.key}:${x.items.map((i) => i.first_name).join('/')}`).join(' ') === 'W:Ann/Zoe M:Abe X:Kim', g);
  ok('C / H / Hy', posShort('cutter') === 'C' && posShort('handler') === 'H' && posShort('hybrid') === 'Hy' && posShort(null) === null);
})();
