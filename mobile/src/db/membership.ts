import type { SQLiteDatabase } from 'expo-sqlite';

import { type AssociationForm } from '@/content/associations';
import type { RosterRow } from '@/domain/roster-import';
import { splitEmergency } from '@/domain/roster-import';
import { supabase } from '@/lib/supabase';

import { getRegistration } from './development';
import { notifyChanged } from './live';
import { uuid } from './repo';

/*
 * Association membership: the yearly form, member numbers and payment status, plus demographics.
 * Numbers come from the server (issue_member_number) so two phones never hand out the same one.
 */

export type MembershipStatus = 'social' | 'unpaid' | 'claimed' | 'paid' | 'waived';
export type Membership = {
  id: string;
  person_id: string;
  association: string;
  season: number;
  number: string | null;
  involvement: string | null;
  option: string | null;
  fee_cents: number;
  status: MembershipStatus;
  pay_reference: string | null;
  consents_json: string | null;
  note: string | null;
  submitted_at: string | null;
  paid_at: string | null;
};
export type Demographic = { id: string; person_id: string; population_group: string | null; origin: 'local' | 'transplant' | null; birth_year: number | null; suburb: string | null; consent_at: string | null };

const now = () => new Date().toISOString();
export const membershipId = (assoc: string, season: number, personId: string) => `${assoc}:${season}:${personId}`;

export function getMembership(db: SQLiteDatabase, personId: string, assoc: string, season: number) {
  return db.getFirstAsync<Membership>(`SELECT * FROM association_membership WHERE id = ?`, membershipId(assoc, season, personId));
}

export function getDemographic(db: SQLiteDatabase, personId: string) {
  return db.getFirstAsync<Demographic>(`SELECT * FROM person_demographic WHERE person_id = ?`, personId);
}

export async function saveDemographic(db: SQLiteDatabase, personId: string, d: Omit<Demographic, 'id' | 'person_id' | 'consent_at'>) {
  const ts = now();
  await db.runAsync(
    `INSERT INTO person_demographic (id, person_id, population_group, origin, birth_year, suburb, consent_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET population_group = excluded.population_group, origin = excluded.origin, birth_year = excluded.birth_year,
       suburb = excluded.suburb, consent_at = excluded.consent_at, updated_at = excluded.updated_at`,
    personId, personId, d.population_group, d.origin, d.birth_year, d.suburb, ts, ts, ts,
  );
  notifyChanged();
}

export type MembershipInput = {
  personId: string;
  assoc: AssociationForm;
  number: string | null;
  involvement: string;
  option: string | null;
  feeCents: number;
  payReference: string | null;
  consents: Record<string, boolean>;
  note: string | null;
};

/** Save the year's form. Free memberships are 'social' (or 'waived'); paid ones wait for payment. */
export async function submitMembership(db: SQLiteDatabase, m: MembershipInput) {
  const id = membershipId(m.assoc.code, m.assoc.season, m.personId);
  const ts = now();
  const existing = await db.getFirstAsync<{ status: MembershipStatus }>(`SELECT status FROM association_membership WHERE id = ?`, id);
  const competitive = !!m.option;
  // Keep a payment that's already confirmed or claimed; otherwise work it out from the fee.
  const status: MembershipStatus =
    existing && (existing.status === 'paid' || existing.status === 'claimed') ? existing.status : !competitive ? 'social' : m.feeCents ? 'unpaid' : 'waived';
  await db.runAsync(
    `INSERT INTO association_membership (id, person_id, association, season, number, involvement, option, fee_cents, status, pay_reference, consents_json, note, submitted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET number = excluded.number, involvement = excluded.involvement, option = excluded.option, fee_cents = excluded.fee_cents,
       status = excluded.status, pay_reference = excluded.pay_reference, consents_json = excluded.consents_json, note = excluded.note,
       submitted_at = excluded.submitted_at, updated_at = excluded.updated_at`,
    id, m.personId, m.assoc.code, m.assoc.season, m.number, m.involvement, m.option, m.feeCents, status, m.payReference, JSON.stringify(m.consents), m.note, ts, ts, ts,
  );
  notifyChanged();
  return status;
}

