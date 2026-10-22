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

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
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
