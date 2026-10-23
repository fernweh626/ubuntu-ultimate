/* Accreditation, self-rating and fitness benchmark rules. Pure functions. */

export type AccreditationLevel = 'standard' | 'advanced';
export const ACCREDITATION_LEVELS: Record<AccreditationLevel, string> = { standard: 'Standard', advanced: 'Advanced' };

export type AccreditationState = 'valid' | 'expiring' | 'expired' | 'unknown';

/** Days from `now` to the expiry date (negative once expired). */
export function daysUntil(expiresOn: string, now = new Date()) {
  const end = new Date(`${expiresOn.slice(0, 10)}T23:59:59`);
  return Math.floor((end.getTime() - now.getTime()) / 86400_000);
}

/** Expiring = within 30 days: leagues, regionals and nationals check it. */
export function accreditationState(expiresOn: string | null | undefined, now = new Date()): AccreditationState {
  if (!expiresOn) return 'unknown';
  const d = daysUntil(expiresOn, now);
  if (d < 0) return 'expired';
  if (d <= 30) return 'expiring';
  return 'valid';
}

/* ---------------- Self-rating ---------------- */

export type RatingArea = 'experience' | 'throwing' | 'receiving' | 'defence' | 'athleticism';
export const RATING_AREAS: { key: RatingArea; label: string; hint: string }[] = [
  { key: 'experience', label: 'Experience & game sense', hint: 'Reading the play, knowing the rules, decisions under pressure.' },
  { key: 'throwing', label: 'Throwing', hint: 'Backhand, forehand, hucks, break throws, under pressure.' },
  { key: 'receiving', label: 'Cutting & catching', hint: 'Timing, getting open, reliable hands, layouts.' },
  { key: 'defence', label: 'Defence', hint: 'Marking, staying with your player, poaching, zone.' },
  { key: 'athleticism', label: 'Fitness & athleticism', hint: 'Speed, endurance, agility, playing hard all game.' },
];
/** 1–5, each with a plain meaning so players rate against the same yardstick. */
export const RATING_SCALE = ['Beginner', 'Developing', 'Solid club player', 'Strong / regional level', 'National-team level'];
export const RATING_MAX = RATING_SCALE.length;

/** Re-rate every six months. */
export const RATING_EVERY_DAYS = 182;

export function ratingDue(lastRatedOn: string | null | undefined, now = new Date()) {
  if (!lastRatedOn) return true;
  return (now.getTime() - new Date(lastRatedOn).getTime()) / 86400_000 >= RATING_EVERY_DAYS;
}

/* ---------------- Fitness benchmarks ---------------- */

export type FitnessKind = 'beep' | 'agility_5105' | 'sprint_40' | 'sprint_60';

export const FITNESS_TESTS: { kind: FitnessKind; label: string; short: string; unit: string; lowerIsBetter: boolean; placeholder: string; how: string }[] = [
  { kind: 'beep', label: 'Beep test', short: 'Beep', unit: 'level', lowerIsBetter: false, placeholder: '10.5', how: 'Level.shuttle you reached, e.g. 10.5 = level 10, shuttle 5.' },
  { kind: 'agility_5105', label: '5-10-5 agility', short: '5-10-5', unit: 's', lowerIsBetter: true, placeholder: '4.85', how: 'Pro-agility shuttle, best of two, in seconds.' },
  { kind: 'sprint_40', label: '40 m sprint', short: '40 m', unit: 's', lowerIsBetter: true, placeholder: '5.60', how: 'From a standing start, in seconds.' },
  { kind: 'sprint_60', label: '60 m sprint', short: '60 m', unit: 's', lowerIsBetter: true, placeholder: '8.10', how: 'From a standing start, in seconds.' },
];
export const fitnessTest = (kind: FitnessKind) => FITNESS_TESTS.find((t) => t.kind === kind)!;

/** Beep is stored as level + shuttle/100 so it sorts correctly: "10.5" → 10.05, "9.11" → 9.11. */
export function parseFitness(kind: FitnessKind, text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (kind === 'beep') {
    const m = /^(\d{1,2})(?:[.\-/ ](\d{1,2}))?$/.exec(t);
    if (!m) return null;
    const level = Number(m[1]);
    const shuttle = Number(m[2] ?? 0);
    if (level < 1 || level > 21 || shuttle > 16) return null;
    return level + shuttle / 100;
  }
  const v = Number(t);
  if (!Number.isFinite(v) || v <= 0 || v > 60) return null;
  return Math.round(v * 100) / 100;
}

export function formatFitness(kind: FitnessKind, value: number) {
  if (kind === 'beep') {
    const level = Math.floor(value + 1e-9);
    const shuttle = Math.round((value - level) * 100);
    return `${level}.${shuttle}`;
  }
  return `${value.toFixed(2)} s`;
}

export function isBetter(kind: FitnessKind, a: number, b: number) {
  return fitnessTest(kind).lowerIsBetter ? a < b : a > b;
}

/** Personal best from a list of results. */
export function best(kind: FitnessKind, values: number[]) {
  if (!values.length) return null;
  return values.reduce((m, v) => (isBetter(kind, v, m) ? v : m));
}
