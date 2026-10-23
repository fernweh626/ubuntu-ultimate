import type { Division } from '@/db/types';

/** The rule settings a game is played under. Stored on each game as JSON so old games keep their rules. */
export type Rules = {
  pointTarget: number;
  halftimeTarget: number;
  softCapMinutes: number | null;
  hardCapMinutes: number | null;
  timeoutsPerTeam: number;
  timeoutSeconds: number;
  pullWithinSeconds: number;
  mixedRatio: boolean;
  halftimeMinutes: number;
  /** Players per side on the field: 7 normally; hats and pickups also play 4v4 or 5v5. */
  playersPerSide?: number;
};

/** How many of each on a line for a ratio point: 7 → 4 and 3, 5 → 3 and 2. Even sides have no ratio. */
export function lineNeed(ratio: 'W' | 'M' | string | null, perSide = 7) {
  if (ratio !== 'W' && ratio !== 'M') return null;
  if (perSide % 2 === 0) return null;
  const major = Math.ceil(perSide / 2);
  const minor = perSide - major;
  return { W: ratio === 'W' ? major : minor, M: ratio === 'M' ? major : minor };
}

export type RulesPreset = { id: string; name: string; summary: string; rules: Rules };

const WFDF: Rules = {
  pointTarget: 15,
  halftimeTarget: 8,
  softCapMinutes: 90,
  hardCapMinutes: 100,
  timeoutsPerTeam: 2,
  timeoutSeconds: 75,
  pullWithinSeconds: 75,
  mixedRatio: true,
  halftimeMinutes: 7,
};

export const RULE_PRESETS: RulesPreset[] = [
  {
    id: 'wfdf',
    name: 'Tournament (WFDF)',
    summary: 'To 15 · half at 8 · caps 90/100 min · 2 timeouts',
    rules: WFDF,
  },
  {
    id: 'league',
    name: 'League night',
    summary: 'To 11 · half at 6 · cap 60 min · 1 timeout',
    rules: { ...WFDF, pointTarget: 11, halftimeTarget: 6, softCapMinutes: 55, hardCapMinutes: 60, timeoutsPerTeam: 1, halftimeMinutes: 5 },
  },
  {
    id: 'beach',
    name: 'Beach (5v5)',
    summary: 'To 11 · half at 6 · cap 50 min · 5 a side, 3–2 ratio',
    rules: { ...WFDF, pointTarget: 11, halftimeTarget: 6, softCapMinutes: null, hardCapMinutes: 50, timeoutsPerTeam: 1, halftimeMinutes: 3, playersPerSide: 5 },
  },
  {
    id: 'casual',
    name: 'Scrimmage / pickup',
    summary: 'To 15 · no caps · no ratio enforcement',
    rules: { ...WFDF, softCapMinutes: null, hardCapMinutes: null, mixedRatio: false },
  },
];

export function rulesFor(presetId: string, division: Division): Rules {
  const preset = RULE_PRESETS.find((p) => p.id === presetId) ?? RULE_PRESETS[0];
  // Beach is usually played mixed (3–2), so it keeps the ratio like the mixed division.
  return { ...preset.rules, mixedRatio: preset.rules.mixedRatio && (division === 'mixed' || division === 'beach') };
}

export function parseRules(json: string | null | undefined): Rules {
  try {
    return { ...WFDF, ...(json ? JSON.parse(json) : {}) };
  } catch {
    return WFDF;
  }
}

/**
 * Mixed ratio rule A (ABBA): point 1 uses the chosen ratio, then the ratio alternates in blocks of two
 * (A, B, B, A, A, B, B, …). Halftime does not reset the pattern.
 */
export function ratioForPoint(pointNumber: number, first: 'M' | 'W' | null): 'M' | 'W' | null {
  if (!first) return null;
  const other = first === 'M' ? 'W' : 'M';
  return Math.floor(pointNumber / 2) % 2 === 0 ? first : other;
}

/**
 * Where a point sits in its ABBA block: 1 = first of the pair, 2 = second (the ratio switches after it).
 * Point 1 stands alone, so it's a 1. Shown as F1, F2, M1, M2.
 */
export function ratioSlot(pointNumber: number): 1 | 2 {
  return pointNumber === 1 || pointNumber % 2 === 0 ? 1 : 2;
}

export function ratioCode(ratio: string | null, pointNumber: number) {
  if (ratio !== 'W' && ratio !== 'M') return '';
  return `${ratio === 'W' ? 'F' : 'M'}${ratioSlot(pointNumber)}`;
}

export function ratioLabel(ratio: 'M' | 'W' | null) {
  if (ratio === 'W') return '4 female matching · 3 male matching';
  if (ratio === 'M') return '4 male matching · 3 female matching';
  return '';
}
