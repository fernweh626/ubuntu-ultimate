import type { EventKind } from '@/db/types';

import { dmyToIso } from './format';

/* ---------------- Postponing and forfeiting ---------------- */

export const STATUS_REASONS = {
  weather: 'Weather',
  lights: 'Lights',
  not_enough_men: 'Not enough men',
  not_enough_women: 'Not enough women',
  other: 'Other',
} as const;
export type StatusReason = keyof typeof STATUS_REASONS;

/** League games may be postponed twice; after that, and at any tournament, the only option is to forfeit. */
export const MAX_POSTPONEMENTS = 2;

export function canPostpone(eventKind: EventKind | null | undefined, postponements: number) {
  return eventKind === 'league' && postponements < MAX_POSTPONEMENTS;
}

export function postponeRuleText(eventKind: EventKind | null | undefined, postponements: number) {
  if (eventKind !== 'league') return 'Tournament games can’t be postponed — a team that can’t play forfeits.';
  const left = MAX_POSTPONEMENTS - postponements;
  if (left <= 0) return 'This game has been postponed twice already. A team that can’t play now forfeits.';
  return `League games can be postponed twice. ${left === 1 ? 'One postponement left.' : 'Two postponements left.'}`;
}

/* ---------------- Round robin ---------------- */

export type Pairing = { round: number; homeId: string; awayId: string };

/**
 * Circle method: every team plays every other team once per cycle, one game a round. Odd team counts get
 * a bye each round. Home duty (setting up the field) is then shared out fairly — see balanceHomes.
 * On the return cycle each fixture is replayed with home and away swapped.
 */
export function roundRobin(teamIds: string[], cycles = 1): Pairing[] {
  const ids: (string | null)[] = [...teamIds];
  if (ids.length < 2) return [];
  if (ids.length % 2) ids.push(null);
  const n = ids.length;
  const rounds = n - 1;

  const firstCycle: Pairing[] = [];
  let order = [...ids];
  for (let r = 0; r < rounds; r += 1) {
    for (let i = 0; i < n / 2; i += 1) {
      const a = order[i];
      const b = order[n - 1 - i];
      if (a && b) firstCycle.push({ round: r + 1, homeId: a, awayId: b });
    }
    // Keep the first team fixed and rotate the rest one place.
    order = [order[0], order[n - 1], ...order.slice(1, n - 1)];
  }

  balanceHomes(firstCycle);

  const out: Pairing[] = [...firstCycle];
  for (let c = 1; c < cycles; c += 1) {
    for (const p of firstCycle) {
      const swap = c % 2 === 1;
      out.push({ round: c * rounds + p.round, homeId: swap ? p.awayId : p.homeId, awayId: swap ? p.homeId : p.awayId });
    }
  }
  return out;
}

/**
 * Decide who hosts each game so every team hosts as evenly as possible (within one game).
 * Treat games as edges between teams; walking one continuous loop through every edge (an Euler circuit)
 * and making the team you leave the host means each team hosts exactly as often as it travels. That loop
 * needs every team to have an even number of games, so teams with an odd count are first paired up with
 * temporary dummy games, which are dropped afterwards.
 */
function balanceHomes(games: Pairing[]) {
  type Edge = { u: string; v: string; game: Pairing | null; used: boolean };
  const edges: Edge[] = games.map((g) => ({ u: g.homeId, v: g.awayId, game: g, used: false }));
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.u, (degree.get(e.u) ?? 0) + 1);
    degree.set(e.v, (degree.get(e.v) ?? 0) + 1);
  }
  const odd = [...degree.keys()].filter((t) => degree.get(t)! % 2 === 1);
  for (let i = 0; i + 1 < odd.length; i += 2) edges.push({ u: odd[i], v: odd[i + 1], game: null, used: false });

  const adj = new Map<string, number[]>();
  edges.forEach((e, i) => {
    adj.set(e.u, [...(adj.get(e.u) ?? []), i]);
    adj.set(e.v, [...(adj.get(e.v) ?? []), i]);
  });

  // Hierholzer's algorithm, iterative; orient each edge in the direction it is walked.
  for (const start of adj.keys()) {
    const stack: string[] = [start];
    while (stack.length) {
      const at = stack[stack.length - 1];
      const list = adj.get(at)!;
      while (list.length && edges[list[list.length - 1]].used) list.pop();
      if (!list.length) {
        stack.pop();
        continue;
      }
      const e = edges[list.pop()!];
      e.used = true;
      const to = e.u === at ? e.v : e.u;
      if (e.game) {
        e.game.homeId = at;
        e.game.awayId = to;
      }
      stack.push(to);
    }
  }
}

