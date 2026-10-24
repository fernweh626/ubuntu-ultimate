/*
 * Which leagues and tournaments you can score a game for: on now first, then coming up, never ones
 * that are over. Filtered by region and a search, so it still works with thousands of events.
 */

export type ScorableEvent = { id: string; name: string; kind: string; region: string | null; location: string | null; start_date: string | null; end_date: string | null };
export type EventPhase = 'active' | 'upcoming' | 'past';

/** A league without an end date runs for the season (the rest of that year); a tournament without one is a single day. */
export function eventPhase(e: ScorableEvent, today: string): EventPhase {
  if (!e.start_date) return 'active';
  const end = e.end_date ?? (e.kind === 'league' ? `${e.start_date.slice(0, 4)}-12-31` : e.start_date);
  if (end < today) return 'past';
  return e.start_date <= today ? 'active' : 'upcoming';
}

export function scorableEvents(events: ScorableEvent[], today: string, opts: { region?: string | null; q?: string } = {}) {
  const q = (opts.q ?? '').trim().toLowerCase();
  const rows = events
    .filter((e) => e.kind === 'league' || e.kind === 'tournament')
    .map((e) => ({ ...e, phase: eventPhase(e, today) }))
    .filter((e) => e.phase !== 'past')
    .filter((e) => !opts.region || !e.region || e.region === opts.region) // no region set: show everywhere
    .filter((e) => !q || `${e.name} ${e.location ?? ''}`.toLowerCase().includes(q));
  const byStart = (a: ScorableEvent, b: ScorableEvent) => (a.start_date ?? '').localeCompare(b.start_date ?? '') || a.name.localeCompare(b.name);
  return {
    active: rows.filter((e) => e.phase === 'active').sort(byStart),
    upcoming: rows.filter((e) => e.phase === 'upcoming').sort(byStart),
  };
}
