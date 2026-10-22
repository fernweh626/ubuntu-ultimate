import type { Person } from '@/db/types';

type NameFields = Pick<Person, 'first_name' | 'last_name' | 'birth_date'>;

export function isMinor(birthDate: string | null | undefined, on = new Date()) {
  if (!birthDate) return false;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return false;
  const eighteenth = new Date(born);
  eighteenth.setFullYear(born.getFullYear() + 18);
  return eighteenth > on;
}

/** Full name for adults; first name + surname initial for under-18s (POPIA). */
export function displayName(p: NameFields) {
  if (isMinor(p.birth_date)) return `${p.first_name} ${initial(p.last_name)}`.trim();
  return `${p.first_name} ${p.last_name}`.trim();
}

/** Short form for buttons on the scoring screen: "Thandi M". */
export function shortName(p: Pick<Person, 'first_name' | 'last_name'>) {
  return `${p.first_name} ${initial(p.last_name)}`.trim();
}

function initial(s: string) {
  return s ? `${s[0].toUpperCase()}` : '';
}

export function byFirstName<T extends Pick<Person, 'first_name' | 'last_name'>>(a: T, b: T) {
  return (
    a.first_name.localeCompare(b.first_name, undefined, { sensitivity: 'base' }) ||
    a.last_name.localeCompare(b.last_name, undefined, { sensitivity: 'base' })
  );
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export function clock(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

export function signedSeconds(s: number) {
  const r = Math.round(s);
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r)}s`;
}

/* Dates are typed and shown as dd/mm/yyyy (South African style) and stored as ISO yyyy-mm-dd. */

/** Adds the slashes while someone types digits: "3006" → "30/06", "30062001" → "30/06/2001". */
export function maskDmy(input: string) {
  const d = input.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "30/06/2001" → "2001-06-30"; null when it isn't a real date. */
export function dmyToIso(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Local calendar date of a timestamp as dd/mm/yyyy. */
export function localDmy(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** "2001-06-30" → "30/06/2001". */
/** Combine dd/mm/yyyy + HH:MM (local time) into an ISO timestamp; null if either is missing or invalid. */
export function dmyTimeToIso(date: string, time: string) {
  const iso = dmyToIso(date);
  if (!iso || !/^\d{1,2}:\d{2}$/.test(time.trim())) return null;
  const [hh, mm] = time.trim().split(':').map(Number);
  if (hh > 23 || mm > 59) return null;
  const d = new Date(`${iso}T00:00:00`);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

export function isoToDmy(iso: string | null | undefined) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export const DAYS =['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Monday = 0 … Sunday = 6, matching pickup_spot.day_of_week. */
export function weekdayIndex(d = new Date()) {
  return (d.getDay() + 6) % 7;
}

export function shortDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${DAYS[weekdayIndex(d)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function dateRange(start: string | null, end: string | null) {
  if (!start) return '';
  const s = new Date(start);
  if (!end || end === start) return `${s.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
  const e = new Date(end);
  if (s.getMonth() === e.getMonth()) return `${s.getDate()}–${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  return `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
}

export function timeOfDay(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function pct(n: number, d: number) {
  if (!d) return '–';
  return `${Math.round((n / d) * 100)}%`;
}

export function round1(n: number) {
  return Math.round(n * 10) / 10;
}
