/* Divisions a team plays in; matches event.division. */

export const DIVISIONS: { value: string | null; label: string }[] = [
  { value: 'mixed', label: 'Mixed' },
  { value: 'open', label: 'Open' },
  { value: 'women', label: 'Women’s' },
  { value: 'beach', label: 'Beach' },
  { value: 'u17', label: 'U17' },
  { value: 'u20', label: 'U20' },
  { value: 'u24', label: 'U24' },
  { value: 'masters', label: 'Masters' },
  { value: null, label: 'Not set' },
];

export const divisionName = (d: string | null | undefined) => DIVISIONS.find((x) => x.value === (d ?? null))?.label ?? '';
