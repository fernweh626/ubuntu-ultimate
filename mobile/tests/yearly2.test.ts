import { yearlyInfoMailto, yearlyInfoReminders, yearlyInfoSeason, yearlyInfoText } from '@/domain/yearly';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x).slice(0, 300));
ok('window: 1 Dec 2026 → season 2027', yearlyInfoSeason(new Date(2026, 11, 1)) === 2027);
ok('window: 20 Jan 2027 still open', yearlyInfoSeason(new Date(2027, 0, 20, 18)) === 2027);
ok('window: closed 21 Jan and in November', yearlyInfoSeason(new Date(2027, 0, 21)) === null && yearlyInfoSeason(new Date(2026, 10, 30)) === null);
const r = yearlyInfoReminders(2027);
ok(
  'reminders start 1 Dec, end by 20 Jan, include 18 Jan',
  r[0].getMonth() === 11 && r[0].getDate() === 1 && r.every((d) => d <= new Date(2027, 0, 20, 23)) && r.some((d) => d.getMonth() === 0 && d.getDate() === 18),
  r.map((d) => d.toDateString()),
);
ok('Mondays in between', r.filter((d) => d.getDay() === 1).length >= 6, r.length);
ok('coordinators are told to send by 20 January', /send/i.test(yearlyInfoText(2027, 'coordinator').title) && /20 January/.test(yearlyInfoText(2027, 'coordinator').title));
const mail = yearlyInfoMailto(2027, 'Western');
ok(
  'coordinator email goes to the admin address, with a template',
  mail.startsWith('mailto:admin@ubuntuultimate.example?subject=2027%20registration%20info') && decodeURIComponent(mail).includes('Registration form link:'),
  mail.slice(0, 120),
);
ok('coordinator message names the address', /admin@ubuntuultimate\.example/.test(yearlyInfoText(2027, 'coordinator').body));
