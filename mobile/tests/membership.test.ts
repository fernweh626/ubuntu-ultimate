import { open } from 'expo-sqlite';
import { migrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import * as repo from '@/db/repo';
import { CTFDA, formatRand, isMemberNumber, paymentReference } from '@/content/associations';
import { claimPaid, demographicTotals, getMembership, membershipRegister, saveDemographic, setPaid, submitMembership } from '@/db/membership';
import { parseCsv, parseRosterCsv, splitEmergency } from '@/domain/roster-import';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x).slice(0, 300));
(async () => {
  // A Google Forms export, with a line break inside a quoted answer and a new member's "CFD".
  const csv = `Timestamp,Email,Name,Surname,CTFDA Number,Cell number,Emergency contact name and number,Suburb where you live,Gender,Population Group,Local or Transplant,Year of Birth,Expected level of involvement in 2026 (not ability),Talk to us
2026/02/03 10:00:00,Sam@Example.com,Sam,Example,ct 123,082 111 2222,my Mom 026 356 2563,Observatory,Women Matching,Coloured,Born in South Africa,14/05/1995,Regular competitive leagues (club/team including 2nd tier sign-up),"Loved it.
More clinics please!"
2026/02/04 11:00:00,new@example.com,New,Person,CFD,083 333 4444,Dad 084 555 6666,,Man Matching,White,Transplant,2001-01-01,Pick-up (social) play only,`;
  ok('CSV: quoted line break kept in one cell', parseCsv(csv).length === 3);
  const p = parseRosterCsv(csv, 'CT');
  ok(
    'roster: 2 rows, number normalised, CFD → no number',
    p.rows.length === 2 && p.rows[0].number === 'CT123' && p.rows[1].number === null,
    p.rows.map((r) => r.number),
  );
  ok(
    'roster: email lowercased, gender, origin, birth year, season',
    p.rows[0].email === 'sam@example.com' &&
      p.rows[0].gender === 'W' &&
      p.rows[0].origin === 'local' &&
      p.rows[0].birth_year === 1995 &&
      p.rows[0].season === 2026 &&
      p.rows[1].origin === 'transplant' &&
      p.rows[1].gender === 'M',
  );
  const em = splitEmergency('my Mom 026 356 2563');
  ok('emergency split into name and number', em.name === 'my Mom' && em.phone === '026 356 2563', em);
  ok('CT numbers', isMemberNumber(CTFDA, 'CT123') && !isMemberNumber(CTFDA, 'CFD'));
  ok('reference: number, else member_surname', paymentReference(CTFDA, 'ct123', 'Example') === 'CT123' && paymentReference(CTFDA, null, 'van der Merwe') === 'member_van_der_merwe');
  ok('fees shown in rand', formatRand(40000) === 'R400' && formatRand(0) === 'Free');

  const db: any = open();
  await migrate(db);
  await seedIfEmpty(db);
  ok('v24', (await db.getFirstAsync('PRAGMA user_version')).user_version === 27);
  const me = await repo.savePerson(db, { first_name: 'Sam', last_name: 'Example', gender: 'W' });
  await saveDemographic(db, me, { population_group: 'Coloured', origin: 'local', birth_year: 1995, suburb: null });
  let st = await submitMembership(db, {
    personId: me,
    assoc: CTFDA,
    number: 'CT123',
    involvement: 'competitive',
    option: 'general',
    feeCents: 40000,
    payReference: 'CT123',
    consents: { waiver: true, code_of_conduct: true, anti_harassment: true },
    note: null,
  });
  ok('competitive general → waiting for payment', st === 'unpaid');
  const id = (await getMembership(db, me, 'ctfda', 2026))!.id;
  await claimPaid(db, id);
  ok('"I’ve paid" → claimed', (await getMembership(db, me, 'ctfda', 2026))!.status === 'claimed');
  st = await submitMembership(db, {
    personId: me,
    assoc: CTFDA,
    number: 'CT123',
    involvement: 'competitive',
    option: 'general',
    feeCents: 40000,
    payReference: 'CT123',
    consents: { waiver: true },
    note: 'edit',
  });
  ok('editing the form keeps the payment claim', st === 'claimed');
  await setPaid(db, id, true);
  ok('admin confirms → paid with date', (await getMembership(db, me, 'ctfda', 2026))!.status === 'paid' && !!(await getMembership(db, me, 'ctfda', 2026))!.paid_at);
  const other = await repo.savePerson(db, { first_name: 'Abe', last_name: 'B', gender: 'M' });
  st = await submitMembership(db, { personId: other, assoc: CTFDA, number: null, involvement: 'pickup', option: null, feeCents: 0, payReference: null, consents: { waiver: true }, note: null });
  ok('pickup player → social, no fee', st === 'social');
  const rows = await membershipRegister(db, 'ctfda', 2026);
  ok(
    'register lists both, alphabetical',
    rows.length === 2 && rows[0].first_name === 'Abe',
    rows.map((r: any) => r.first_name),
  );
  const t = demographicTotals(rows, 2026);
  ok('totals only: counts per group', t.total === 2 && t.population.some(([k, n]) => k === 'Coloured' && n === 1) && t.age.some(([k]) => k === '25–34'), t);
  ok('membership queued to sync', !!(await db.getFirstAsync(`SELECT 1 FROM sync_outbox WHERE tbl = 'association_membership'`)));
})();
