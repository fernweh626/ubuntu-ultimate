import { createHash } from 'node:crypto';
import { md5 } from '@/db/md5';
import { SEED_CLUBS } from '@/content/hub';
const cases = [
  '',
  'a',
  'team:Chilli Legends',
  'venue:Plumstead 1',
  'calendar:Mixed Nationals 2026',
  'team:Zoë’s Ultimate — Pietermaritzburg',
  'x'.repeat(55),
  'x'.repeat(56),
  'x'.repeat(64),
  'y'.repeat(1000),
  ...SEED_CLUBS.map((c) => `team:${c.name}`),
];
const bad = cases.filter((c) => md5(c) !== createHash('md5').update(c, 'utf8').digest('hex'));
console.log(bad.length ? `FAIL ${JSON.stringify(bad)}` : `ok   md5 matches node for ${cases.length} cases (incl. unicode and block edges)`);
