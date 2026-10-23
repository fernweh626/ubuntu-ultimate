/*
 * Hat tournaments: everyone signs up on their own, the organiser draws balanced teams.
 * Pure functions: captain suggestions, the draw, placing on-the-day players, and the day's schedule.
 */

export type HatPlayer = { id: string; gender: 'W' | 'M' | 'X' | null; skill: number; wantsCaptain: boolean };
export type HatTeam = { name: string; color: string; captainId: string | null; playerIds: string[] };

/** Shirt colours hats usually go with; the organiser can rename them. */
export const HAT_COLOURS: { name: string; color: string }[] = [
  { name: 'Light', color: '#E9ECEF' },
  { name: 'Dark', color: '#293750' },
  { name: 'Red', color: '#C62828' },
  { name: 'Blue', color: '#1565C0' },
  { name: 'Green', color: '#2E7D32' },
  { name: 'Yellow', color: '#F9A825' },
  { name: 'Orange', color: '#EF6C00' },
  { name: 'Purple', color: '#6A1B9A' },
  { name: 'Pink', color: '#D81B60' },
  { name: 'Teal', color: '#00838F' },
];

/** Enough for a full line plus about half again in subs: 7v7 → about 11 a team. */
export function suggestTeamCount(players: number, perSide: number) {
  if (players < perSide * 2) return 2;
  return Math.max(2, Math.floor(players / Math.round(perSide * 1.5)));
}

/** Suggested captains: the most skilled of those willing, alternating female/male matching where possible. */
export function recommendCaptains(players: HatPlayer[], teams: number) {
  const willing = players.filter((p) => p.wantsCaptain).sort((a, b) => b.skill - a.skill);
  const w = willing.filter((p) => p.gender === 'W');
  const rest = willing.filter((p) => p.gender !== 'W');
  const out: string[] = [];
  for (let i = 0; out.length < teams && (w.length || rest.length); i++) {
    const from = i % 2 === 0 ? (w.length ? w : rest) : rest.length ? rest : w;
    out.push(from.shift()!.id);
  }
  return out;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * The draw: captains first, one per team, then everyone else snake-drafted by skill within their
 * gender, always to the team that needs them most, so teams match on size, F/M split and skill.
 */
export function drawTeams(players: HatPlayer[], teamCount: number, captainIds: string[], names = HAT_COLOURS, random?: () => number): HatTeam[] {
  // Ties between equally skilled players break randomly when redrawing, by id otherwise (repeatable).
  const tie = new Map(players.map((p) => [p.id, random ? random() : 0]));
  const teams: HatTeam[] = Array.from({ length: teamCount }, (_, i) => ({
    name: names[i % names.length].name + (i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : ''),
    color: names[i % names.length].color,
    captainId: captainIds[i] ?? null,
    playerIds: captainIds[i] ? [captainIds[i]] : [],
  }));
  const byId = new Map(players.map((p) => [p.id, p]));
  const placed = new Set(captainIds);
  for (const group of ['W', 'M', 'X'] as const) {
    const pool = players
      .filter((p) => !placed.has(p.id) && (group === 'X' ? p.gender !== 'W' && p.gender !== 'M' : p.gender === group))
      .sort((a, b) => b.skill - a.skill || tie.get(a.id)! - tie.get(b.id)! || a.id.localeCompare(b.id));
    for (const p of pool) {
      const t = bestTeamIndex(teams, p, byId);
      teams[t].playerIds.push(p.id);
      placed.add(p.id);
    }
  }
  return teams;
}

/**
 * Where a player fits best without moving anyone: fewest of their gender, then fewest players,
 * then the lowest total skill.
 */
export function bestTeamIndex(teams: { playerIds: string[] }[], p: HatPlayer, byId: Map<string, HatPlayer>) {
  const keyOf = (t: { playerIds: string[] }) => {
    const members = t.playerIds.map((id) => byId.get(id)).filter((x): x is HatPlayer => !!x);
    const sameGender = members.filter((m) => (m.gender === 'W') === (p.gender === 'W')).length;
    return [sameGender, members.length, members.reduce((a, m) => a + m.skill, 0)];
  };
  let best = 0;
  let bestKey = keyOf(teams[0]);
  for (let i = 1; i < teams.length; i++) {
    const key = keyOf(teams[i]);
    // Compare field by field: the first difference decides.
    const k = key.findIndex((v, j) => v !== bestKey[j]);
    if (k >= 0 && key[k] < bestKey[k]) {
      best = i;
      bestKey = key;
    }
  }
  return best;
}

export function teamSummary(t: { playerIds: string[] }, byId: Map<string, HatPlayer>) {
  const m = t.playerIds.map((id) => byId.get(id)).filter((x): x is HatPlayer => !!x);
  return { size: m.length, women: m.filter((x) => x.gender === 'W').length, men: m.filter((x) => x.gender === 'M').length, skill: avg(m.map((x) => x.skill)) };
}

/** Kick-off times for the day: one field, games back to back with a short break between. */
export function hatSlots(startIso: string, games: number, gameMinutes: number, breakMinutes = 10, fields = 1) {
  const start = Date.parse(startIso);
  return Array.from({ length: games }, (_, i) => ({
    at: new Date(start + Math.floor(i / fields) * (gameMinutes + breakMinutes) * 60_000).toISOString(),
    field: (i % fields) + 1,
  }));
}

/** A self-rating counts for the draw if it's under six months old; otherwise ask for a quick one. */
export const SKILL_FRESH_DAYS = 182;
