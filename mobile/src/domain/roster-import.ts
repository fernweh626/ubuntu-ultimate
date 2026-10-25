/*
 * Read an association's membership-form export (Google Forms → CSV), current or past years, into
 * rows for the pre-loaded member list. Columns are found by their wording, not their position, so
 * older forms with different questions still work. Pure functions.
 */

export type RosterRow = {
  number: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  emergency: string | null;
  suburb: string | null;
  gender: 'W' | 'M' | null;
  population_group: string | null;
  origin: 'local' | 'transplant' | null;
  birth_year: number | null;
  involvement: string | null;
  season: number | null;
};

/** CSV with quotes, doubled quotes and line breaks inside quoted cells (Google Forms "paragraph" answers). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const s = text.replace(/^﻿/, '');
  const sep = (s.split('\n')[0].match(/;/g)?.length ?? 0) > (s.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cell.trim());
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((x) => x)) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x)) rows.push(row);
  return rows;
}

const has = (h: string, ...words: string[]) => words.some((w) => h.includes(w));

/** Which column holds what, from the header wording. */
export function mapColumns(header: string[]) {
  const h = header.map((x) => x.toLowerCase().trim());
  const find = (test: (x: string) => boolean) => h.findIndex(test);
  return {
    timestamp: find((x) => has(x, 'timestamp')),
    email: find((x) => has(x, 'email') && !has(x, 'emergency')),
    first_name: find((x) => (x === 'name' || x === 'first name' || has(x, 'first name')) && !has(x, 'surname')),
    last_name: find((x) => has(x, 'surname', 'last name')),
    number: find((x) => has(x, 'number') && !has(x, 'cell', 'phone', 'emergency', 'contact')),
    phone: find((x) => has(x, 'cell', 'phone', 'mobile') && !has(x, 'emergency')),
    emergency: find((x) => has(x, 'emergency')),
    suburb: find((x) => has(x, 'suburb')),
    gender: find((x) => has(x, 'gender')),
    population_group: find((x) => has(x, 'population', 'race')),
    origin: find((x) => has(x, 'transplant', 'local or')),
    birth: find((x) => has(x, 'birth')),
    involvement: find((x) => has(x, 'involvement', 'expected level')),
  };
}

const yearOf = (v: string) => {
  const m = v.match(/(19|20)\d\d/);
  return m ? Number(m[0]) : null;
};

/** Rows for the pre-loaded list. Numbers not in the association's format (e.g. "CFD" for new) become null. */
export function parseRosterCsv(text: string, numberPrefix: string): { rows: RosterRow[]; skipped: number; found: string[] } {
  const [header, ...body] = parseCsv(text);
  if (!header) return { rows: [], skipped: 0, found: [] };
  const c = mapColumns(header);
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() || null : null);
  const numberRe = new RegExp(`^${numberPrefix}\\s*\\d+$`, 'i');
  const rows: RosterRow[] = [];
  let skipped = 0;
  for (const r of body) {
    const email = get(r, c.email)?.toLowerCase() ?? null;
    const rawNumber = get(r, c.number)?.replace(/\s/g, '').toUpperCase() ?? null;
    const number = rawNumber && numberRe.test(rawNumber) ? rawNumber : null;
    if (!email && !number) {
      skipped += 1;
      continue;
    }
    const g = get(r, c.gender)?.toLowerCase() ?? '';
    const o = get(r, c.origin)?.toLowerCase() ?? '';
    rows.push({
      number,
      first_name: get(r, c.first_name),
      last_name: get(r, c.last_name),
      email,
      phone: get(r, c.phone),
      emergency: get(r, c.emergency),
      suburb: get(r, c.suburb),
      gender: g.startsWith('wom') || g.startsWith('fem') ? 'W' : g.startsWith('man') || g.startsWith('mal') || g.startsWith('men') ? 'M' : null,
      population_group: get(r, c.population_group),
      origin: o.includes('transplant') ? 'transplant' : o.includes('born') || o.includes('local') ? 'local' : null,
      birth_year: c.birth >= 0 ? yearOf(get(r, c.birth) ?? '') : null,
      involvement: get(r, c.involvement),
      season: c.timestamp >= 0 ? yearOf(get(r, c.timestamp) ?? '') : null,
    });
  }
  const found = Object.entries(c)
    .filter(([, i]) => i >= 0)
    .map(([k]) => k);
  return { rows, skipped, found };
}

/** Emergency contact "my Mom 026 356 2563" → name and number. */
export function splitEmergency(v: string | null | undefined) {
  const s = (v ?? '').trim();
  const m = s.match(/(\+?[\d][\d\s-]{6,})/);
  if (!m) return { name: s || null, phone: null };
  return {
    name:
      s
        .replace(m[0], '')
        .replace(/[-–,:]+$/, '')
        .trim() || null,
    phone: m[0].trim(),
  };
}
