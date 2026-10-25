/*
 * Rosters everywhere: female matching, then male matching, then anyone else, each alphabetical,
 * with positions shown as C / H / Hy.
 */

// Same as colors.female / colors.male / colors.muted in the theme (kept here so this stays UI-free).
const FEMALE = '#A3125A';
const MALE = '#00695C';
const OTHER = '#5A6372';

export type Matchable = { gender?: string | null; first_name: string; last_name?: string | null };
export type MatchingGroup<P> = { key: 'W' | 'M' | 'X'; title: string; color: string; items: P[] };

/** C / H / Hy for cutter, handler, hybrid. */
export function posShort(position: string | null | undefined) {
  return position === 'cutter' ? 'C' : position === 'handler' ? 'H' : position === 'hybrid' ? 'Hy' : null;
}

/**
 * Female matching, then male matching, then anyone else; alphabetical by first name inside each
 * unless `keepOrder` (e.g. a bench sorted freshest first). Empty groups are left out.
 */
export function byMatching<P extends Matchable>(list: P[], keepOrder = false): MatchingGroup<P>[] {
  const sort = (xs: P[]) => (keepOrder ? xs : [...xs].sort((a, b) => a.first_name.localeCompare(b.first_name) || (a.last_name ?? '').localeCompare(b.last_name ?? '')));
  return (
    [
      { key: 'W', title: 'Female matching', color: FEMALE, items: sort(list.filter((p) => p.gender === 'W')) },
      { key: 'M', title: 'Male matching', color: MALE, items: sort(list.filter((p) => p.gender === 'M')) },
      { key: 'X', title: 'Other', color: OTHER, items: sort(list.filter((p) => p.gender !== 'W' && p.gender !== 'M')) },
    ] as MatchingGroup<P>[]
  ).filter((g) => g.items.length);
}