export type Slot = { venueId: string | null; time: string };

/**
 * Turn pairings into dated fixtures: round 1 on the first date, then every `daysBetween` days. Within a
 * round, games fill the slots in order (field × kick-off time), wrapping to the next day if they run out.
 */
export function assignSlots(pairings: Pairing[], firstDateIso: string, daysBetween: number, slots: Slot[]) {
  const usable = slots.length ? slots : [{ venueId: null, time: '18:00' }];
  return pairings.map((p) => {
    const inRound = pairings.filter((x) => x.round === p.round);
    const index = inRound.indexOf(p);
    const extraDays = Math.floor(index / usable.length);
    const slot = usable[index % usable.length];
    const d = new Date(`${firstDateIso}T00:00:00`);
    d.setDate(d.getDate() + (p.round - 1) * daysBetween + extraDays);
    const [hh, mm] = slot.time.split(':').map(Number);
    d.setHours(hh, mm, 0, 0);
    return { ...p, venueId: slot.venueId, scheduledAt: d.toISOString() };
  });
}

/* ---------------- Spreadsheet import ---------------- */

export type ImportRow = {
  line: number;
  scheduledAt: string | null;
  venueName: string | null;
  homeId: string | null;
  awayId: string | null;
  homeText: string;
  awayText: string;
  pool: string | null;
  error: string | null;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function splitLine(line: string) {
  // Accept commas, semicolons (Excel in SA locale) or tabs (copied from Google Sheets).
  const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
  return line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
}

/**
 * Columns: date, time, field, home team, away team[, pool]. Dates as dd/mm/yyyy, times as HH:MM.
 * A header row is skipped. Teams match by name or short name.
 */
export function parseSchedule(text: string, teams: { id: string; name: string; short_name: string | null }[]): ImportRow[] {
  const find = (s: string) => {
    const q = norm(s);
    return teams.find((t) => norm(t.name) === q || (t.short_name && norm(t.short_name) === q))?.id ?? null;
  };
  const rows: ImportRow[] = [];
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .forEach((raw, i) => {
      if (!raw) return;
      const cells = splitLine(raw);
      if (i === 0 && /date/i.test(cells[0] ?? '')) return;
      const [date = '', time = '', field = '', home = '', away = '', pool = ''] = cells;
      const iso = dmyToIso(date);
      const timeOk = /^\d{1,2}:\d{2}$/.test(time);
      const homeId = find(home);
      const awayId = find(away);
      let error: string | null = null;
      if (!iso) error = `Date “${date}” should be dd/mm/yyyy`;
      else if (!timeOk) error = `Time “${time}” should be HH:MM`;
      else if (!homeId) error = `No team called “${home}”`;
      else if (!awayId) error = `No team called “${away}”`;
      else if (homeId === awayId) error = 'Home and away are the same team';
      let scheduledAt: string | null = null;
      if (iso && timeOk) {
        const [hh, mm] = time.split(':').map(Number);
        const d = new Date(`${iso}T00:00:00`);
        d.setHours(hh, mm, 0, 0);
        scheduledAt = d.toISOString();
      }
      rows.push({ line: i + 1, scheduledAt, venueName: field || null, homeId, awayId, homeText: home, awayText: away, pool: pool || null, error });
    });
  return rows;
}

export const SCHEDULE_TEMPLATE = `date,time,field,home,away,pool
06/03/2027,18:00,Plumstead 1,Chilli Legends,Ghost,
06/03/2027,18:00,Plumstead 2,Maties Meerkats,Nomad,
06/03/2027,19:30,Plumstead 1,UCT Flying Tigers,Catch 22,`;
