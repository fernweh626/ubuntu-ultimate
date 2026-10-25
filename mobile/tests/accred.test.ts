import { accreditationCheck, needsAdvanced } from '@/domain/development';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x).slice(0, 300));
const now = new Date('2026-10-26T10:00:00');
const valid = '2027-06-30';
ok(
  'captains, spirit captains, internationals need Advanced',
  needsAdvanced('captain', 'club') && needsAdvanced('spirit_captain', 'club') && needsAdvanced('player', 'national') && !needsAdvanced('player', 'club') && !needsAdvanced('coach', 'club'),
);
ok('nothing saved: missing', accreditationCheck({ level: null, expires_on: null }).check === 'missing');
const v = accreditationCheck({ level: 'standard', expires_on: valid, status: 'verified', file: 'x.pdf' }, { role: 'player', teamKind: 'club' }, now);
ok('standard, verified, player: ok', v.check === 'ok' && v.text.includes('checked'), v);
const u = accreditationCheck({ level: 'standard', expires_on: valid, status: 'unverified', file: 'x.pdf' }, {}, now);
ok('not checked yet: not ready', u.check === 'unknown' && u.text.includes('not checked yet'), u);
const nofile = accreditationCheck({ level: 'advanced', expires_on: valid, status: 'unverified', file: null }, {}, now);
ok('no PDF uploaded says so', nofile.text.includes('no certificate uploaded'), nofile);
const cap = accreditationCheck({ level: 'standard', expires_on: valid, status: 'verified', file: 'x' }, { role: 'captain', teamKind: 'club' }, now);
ok('captain on Standard: warn', cap.check === 'warn' && cap.text.includes('captains need Advanced'), cap);
const intl = accreditationCheck({ level: 'standard', expires_on: valid, status: 'verified', file: 'x' }, { role: 'player', teamKind: 'national' }, now);
ok('international team player on Standard: warn', intl.check === 'warn' && intl.text.includes('international teams need Advanced'), intl);
const intlOk = accreditationCheck({ level: 'advanced', expires_on: valid, status: 'verified', file: 'x' }, { role: 'player', teamKind: 'national' }, now);
ok('international on Advanced, verified: ok', intlOk.check === 'ok', intlOk);
const rej = accreditationCheck({ level: 'advanced', expires_on: valid, status: 'rejected', file: 'x' }, {}, now);
ok('problem found: warn', rej.check === 'warn' && rej.text.includes('certificate problem'), rej);
ok('expired: warn', accreditationCheck({ level: 'advanced', expires_on: '2026-01-01', status: 'verified' }, {}, now).check === 'warn');
