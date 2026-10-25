import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { ensureStarterContent, seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import { canChoosePickupEditors, canEditPickup } from '@/domain/permissions';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x).slice(0, 300));
(async () => {
  const db: any = open();
  await migrate(db);
  await seedIfEmpty(db);
  await ensureStarterContent(db);
  const me = await repo.savePerson(db, { first_name: 'Org', last_name: 'Aniser', gender: 'W' });
  const friend = await repo.savePerson(db, { first_name: 'Help', last_name: 'Er', gender: 'M' });
  const other = await repo.savePerson(db, { first_name: 'Rand', last_name: 'Om', gender: 'M' });
  await repo.setMeId(db, me);
  const id = await repo.savePickup(db, {
    name: 'Test pickup',
    region: 'western',
    city: 'Cape Town',
    area: null,
    day_of_week: 2,
    start_time: '18:00',
    end_time: null,
    venue_text: null,
    map_url: null,
    contact_name: null,
    contact_phone: null,
    whatsapp_url: null,
    level: 'all',
    cost: null,
    notes: null,
  });
  let p: any = await repo.getPickup(db, id);
  ok('creator recorded', p.created_by_person === me);
  ok('creator can edit and choose editors', canEditPickup(p, 'player', me) && canChoosePickupEditors(p, 'player', me));
  ok('others can’t (even coordinators)', !canEditPickup(p, 'player', other) && !canEditPickup(p, 'coordinator', other));
  ok('admins can', canEditPickup(p, 'admin', other));
  await repo.savePickup(db, { ...p, editor_ids: JSON.stringify([friend]) });
  p = await repo.getPickup(db, id);
  ok('editor can edit but not choose editors', canEditPickup(p, 'player', friend) && !canChoosePickupEditors(p, 'player', friend));
  ok('saving keeps who added it', p.created_by_person === me);
  const starter = (await repo.listPickups(db)).find((x: any) => x.id !== id)!;
  ok('starter pickups: admins only', !canEditPickup(starter, 'coordinator', me) && canEditPickup(starter, 'admin', me));
})();
