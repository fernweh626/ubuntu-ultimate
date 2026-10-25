/*
 * Good standing with SAFDA and the regional associations (CTFDA, GFDA, …).
 * Admins upload the association's member list as CSV; players enter their own numbers; the app
 * matches the two. Pure functions.
 */

import { COUNTRY } from '@/content/countries';

export type Standing = 'good' | 'unpaid' | 'lapsed';
export type StandingRow = { number: string; status: Standing; paidUntil: string | null };

/** Numbers are compared without spaces, dashes or case: "ctf-0123" = "CTF 0123". */
export const normNumber = (n: string | null | undefined) => (n ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const YES = ['good', 'paid', 'yes', 'y', 'true', '1', 'active', 'current', 'good standing', 'in good standing', 'valid'];
const LAPSED = ['lapsed', 'expired', 'inactive', 'suspended'];

function splitLine(line: string, sep: string) {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function toIsoDate(s: string) {
  const t = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t); // dd/mm/yyyy (South African)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/**
 * Read an association export. Finds the number column ("number", "membership no", "SAFDA #", "ID")
 * and, if present, a status/paid column and a paid-until/expiry column. Without a status column,
 * being on the list means good standing.
 */
export function parseStandingCsv(
  text: string,
  today = new Date().toISOString().slice(0, 10),
): { rows: StandingRow[]; skipped: number; columns: { number: string; status: string | null; until: string | null } } {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!lines.length) throw new Error('The file is empty.');
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const head = splitLine(lines[0], sep).map((h) => h.toLowerCase());
  const find = (...keys: string[]) => head.findIndex((h) => keys.some((k) => h.includes(k)));
  const numCol = find('number', 'membership', 'member no', 'no.', '#', 'id');
  if (numCol < 0) throw new Error('Couldn’t find a membership number column. Name it “number”.');
  const statusCol = find('status', 'standing', 'paid', 'financial');
  const untilCol = find('until', 'expiry', 'expires', 'valid to', 'end date');
  const rows: StandingRow[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, sep);
    const number = normNumber(cells[numCol]);
    if (!number) {
      skipped++;
      continue;
    }
    const until = untilCol >= 0 ? toIsoDate(cells[untilCol] ?? '') : null;
    let status: Standing = 'good';
    if (statusCol >= 0 && statusCol !== untilCol) {
      const v = (cells[statusCol] ?? '').toLowerCase().trim();
      status = YES.includes(v) ? 'good' : LAPSED.includes(v) ? 'lapsed' : 'unpaid';
    }
    if (until && until < today && status === 'good') status = 'lapsed';
    rows.push({ number, status, paidUntil: until });
  }
  return { rows, skipped, columns: { number: head[numCol], status: statusCol >= 0 ? head[statusCol] : null, until: untilCol >= 0 ? head[untilCol] : null } };
}

export type Check = 'ok' | 'warn' | 'missing' | 'unknown';

/** One line of the "ready to play" check for a player. */
export function standingCheck(number: string | null | undefined, row: { status: Standing; paid_until: string | null } | null | undefined, listUploaded: boolean): { check: Check; text: string } {
  if (!normNumber(number)) return { check: 'missing', text: 'No number' };
  if (!listUploaded) return { check: 'unknown', text: 'List not uploaded yet' };
  if (!row) return { check: 'warn', text: 'Not on the latest list' };
  if (row.status === 'good') return { check: 'ok', text: row.paid_until ? `Paid until ${row.paid_until}` : 'Good standing' };
  return { check: 'warn', text: row.status === 'lapsed' ? 'Lapsed' : 'Unpaid' };
}

/**
 * Any phone number in international form, digits only: "+263 77 123 4567" → 263771234567,
 * "0044 7700…" → 447700…, and a local "082 123 4567" gets the app country's code (27821234567).
 */
export function internationalDigits(phone: string | null | undefined, dial = COUNTRY.dial) {
  const raw = (phone ?? '').trim();
  const d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (raw.startsWith('+')) return d;
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return `${dial}${d.slice(1)}`;
  return d.length <= 10 ? `${dial}${d}` : d;
}

/** Phone number → WhatsApp chat link, for numbers from any country. */
export function whatsappLink(phone: string | null | undefined, text?: string) {
  const d = internationalDigits(phone);
  if (!d) return null;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