/** "I've paid": waits for the association to confirm it against their payments. */
export async function claimPaid(db: SQLiteDatabase, id: string) {
  await db.runAsync(`UPDATE association_membership SET status = 'claimed', updated_at = ? WHERE id = ? AND status = 'unpaid'`, now(), id);
  notifyChanged();
}

/** Admins: confirm (or undo) a payment. */
export async function setPaid(db: SQLiteDatabase, id: string, paid: boolean) {
  const ts = now();
  await db.runAsync(`UPDATE association_membership SET status = ?, paid_at = ?, updated_at = ? WHERE id = ?`, paid ? 'paid' : 'unpaid', paid ? ts : null, ts, id);
  notifyChanged();
}

/** Ask the server for my member number (the one I have, the one on the list for my email, or the next free one). */
export async function issueMemberNumber(assoc: AssociationForm): Promise<string | null> {
  const { data, error } = await supabase.rpc('issue_member_number', { assoc: assoc.code, prefix: assoc.numberPrefix });
  if (error) return null;
  return (data as string | null) ?? null;
}

/** Claim a number I already have (e.g. CT123). Returns my number, or an error message if it's someone else's. */
export async function claimMemberNumber(assoc: AssociationForm, num: string): Promise<{ number: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('claim_member_number', { assoc: assoc.code, prefix: assoc.numberPrefix, num });
  if (error) return { number: null, error: error.message };
  return { number: (data as string) ?? null, error: null };
}

/** My own row on the pre-loaded list (matched on my sign-in email), to fill in the form. */
export async function myRosterRow(assoc: AssociationForm): Promise<RosterRow | null> {
  const { data, error } = await supabase.rpc('my_roster_row', { assoc: assoc.code });
  if (error || !data) return null;
  const row = (Array.isArray(data) ? data[0] : data) as RosterRow & { id?: string | null };
  return row?.id || row?.email ? row : null;
}

/**
 * Fill in anything missing on my profile from the pre-loaded list: number, phone, emergency contact,
 * gender and demographics. Never overwrites what's already there. Returns what was filled in.
 */
export async function prefillFromRoster(db: SQLiteDatabase, personId: string, assoc: AssociationForm) {
  const r = await myRosterRow(assoc);
  if (!r) return [];
  const filled: string[] = [];
  const ts = now();
  const reg = await getRegistration(db, personId);
  const em = splitEmergency(r.emergency);
  const next = {
    region_code: reg?.region_code ?? assoc.regionCode,
    region_number: reg?.region_number || (r.number ?? null),
    phone: reg?.phone || r.phone,
    emergency_name: reg?.emergency_name || em.name,
    emergency_phone: reg?.emergency_phone || em.phone,
  };
  if (!reg?.region_number && r.number) filled.push(`${assoc.short} number ${r.number}`);
  if (!reg?.phone && r.phone) filled.push('cell number');
  if (!reg?.emergency_phone && em.phone) filled.push('emergency contact');
  await db.runAsync(
    `INSERT INTO registration (id, person_id, safda_number, region_code, region_number, phone, emergency_name, emergency_phone, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(person_id) DO UPDATE SET region_code = excluded.region_code, region_number = excluded.region_number, phone = excluded.phone,
       emergency_name = excluded.emergency_name, emergency_phone = excluded.emergency_phone, updated_at = excluded.updated_at`,
    reg?.id ?? uuid(), personId, reg?.safda_number ?? null, next.region_code, next.region_number, next.phone, next.emergency_name, next.emergency_phone, ts, ts,
  );
  if (r.gender) {
    const res = await db.runAsync(`UPDATE person SET gender = ?, updated_at = ? WHERE id = ? AND gender IS NULL`, r.gender, ts, personId);
    if (res.changes) filled.push('gender');
  }
  const d = await getDemographic(db, personId);
  if (!d && (r.population_group || r.origin || r.birth_year || r.suburb)) {
    await saveDemographic(db, personId, { population_group: r.population_group, origin: r.origin, birth_year: r.birth_year, suburb: r.suburb });
    filled.push('demographics');
  }
  notifyChanged();
  return filled;
}

