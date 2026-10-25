import { canAddToLine, lineNeed } from '@/domain/rules';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x).slice(0, 300));
const w3 = lineNeed('W', 7),
  m4 = lineNeed('M', 7);
ok('4F point needs 4 women', w3?.W === 4 && w3?.M === 3);
ok('3 women on a 4M point: no 4th woman', !canAddToLine(['W', 'W', 'W'], 'W', m4, 7));
ok('3 women on a 4M point: a man still fits', canAddToLine(['W', 'W', 'W'], 'M', m4, 7));
ok('4 men on a 4M point: no 5th man', !canAddToLine(['M', 'M', 'M', 'M', 'W'], 'M', m4, 7));
ok('full line takes no one', !canAddToLine(['W', 'W', 'W', 'M', 'M', 'M', 'M'], 'W', m4, 7));
ok('no ratio (open/women): only the line size counts', canAddToLine(['M', 'M', 'M', 'M', 'M', 'M'], 'M', null, 7) && !canAddToLine(['M', 'M', 'M', 'M', 'M', 'M', 'M'], 'M', null, 7));
ok('gender not set: not blocked by ratio', canAddToLine(['W', 'W', 'W'], null, m4, 7));
ok(
  'beach 5 a side, 3W point: no 4th woman, no 3rd man',
  !canAddToLine(['W', 'W', 'W'], 'W', lineNeed('W', 5), 5) && !canAddToLine(['M', 'M'], 'M', lineNeed('W', 5), 5) && canAddToLine(['W', 'W'], 'W', lineNeed('W', 5), 5),
);
