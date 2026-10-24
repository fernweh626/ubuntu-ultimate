import { eventPhase, scorableEvents, type ScorableEvent } from '@/domain/scorable-events';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x).slice(0, 300));
const ev = (id: string, kind: string, start: string | null, end: string | null, region = 'wc', name = id): ScorableEvent => ({ id, name, kind, region, location: null, start_date: start, end_date: end });
const today = '2026-10-24';
const list = [
  ev('league-now', 'league', '2026-08-01', '2026-11-30'),
  ev('league-noend', 'league', '2026-02-01', null),
  ev('league-old', 'league', '2025-02-01', null),
  ev('tour-today', 'tournament', '2026-10-24', null),
  ev('tour-past', 'tournament', '2026-09-01', '2026-09-02'),
  ev('tour-soon', 'tournament', '2026-11-07', '2026-11-08', 'gp', 'Gauteng Open'),
  ev('tour-later', 'tournament', '2026-12-01', null),
  ev('scrim', 'scrimmage', '2026-10-24', null),
];
ok('league with no end runs to year end', eventPhase(list[1], today) === 'active' && eventPhase(list[2], today) === 'past');
ok('one-day tournament today is on', eventPhase(list[3], today) === 'active');
const r = scorableEvents(list, today);
ok('active first, by start', r.active.map((e) => e.id).join() === 'league-noend,league-now,tour-today', r.active.map((e) => e.id));
ok('upcoming by date', r.upcoming.map((e) => e.id).join() === 'tour-soon,tour-later', r.upcoming.map((e) => e.id));
ok('no past, no scrimmages', ![...r.active, ...r.upcoming].some((e) => ['league-old', 'tour-past', 'scrim'].includes(e.id)));
ok('region filter', scorableEvents(list, today, { region: 'gp' }).upcoming.map((e) => e.id).join() === 'tour-soon');
ok('search', scorableEvents(list, today, { q: 'gauteng' }).upcoming.length === 1 && scorableEvents(list, today, { q: 'gauteng' }).active.length === 0);