/** Submitted offline? Get the number now and use it as the payment reference. */
export async function ensureNumber(db: SQLiteDatabase, m: Membership, assoc: AssociationForm) {
  if (m.number) return m.number;
  const n = await issueMemberNumber(assoc);
  if (!n) return null;
  const ts = now();
  await db.runAsync(`UPDATE association_membership SET number = ?, pay_reference = CASE WHEN fee_cents > 0 AND status IN ('unpaid','claimed') AND (pay_reference IS NULL OR pay_reference LIKE 'member_%') THEN ? ELSE pay_reference END, updated_at = ? WHERE id = ?`, n, n, ts, m.id);
  await db.runAsync(`UPDATE registration SET region_number = ?, region_code = COALESCE(region_code, ?), updated_at = ? WHERE person_id = ? AND (region_number IS NULL OR region_number = '')`, n, assoc.regionCode, ts, m.person_id);
  notifyChanged();
  return n;
}

/* ---------------- Admin: the register ---------------- */

export type RegisterRow = Membership & { first_name: string; last_name: string; gender: string | null; email: string | null; phone: string | null; population_group: string | null; origin: string | null; birth_year: number | null };

export function membershipRegister(db: SQLiteDatabase, assoc: string, season: number) {
  return db.getAllAsync<RegisterRow>(
    `SELECT m.*, p.first_name, p.last_name, p.gender, p.email, r.phone, d.population_group, d.origin, d.birth_year
       FROM association_membership m JOIN person p ON p.id = m.person_id
       LEFT JOIN registration r ON r.person_id = m.person_id
       LEFT JOIN person_demographic d ON d.person_id = m.person_id
      WHERE m.association = ? AND m.season = ?
      ORDER BY p.first_name COLLATE NOCASE, p.last_name COLLATE NOCASE`,
    assoc,
    season,
  );
}

/** Totals only: how many in each group. Never shown per person. */
export function demographicTotals(rows: Pick<RegisterRow, 'gender' | 'population_group' | 'origin' | 'involvement' | 'birth_year'>[], season: number) {
  const count = (key: (r: (typeof rows)[number]) => string | null) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = key(r) ?? 'Not given';
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const ageBand = (y: number | null) => {
    if (!y) return null;
    const a = season - y;
    return a < 18 ? 'Under 18' : a < 25 ? '18–24' : a < 35 ? '25–34' : a < 45 ? '35–44' : '45+';
  };
  return {
    total: rows.length,
    gender: count((r) => (r.gender === 'W' ? 'Female matching' : r.gender === 'M' ? 'Male matching' : null)),
    population: count((r) => r.population_group),
    origin: count((r) => (r.origin === 'local' ? 'Born in SA' : r.origin === 'transplant' ? 'Transplant' : null)),
    age: count((r) => ageBand(r.birth_year)),
    involvement: count((r) => r.involvement),
  };
}

/** Admins: upload membership-form exports to the server-only pre-loaded list. */
export async function uploadRoster(assoc: AssociationForm, rows: RosterRow[]) {
  const at = new Date().toISOString();
  const records = rows.map((r) => ({ id: `${assoc.code}:${r.number ?? r.email}`, association: assoc.code, ...r, uploaded_at: at }));
  // Later rows win for the same person (newer forms come later in an export).
  const unique = [...new Map(records.map((r) => [r.id, r])).values()];
  for (let i = 0; i < unique.length; i += 500) {
    const { error } = await supabase.from('association_roster').upsert(unique.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  return unique.length;
}
