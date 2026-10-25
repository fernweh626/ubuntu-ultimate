/*
 * Builds the shared demo content for Ubuntu Ultimate.
 *
 *   cd mobile && npx tsx ../tools/demo/build.ts
 *
 * Everything is made up: every player, squad, game, score and practice. Only the clubs, teams and
 * fields are real, from the clubs' own public pages (mobile/src/content/clubs.ts). No spreadsheet
 * or Stall Count export goes in.
 *
 * Outputs (both committed):
 *   mobile/src/content/demo/demo-2026.json                  loaded on phones by ensureDemoContent()
 *   supabase/migrations/<version>_demo_content_v<N>.sql      the same rows for the server
 *
 * v4 replaced an earlier demo built from Stall Count exports. `purge` lists that demo's row ids
 * (hashes only) so phones and the server delete them; see ensureDemoContent() and the v4 migration.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CLUB_DIRECTORY } from '../../mobile/src/content/clubs';
import { md5 } from '../../mobile/src/db/md5';
import { drawTeams, recommendCaptains } from '../../mobile/src/domain/hat';
import { ratioForPoint, rulesFor } from '../../mobile/src/domain/rules';

const ROOT = join(__dirname, '..', '..');
const TODAY = '2026-10-24'; // the demo's "now": games before this are played
const CREATED = '2026-10-24T00:00:00.000Z';

/* ---------------- helpers ---------------- */

const uuidOf = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
/** Same formula as the app's seedId() and the server's seed_id(). */
const seedId = (kind: string, name: string) => uuidOf(md5(`${kind}:${name}`));
// v4 uses its own namespace so none of its ids collide with the earlier demo's (which get deleted).
const demoId = (key: string) => seedId('demo4', key);

/** Small deterministic random generator, so the demo is the same every time it's built. */
function rng(seed: string) {
  let s = parseInt(md5(seed).slice(0, 8), 16) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}
const pickOf = <T>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];

/* ---------------- invented names ---------------- */

const F = ['Thandi', 'Lerato', 'Naledi', 'Zanele', 'Anele', 'Sipho', 'Ayanda', 'Busi', 'Nomvula', 'Palesa', 'Kgomotso', 'Refilwe', 'Lindiwe', 'Amahle', 'Nandi', 'Zinhle', 'Mpho', 'Karabo', 'Lwazi', 'Siyanda', 'Chloe', 'Megan', 'Jessica', 'Kayla', 'Lauren', 'Tayla', 'Jade', 'Hannah', 'Emma', 'Mia', 'Zoë', 'Lara', 'Anja', 'Elmarie', 'Liezl', 'Marike', 'Annelie', 'Carmen', 'Nicole', 'Shannon', 'Aaliyah', 'Fatima', 'Zaida', 'Nazeema', 'Priya', 'Ananya', 'Kirsten', 'Robyn', 'Caitlin', 'Bianca', 'Imke', 'Retha', 'Nadia', 'Leila', 'Tumi', 'Dineo', 'Masego', 'Boitumelo', 'Ntombi', 'Unathi'];
const M = ['Thabo', 'Sizwe', 'Mandla', 'Bongani', 'Lungile', 'Themba', 'Kagiso', 'Tebogo', 'Katlego', 'Neo', 'Lethabo', 'Siyabonga', 'Musa', 'Andile', 'Luthando', 'Xolani', 'Vusi', 'Tshepo', 'Kabelo', 'Lwandle', 'Ryan', 'Jason', 'Michael', 'Daniel', 'Joshua', 'Liam', 'Ethan', 'Matthew', 'Nathan', 'Luke', 'Dylan', 'Connor', 'Tristan', 'Ruan', 'Wikus', 'Pieter', 'Jaco', 'Hendrik', 'Johan', 'Werner', 'Riaan', 'Morné', 'Zaid', 'Yusuf', 'Ashwin', 'Rohan', 'Keegan', 'Brandon', 'Marco', 'Tiago', 'Duncan', 'Gareth', 'Kyle', 'Sean', 'Craig', 'Lebo', 'Tumelo', 'Sibusiso', 'Nkosi', 'Bheki'];
const SURNAMES = ['Dlamini', 'Nkosi', 'Mokoena', 'Khumalo', 'Ndlovu', 'Mahlangu', 'Zulu', 'Mthembu', 'Ngcobo', 'Molefe', 'Mabaso', 'Sithole', 'Radebe', 'Baloyi', 'Maseko', 'Mokwena', 'Tshabalala', 'Nel', 'Botha', 'Pretorius', 'van der Merwe', 'du Toit', 'Steyn', 'Joubert', 'Swanepoel', 'Venter', 'Kruger', 'Fourie', 'le Roux', 'Coetzee', 'Smith', 'Naidoo', 'Pillay', 'Govender', 'Reddy', 'Adams', 'Abrahams', 'Hendricks', 'Jacobs', 'Petersen', 'Williams', 'Isaacs', 'Davids', 'Daniels', 'Februarie', 'Ferreira', 'Pereira', 'Gomes', 'Murray', 'Campbell', 'Fraser', "O'Connor", 'Wilson', 'Taylor', 'Mbeki', 'Sisulu', 'Hlongwane', 'Mkhize', 'Cele', 'Gumede'];

const usedNames = new Set<string>();
function inventName(key: string, gender: 'W' | 'M' | null) {
  const r = rng(`name:${key}`);
  for (let tries = 0; tries < 50; tries++) {
    const first = pickOf(r, gender === 'M' ? M : gender === 'W' ? F : r() < 0.5 ? F : M);
    const last = pickOf(r, SURNAMES);
    const full = `${first} ${last}`;
    if (!usedNames.has(full)) {
      usedNames.add(full);
      return { first, last };
    }
  }
  return { first: pickOf(r, gender === 'M' ? M : F), last: `${pickOf(r, SURNAMES)}-${pickOf(r, SURNAMES)}` };
}

/* ---------------- output tables ---------------- */

type Row = Record<string, string | number | null>;
const T: Record<string, Row[]> = {};
const add = (table: string, row: Row) => (T[table] ??= []).push(row);
// game_player isn't stored: everyone on the two teams' rosters played (the loader and the SQL fill it in).
const ORDER = ['club', 'venue', 'team', 'person', 'membership', 'event', 'event_team', 'game', 'point', 'point_player', 'game_event', 'game_status_log', 'spirit_score', 'session', 'practice_rsvp', 'practice_attendance', 'game_availability', 'calendar_entry', 'announcement', 'hat_signup'];
const VERSION = 4;

/* ---------------- clubs, teams and venues from the public directory ---------------- */

const teamId = (name: string) => seedId('team', name);
const teamUpdates: Row[] = []; // contact details for teams the app already seeds
const SEEDED = new Set(readFileSync(join(ROOT, 'mobile/src/content/hub.ts'), 'utf8').match(/name: '([^']+)', city:/g)!.map((m) => m.slice(7, -8)));

for (const c of CLUB_DIRECTORY) {
  const clubId = seedId('club', c.name);
  add('club', { id: clubId, name: c.name, short_name: c.short ?? null, region: c.region, city: c.city, primary_color: c.color ?? null, contact_phone: null, contact_email: c.email ?? null, website: c.website ?? null, social: c.instagram ?? c.facebook ?? null, about: c.about, created_at: CREATED, updated_at: CREATED });
  for (const t of c.teams) {
    const about = [c.training, c.homeField ? `Home field: ${c.homeField}.` : null].filter(Boolean).join(' ') || null;
    const fields = { club_id: clubId, division: t.division ?? null, contact_email: c.email ?? null, website: c.website ?? null, social: t.instagram ?? c.instagram ?? c.facebook ?? null, about };
    if (SEEDED.has(t.name)) teamUpdates.push({ id: teamId(t.name), ...fields });
    else add('team', { id: teamId(t.name), name: t.name, short_name: t.short ?? null, kind: t.kind ?? 'club', region: c.region, city: c.city, primary_color: t.color ?? c.color ?? null, is_sample: 0, created_at: CREATED, updated_at: CREATED, ...fields });
  }
}

const VENUES: { name: string; city: string; lat: number; lng: number }[] = [
  { name: 'Woolsack Oval, UCT', city: 'Cape Town', lat: -33.95776, lng: 18.46228 },
  { name: 'Scoville Oval, Pinelands', city: 'Cape Town', lat: -33.93806, lng: 18.50577 },
  { name: 'Cape Town Cricket Club, Plumstead', city: 'Cape Town', lat: -34.02638, lng: 18.47411 },
];
for (const v of VENUES) add('venue', { id: seedId('venue', v.name), name: v.name, city: v.city, latitude: v.lat, longitude: v.lng, created_at: CREATED, updated_at: CREATED });
/* ---------------- invented people and squads for every team ---------------- */

const personIdOf = (key: string) => demoId(`person:${key}`);
const people = new Map<string, { id: string; gender: 'W' | 'M' | null }>();
function addPerson(key: string, gender: string, jersey: string | null) {
  if (people.has(key)) return people.get(key)!;
  const g = gender === 'W' ? 'W' : gender === 'M' ? 'M' : null;
  const { first, last } = inventName(key, g);
  const p = { id: personIdOf(key), gender: g };
  people.set(key, p);
  add('person', { id: p.id, first_name: first, last_name: last, gender: g, preferred_number: jersey || null, is_placeholder: 1, is_minor: 0, created_at: CREATED, updated_at: CREATED });
  return p;
}
const memberships = new Set<string>();
function addMember(personId: string, team: string, role = 'player', jersey: string | null = null) {
  const key = `${personId}:${team}`;
  if (memberships.has(key)) return;
  memberships.add(key);
  add('membership', { id: demoId(`member:${key}`), person_id: personId, team_id: team, kind: 'core', scope: 'permanent', role, jersey_number: jersey || null, start_date: '2026-01-01', created_at: CREATED, updated_at: CREATED });
}

type Squad = { personId: string; gender: 'W' | 'M' | null; jersey: string }[];
const squads = new Map<string, Squad>();
for (const c of CLUB_DIRECTORY) {
  for (const t of c.teams) {
    const r = rng(`squad:${t.name}`);
    const size = 14 + Math.floor(r() * 7);
    const squad: Squad = [];
    const numbers = new Set<string>();
    for (let i = 0; i < size; i++) {
      const g = t.division === 'women' ? 'W' : t.division === 'open' ? 'M' : i % 2 ? 'M' : 'W';
      let jersey = String(1 + Math.floor(r() * 98));
      while (numbers.has(jersey)) jersey = String(1 + Math.floor(r() * 98));
      numbers.add(jersey);
      const p = addPerson(`${t.name}:${i}`, g, jersey);
      addMember(p.id, teamId(t.name), i === 0 ? 'captain' : i === 1 ? 'spirit_captain' : 'player', jersey);
      squad.push({ personId: p.id, gender: p.gender, jersey });
    }
    squads.set(teamId(t.name), squad);
  }
}
const rosterOf = (team: string) => squads.get(team) ?? [];
const HEAT = teamId('Chilli Heat');

/* ---------------- Cape Town Mixed League 2026 (invented double round robin) ---------------- */

const LEAGUE = demoId('event:ctml2026');
const WOOLSACK_CUP = seedId('venue', 'Woolsack Oval, UCT');
const LEGENDS = teamId('Chilli Legends');
const GHOST = teamId('Ghost');
const MATIES = teamId('Maties Meerkats');
const NOMAD = teamId('Nomad');
const UCT = teamId('UCT Flying Tigers');
const SIX = [HEAT, LEGENDS, NOMAD, UCT, GHOST, MATIES];
const STRENGTH: Record<string, number> = { [LEGENDS]: 0.9, [GHOST]: 0.85, [MATIES]: 0.7, [UCT]: 0.65, [NOMAD]: 0.6, [HEAT]: 0.4 };
const leagueRules = rulesFor('league', 'mixed');
add('event', { id: LEAGUE, name: 'Cape Town Mixed League 2026', kind: 'league', level: 'league', division: 'mixed', region: 'western', location: 'Cape Town', start_date: '2026-08-22', end_date: '2026-11-14', rules_json: JSON.stringify(leagueRules), notes: 'Demo league: fixtures, results and players are made up. Everyone plays everyone twice.', created_at: CREATED, updated_at: CREATED });
for (const t of SIX) add('event_team', { id: demoId(`et:ctml:${t}`), event_id: LEAGUE, team_id: t, pool: null, seed: null, created_at: CREATED });

// Circle method: 5 rounds of 3 games; the second half swaps home and away.
const rounds: [string, string][][] = [];
const circle = [...SIX];
for (let r = 0; r < 5; r++) {
  const games: [string, string][] = [];
  for (let i = 0; i < 3; i++) {
    const a = circle[i];
    const b = circle[5 - i];
    games.push(r % 2 ? [b, a] : [a, b]);
  }
  rounds.push(games);
  circle.splice(1, 0, circle.pop()!);
}
const allRounds = [...rounds, ...rounds.map((g) => g.map(([a, b]) => [b, a] as [string, string]))];
const DATES = ['2026-08-22', '2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19', '2026-10-10', '2026-10-17', '2026-10-24', '2026-11-07', '2026-11-14'];
const SLOTS = ['13:00', '14:45', '16:30'];
const PLUMSTEAD = [seedId('venue', 'Plumstead 1'), seedId('venue', 'Plumstead 2')];
const sast = (date: string, time: string) => new Date(`${date}T${time}:00+02:00`).toISOString();

// Postponements: the first proper fixture (not Heat, not Legends v Maties) in rounds 3, 5 and 7.
const POSTPONE_PLAN: Record<number, { to: string; reason: string; played: boolean }> = {
  2: { to: sast('2026-10-21', '18:30'), reason: 'weather', played: true }, // washed out, replayed midweek
  4: { to: sast('2026-09-30', '18:30'), reason: 'lights', played: true },
  6: { to: sast('2026-11-11', '18:30'), reason: 'not_enough_women', played: false }, // still to come
};
const POSTPONE: Record<string, { to: string; reason: string; played: boolean }> = {};
allRounds.forEach((games, r) => {
  if (!POSTPONE_PLAN[r]) return;
  const slot = games.findIndex(([a, b]) => a !== HEAT && b !== HEAT && [a, b].sort().join() !== [LEGENDS, MATIES].sort().join());
  if (slot >= 0) POSTPONE[`${r}:${slot}`] = POSTPONE_PLAN[r];
});

let leagueGames = 0;
allRounds.forEach((games, r) => {
  games.forEach(([a, b], slot) => {
    const id = demoId(`game:ctml:${r}:${slot}`);
    const date = DATES[r];
    const pp = POSTPONE[`${r}:${slot}`];
    const originally = sast(date, SLOTS[slot]);
    const when = pp ? pp.to : originally;
    const heatGame = a === HEAT || b === HEAT;
    const legendsForfeit = !heatGame && r < 5 && ((a === LEGENDS && b === MATIES) || (a === MATIES && b === LEGENDS));
    const played = !heatGame && !legendsForfeit && when.slice(0, 10) < TODAY && (!pp || pp.played);
    const forfeiter = heatGame ? HEAT : legendsForfeit ? LEGENDS : null;
    add('game', {
      id, event_id: LEAGUE, venue_id: PLUMSTEAD[slot % 2], team_a_id: a, team_b_id: b, scheduled_at: when, status: played || forfeiter ? 'final' : 'scheduled', tracking_mode: 'standard',
      rules_json: JSON.stringify(leagueRules), first_pull_team_id: a, ratio_point1: 'W', started_at: played ? when : null, ended_at: played ? new Date(Date.parse(when) + 80 * 60_000).toISOString() : forfeiter ? when : null,
      home_team_id: a, postponements: pp ? 1 : 0, forfeit_team_id: forfeiter, stage: null, round: r + 1, created_at: CREATED, updated_at: CREATED,
    });
    if (pp) {
      const by = [a, b][r % 2];
      add('game_status_log', { id: demoId(`log:ctml:${r}:${slot}:pp`), game_id: id, action: 'postpone', team_id: by, reason: pp.reason, note: pp.reason === 'weather' ? 'Fields waterlogged' : pp.reason === 'lights' ? 'Floodlights out at Plumstead' : 'Short on female matching players', previous_scheduled_at: originally, created_at: new Date(Date.parse(originally) - 26 * 3600_000).toISOString() });
    }
    if (forfeiter) add('game_status_log', { id: demoId(`log:ctml:${r}:${slot}:ff`), game_id: id, action: 'forfeit', team_id: forfeiter, reason: forfeiter === HEAT ? 'not_enough_women' : 'not_enough_men', note: forfeiter === HEAT ? 'Chilli Heat withdrew from the league' : null, previous_scheduled_at: null, created_at: new Date(Date.parse(when) - 2 * 86400_000).toISOString() });
    if (played) simulateGame(id, a, b, when);
    leagueGames += 1;
  });
});

/** Plays a believable game: lines on ABBA ratio, a few turnovers, scorers from the line, a halftime. */
function simulateGame(gameId: string, a: string, b: string, start: string, full = false) {
  const r = rng(`sim:${gameId}`);
  const squads = { [a]: rosterOf(a), [b]: rosterOf(b) };
  const pA = STRENGTH[a] / (STRENGTH[a] + STRENGTH[b]);
  let sa = 0;
  let sb = 0;
  let t = Date.parse(start);
  let offense = b;
  let half = 1;
  let seq = 0;
  const used: Record<string, number> = {};
  for (let n = 1; sa < 15 && sb < 15; n++) {
    const ratio = ratioForPoint(n, 'W')!;
    const pointId = demoId(`pt:${gameId}:${n}`);
    const pulled = new Date(t).toISOString();
    const lineOf = (team: string) => {
      const need = { W: ratio === 'W' ? 4 : 3, M: ratio === 'M' ? 4 : 3 };
      const pick = (g: 'W' | 'M') =>
        squads[team]
          .filter((p) => p.gender === g)
          .sort((x, y) => (used[x.personId] ?? 0) - (used[y.personId] ?? 0) + (r() - 0.5))
          .slice(0, need[g]);
      const line = [...pick('W'), ...pick('M')];
      line.forEach((p) => (used[p.personId] = (used[p.personId] ?? 0) + 1));
      return line;
    };
    const lines = { [a]: lineOf(a), [b]: lineOf(b) };
    const scorer = r() < (offense === a ? 0.55 + (pA - 0.5) : 0.45 + (pA - 0.5)) ? a : b;
    // Turnovers: even count if the offence scores, odd if it's a break.
    let turns = Math.floor(r() * 3);
    if ((scorer === offense) !== (turns % 2 === 0)) turns += 1;
    const dur = 60 + Math.floor(r() * 240) + turns * 40;
    add('point', { id: pointId, game_id: gameId, number: n, half, offense_team_id: offense, ratio, puller_id: lines[offense === a ? b : a][0]?.personId ?? null, pull_outcome: 'in', pulled_at: pulled, scored_at: new Date(t + dur * 1000).toISOString(), scoring_team_id: scorer, created_at: pulled });
    for (const team of [a, b]) for (const p of lines[team]) add('point_player', { point_id: pointId, team_id: team, person_id: p.personId });
    let holder = offense;
    // Full mode: every pass, so possessions, chains and pass pairs show up in the reports.
    let disc: string | null = null;
    const passes = (team: string, at: number) => {
      if (!full) return;
      const line = lines[team];
      disc ??= pickOf(r, line).personId;
      for (let k = 0, n = 1 + Math.floor(r() * 6); k < n; k++) {
        const to = pickOf(r, line.filter((x) => x.personId !== disc)).personId;
        add('game_event', { id: demoId(`pass:${gameId}:${pointId}:${seq}`), game_id: gameId, point_id: pointId, seq: ++seq, type: 'pass', team_id: team, actor_id: disc, secondary_id: to, recorded_at: new Date(at - (n - k) * 4000).toISOString(), device_id: 'demo' });
        disc = to;
      }
    };
    for (let k = 0; k < turns; k++) {
      const defending = holder === a ? b : a;
      const at = new Date(t + ((k + 1) * dur * 1000) / (turns + 2)).toISOString();
      passes(holder, Date.parse(at));
      if (r() < 0.35) add('game_event', { id: demoId(`ev:${gameId}:${n}:${k}`), game_id: gameId, point_id: pointId, seq: ++seq, type: 'intercept', team_id: defending, actor_id: pickOf(r, lines[defending]).personId, recorded_at: at, device_id: 'demo' });
      else add('game_event', { id: demoId(`ev:${gameId}:${n}:${k}`), game_id: gameId, point_id: pointId, seq: ++seq, type: r() < 0.6 ? 'throwaway' : 'drop', team_id: holder, actor_id: pickOf(r, lines[holder]).personId, recorded_at: at, device_id: 'demo' });
      holder = defending;
      disc = null;
    }
    const line = lines[scorer];
    passes(scorer, t + dur * 1000);
    const assist = full && disc ? line.find((p) => p.personId === disc)! : pickOf(r, line);
    const goal = pickOf(r, line.filter((p) => p !== assist));
    add('game_event', { id: demoId(`ev:${gameId}:${n}:g`), game_id: gameId, point_id: pointId, seq: ++seq, type: 'score', team_id: scorer, actor_id: goal.personId, secondary_id: assist?.personId ?? null, recorded_at: new Date(t + dur * 1000).toISOString(), device_id: 'demo' });
    if (scorer === a) sa++;
    else sb++;
    t += dur * 1000 + 75_000;
    if (half === 1 && Math.max(sa, sb) === 8) {
      add('game_event', { id: demoId(`ht:${gameId}`), game_id: gameId, point_id: pointId, seq: ++seq, type: 'halftime', recorded_at: new Date(t).toISOString(), device_id: 'demo' });
      half = 2;
      t += 7 * 60_000;
    }
    offense = scorer === a ? b : a;
  }
  // Spirit both ways.
  for (const [from, to] of [[a, b], [b, a]]) {
    const s = () => (r() < 0.15 ? 1 : r() < 0.55 ? 2 : r() < 0.9 ? 3 : 4);
    add('spirit_score', { id: demoId(`spirit:${gameId}:${from}`), game_id: gameId, from_team_id: from, to_team_id: to, rules: s(), fouls: s(), fairness: s(), attitude: s(), communication: s(), comments_json: '{}', overall_comment: null, submitted_at: new Date(t + 30 * 60_000).toISOString() });
  }
}

/* ---------------- Demo Cup 2026 (invented one-day tournament) ---------------- */

// Six teams in one pool, then a final scored in full mode (every pass) to show the full stats.
const CUP = demoId('event:cup2026');
const CUP_TEAMS = [LEGENDS, GHOST, UCT, NOMAD, HEAT, MATIES];
const cupRules = rulesFor('wfdf', 'mixed');
add('event', { id: CUP, name: 'Demo Cup 2026', kind: 'tournament', level: 'social', division: 'mixed', region: 'western', location: 'Woolsack Oval, UCT', start_date: '2026-09-26', end_date: '2026-09-27', rules_json: JSON.stringify(cupRules), notes: 'Demo tournament: teams are real clubs, but every player, game and score is made up.', created_at: CREATED, updated_at: CREATED });
CUP_TEAMS.forEach((t, i) => add('event_team', { id: demoId(`et:cup:${t}`), event_id: CUP, team_id: t, pool: 'A', seed: i + 1, created_at: CREATED }));
let cupGames = 0;
const cupPairs: [string, string][] = [];
for (let i = 0; i < CUP_TEAMS.length; i++) for (let j = i + 1; j < CUP_TEAMS.length; j++) cupPairs.push([CUP_TEAMS[i], CUP_TEAMS[j]]);
cupPairs.forEach(([a, b], k) => {
  const id = demoId(`game:cup:${k}`);
  const day = k < 9 ? '2026-09-26' : '2026-09-27';
  const when = sast(day, ['08:30', '10:00', '11:30'][Math.floor((k % 9) / 3)]);
  add('game', { id, event_id: CUP, venue_id: WOOLSACK_CUP, team_a_id: a, team_b_id: b, scheduled_at: when, status: 'final', tracking_mode: 'standard', rules_json: JSON.stringify(cupRules), first_pull_team_id: a, ratio_point1: 'W', started_at: when, ended_at: new Date(Date.parse(when) + 85 * 60_000).toISOString(), home_team_id: a, postponements: 0, stage: 'pool', round: Math.floor(k / 3) + 1, created_at: CREATED, updated_at: CREATED });
  simulateGame(id, a, b, when);
  cupGames += 1;
});
const FINAL = demoId('game:cup:final');
const finalAt = sast('2026-09-27', '15:00');
add('game', { id: FINAL, event_id: CUP, venue_id: WOOLSACK_CUP, team_a_id: LEGENDS, team_b_id: GHOST, scheduled_at: finalAt, status: 'final', tracking_mode: 'full', rules_json: JSON.stringify(cupRules), first_pull_team_id: GHOST, ratio_point1: 'W', started_at: finalAt, ended_at: new Date(Date.parse(finalAt) + 95 * 60_000).toISOString(), home_team_id: LEGENDS, postponements: 0, stage: 'playoff', round: null, created_at: CREATED, updated_at: CREATED });
simulateGame(FINAL, LEGENDS, GHOST, finalAt, true);
cupGames += 1;

/* ---------------- Chilli Legends practices at Woolsack ---------------- */

const WOOLSACK = seedId('venue', 'Woolsack Oval, UCT');
const legends = rosterOf(LEGENDS);
const captain = legends[0]?.personId ?? null;
const PRACTICE = [
  { dow: 1, time: '18:30', min: 120, title: 'Training' },
  { dow: 3, time: '18:30', min: 120, title: 'Training' },
  { dow: 6, time: '09:00', min: 120, title: 'Saturday session' },
];
let practices = 0;
for (const p of PRACTICE) {
  const series = demoId(`series:legends:${p.dow}`);
  for (let d = new Date('2026-08-10T12:00:00Z'); d <= new Date('2026-11-28T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== p.dow) continue;
    const date = d.toISOString().slice(0, 10);
    // No practice on league Saturdays.
    if (p.dow === 6 && DATES.includes(date)) continue;
    const id = demoId(`practice:legends:${date}:${p.time}`);
    const start = sast(date, p.time);
    add('session', { id, kind: 'practice', team_id: LEGENDS, title: p.title, notes: p.dow === 6 ? 'Bring a light and a dark shirt.' : null, started_at: start, duration_min: p.min, venue_id: WOOLSACK, created_by_id: captain, series_id: series, created_at: CREATED, updated_at: CREATED });
    practices += 1;
    const past = date < TODAY;
    const soon = !past && date <= '2026-11-04';
    if (!past && !soon) continue;
    const r = rng(`rsvp:${id}`);
    for (const m of legends) {
      const x = r();
      const status = x < 0.62 ? 'going' : x < 0.72 ? 'late' : x < (past ? 0.9 : 0.8) ? 'not_going' : null;
      if (status) add('practice_rsvp', { id: `${id}:${m.personId}`, session_id: id, person_id: m.personId, status, reason: status === 'late' ? pickOf(r, ['10 min', '20 min', 'Stuck at work']) : status === 'not_going' ? pickOf(r, [null, 'Work', 'Exams', 'Niggle']) : null, created_at: CREATED, updated_at: CREATED });
      if (past) {
        const attended = status === 'going' || status === 'late' ? r() > 0.06 : status === null ? r() < 0.3 : false;
        add('practice_attendance', { id: `${id}:${m.personId}`, session_id: id, person_id: m.personId, attended: attended ? 1 : 0, created_at: CREATED, updated_at: CREATED });
      }
    }
  }
}

// "Can you play?" for Legends' next league games.
for (const g of T.game.filter((x) => x.event_id === LEAGUE && x.status === 'scheduled' && (x.team_a_id === LEGENDS || x.team_b_id === LEGENDS))) {
  const r = rng(`avail:${g.id}`);
  for (const m of legends) {
    const x = r();
    const status = x < 0.6 ? 'available' : x < 0.7 ? 'late' : x < 0.82 ? 'unavailable' : null;
    if (status) add('game_availability', { id: `${g.id}:${m.personId}`, game_id: g.id as string, person_id: m.personId, team_id: LEGENDS, status, reason: status === 'unavailable' ? pickOf(r, [null, 'Away', 'Work']) : null, created_at: CREATED, updated_at: CREATED });
  }
}

/* ---------------- AGM and announcements (demo) ---------------- */

add('calendar_entry', {
  id: seedId('calendar', 'SAFDA AGM 2026 (demo)'), name: 'SAFDA AGM 2026 (demo)', kind: 'agm', level: 'national', region: null, location: 'Online', start_date: '2026-11-01', end_date: '2026-11-01', month_hint: null, status: 'confirmed', url: 'https://safda.org.za/', start_time: '19:00', end_time: '20:30',
  meeting_url: 'https://meet.google.com/demo-agm-2026',
  notes: [
    'DEMO ENTRY: this AGM and its link are placeholders to show how meetings work in the app.',
    '',
    'All SAFDA members, club representatives and regional associations are welcome.',
    '',
    'Agenda',
    '1. Welcome, apologies and quorum',
    '2. Minutes of the 2025 AGM',
    '3. President’s report on the 2026 season',
    '4. Treasurer’s report and 2027 affiliation fees',
    '5. Regional reports: Northern, Eastern, Southern, Western',
    '6. Nationals 2027: hosts and dates',
    '7. Constitution amendments (circulated two weeks before)',
    '8. Election of the executive committee',
    '9. General',
    '',
    'RSVP below so we know numbers. Voting members: have your SAFDA number ready.',
  ].join('\n'),
  created_at: CREATED, updated_at: CREATED,
});
add('announcement', { id: demoId('ann:nationals'), region_code: null, title: 'Mixed Nationals 2026: 4–6 December, KwaZulu-Natal', body: 'Team registrations open soon. Check your accreditation is valid and your SAFDA and regional fees are paid.\n\n(Demo announcement.)', link_url: 'https://safda.org.za/new-safda-events/', link_label: 'SAFDA events', pinned: 1, published_at: '2026-10-20T08:00:00.000Z', created_by_id: null, created_at: CREATED, updated_at: CREATED });
add('announcement', { id: demoId('ann:constitution'), region_code: 'western', title: 'CTFDA constitution review: comments by 15 November', body: 'The committee is reviewing the constitution. Read the current version and send comments to the committee.\n\n(Demo announcement.)', link_url: 'https://drive.google.com/open?id=1M6J8if-22sOxGus-Ut3syubY3mKEIGZmmNDvSZYT-ho', link_label: 'Read the constitution', pinned: 0, published_at: '2026-10-18T08:00:00.000Z', created_by_id: null, created_at: CREATED, updated_at: CREATED });
add('announcement', {
  id: demoId('ann:agm'), region_code: null, title: 'SAFDA AGM: Sunday 1 November, 19:00, online',
  body: [
    'The SAFDA Annual General Meeting is on Google Meet. Everyone is welcome; members vote.',
    '',
    'On the agenda: the 2026 season report, 2027 affiliation fees, Nationals 2027 hosts, constitution amendments and electing the executive committee.',
    '',
    'Tap below to see the full agenda and say if you’re coming. Voting members: have your SAFDA number ready.',
    '',
    '(Demo announcement: the meeting and link are placeholders.)',
  ].join('\n'),
  link_url: `/hub/meeting/${seedId('calendar', 'SAFDA AGM 2026 (demo)')}`, link_label: 'Agenda & RSVP', pinned: 0, published_at: '2026-10-22T08:00:00.000Z', created_by_id: null, created_at: CREATED, updated_at: CREATED,
});

/* ---------------- Hats (demo) ---------------- */

const hatRules = (perSide: number, minutes: number, target: number) => ({ pointTarget: target, halftimeTarget: Math.ceil(target / 2), softCapMinutes: null, hardCapMinutes: minutes, timeoutsPerTeam: 0, timeoutSeconds: 60, pullWithinSeconds: 60, mixedRatio: perSide % 2 === 1, halftimeMinutes: 2, playersPerSide: perSide });
// Hat players: invented players from Cape Town teams.
const capeTown = new Set(CLUB_DIRECTORY.filter((c) => c.city === 'Cape Town').flatMap((c) => c.teams.map((t) => teamId(t.name))));
const cityPeople = T.person.filter((p) => T.membership.some((m) => m.person_id === p.id && capeTown.has(m.team_id as string))).slice(0, 140);
function hatSignups(eventId: string, seed: string, count: number) {
  const r = rng(seed);
  const pool = [...cityPeople].sort(() => r() - 0.5).slice(0, count);
  return pool.map((p, i) => {
    const attending = i % 11 === 10 ? 'maybe' : 'yes';
    const paid = i % 9 !== 4 ? 1 : 0;
    const row = { id: `${eventId}:${p.id}`, event_id: eventId, person_id: p.id as string, attending, wants_captain: i % 6 === 0 ? 1 : 0, skill: 1 + Math.floor(r() * 5), paid, paid_confirmed: paid && i % 3 === 0 ? 1 : 0, on_the_day: 0, note: null, created_at: CREATED, updated_at: CREATED };
    add('hat_signup', row);
    return { ...row, gender: p.gender as 'W' | 'M' | null };
  });
}

// Upcoming beach hat, sign-ups open (draw due 48 hours before).
const BEACH_HAT = demoId('hat:clifton2026');
add('event', { id: BEACH_HAT, name: 'Clifton Beach Hat 2026 (demo)', kind: 'tournament', level: 'social', division: 'beach', region: 'western', location: 'Clifton 2nd beach', start_date: '2026-10-31', end_date: '2026-10-31', start_time: '09:00', rules_json: JSON.stringify(hatRules(5, 30, 9)), is_hat: 1, cost: 'R120 (includes a hat disc)', payment_url: 'https://www.capetownultimate.co.za/contact/merch', details: 'DEMO HAT: shows how hats work in the app.\n\nSign up, say if you’d captain, pay, and tick “I’ve paid”. Teams are drawn on Thursday 29 Oct. Bring a light AND a dark shirt, water and sunscreen. Barefoot. Braai after.', hat_status: 'signups', team_count: null, notes: null, created_at: CREATED, updated_at: CREATED });
hatSignups(BEACH_HAT, 'beachhat', 42);

// Past hat: drawn and played, results entered without stats.
const WINTER_HAT = demoId('hat:winter2026');
const winterRules = hatRules(7, 40, 11);
add('event', { id: WINTER_HAT, name: 'Winter Hat 2026 (demo)', kind: 'tournament', level: 'social', division: 'mixed', region: 'western', location: 'Woolsack Oval, UCT', venue_id: seedId('venue', 'Woolsack Oval, UCT'), start_date: '2026-07-18', end_date: '2026-07-18', start_time: '10:00', rules_json: JSON.stringify(winterRules), is_hat: 1, cost: 'R100', payment_url: null, details: 'DEMO HAT: drawn into four teams; results were entered as final scores or winners only.', hat_status: 'drawn', team_count: 4, notes: null, created_at: CREATED, updated_at: CREATED });
const winter = hatSignups(WINTER_HAT, 'winterhat', 48).filter((s) => s.attending === 'yes' && s.paid);
const players = winter.map((s) => ({ id: s.person_id, gender: s.gender, skill: s.skill, wantsCaptain: !!s.wants_captain }));
const drawn = drawTeams(players, 4, recommendCaptains(players, 4));
const hatTeamIds = drawn.map((t, i) => {
  const id = demoId(`hatteam:winter:${i}`);
  add('team', { id, name: t.name, short_name: t.name.slice(0, 3).toUpperCase(), kind: 'hat', region: 'western', primary_color: t.color, about: 'Hat team', is_sample: 0, created_at: CREATED, updated_at: CREATED });
  add('event_team', { id: demoId(`et:winter:${i}`), event_id: WINTER_HAT, team_id: id, pool: null, seed: i + 1, created_at: CREATED });
  for (const pid of t.playerIds) add('membership', { id: demoId(`hatm:${id}:${pid}`), person_id: pid, team_id: id, kind: 'guest', scope: 'event', scope_ref_id: WINTER_HAT, role: pid === t.captainId ? 'captain' : 'player', created_at: CREATED, updated_at: CREATED });
  return id;
});
const winterGames: [number, number, string, number | null, number | null][] = [
  [0, 1, '10:00', 9, 11], [2, 3, '10:00', 11, 6], [0, 2, '10:50', 11, 10], [1, 3, '10:50', null, null], [0, 3, '11:40', 7, 11], [1, 2, '11:40', null, null],
];
winterGames.forEach(([a, b, time, fa, fb], k) => {
  const when = sast('2026-07-18', time);
  const mode = fa != null ? 'score' : k === 3 ? 'winner' : 'none';
  add('game', { id: demoId(`hatgame:winter:${k}`), event_id: WINTER_HAT, venue_id: seedId('venue', 'Woolsack Oval, UCT'), team_a_id: hatTeamIds[a], team_b_id: hatTeamIds[b], scheduled_at: when, status: 'final', tracking_mode: 'lite', rules_json: JSON.stringify(winterRules), started_at: when, ended_at: new Date(Date.parse(when) + 40 * 60_000).toISOString(), home_team_id: hatTeamIds[a], postponements: 0, round: Math.floor(k / 2) + 1, result_mode: mode, final_a: fa, final_b: fb, winner_team_id: mode === 'winner' ? hatTeamIds[b] : null, created_at: CREATED, updated_at: CREATED });
});

/* ---------------- write the JSON (phones) and SQL (server) ---------------- */

// Columns with NOT NULL defaults must be explicit: the compact format writes a value for every column.
for (const e of T.event) e.is_hat ??= 0;
const tables = ORDER.filter((t) => T[t]?.length).map((t) => [t, T[t]] as const);
const counts = Object.fromEntries(tables.map(([t, rows]) => [t, rows.length]));
// Columnar (column names once, then value lists) keeps the file small enough to ship in the app.
// The earlier demo (v3) was built from Stall Count exports: list its rows so phones and the server
// delete them. Kept in every later version so a phone that skipped versions still cleans up.
const DEMO_JSON = join(ROOT, 'mobile/src/content/demo/demo-2026.json');
type Purge = Record<'person' | 'game' | 'event' | 'team' | 'session' | 'venue' | 'announcement' | 'membership', string[]>;
let purge: Purge | null = null;
if (existsSync(DEMO_JSON)) {
  const old = JSON.parse(readFileSync(DEMO_JSON, 'utf8'));
  if (old.purge) purge = old.purge;
  else if (old.version === 3) {
    const ids = (t: string, where: (r: Record<string, unknown>) => boolean = () => true) => {
      const tab = old.tables[t];
      if (!tab) return [];
      return tab.rows.map((r: unknown[]) => Object.fromEntries(tab.cols.map((c: string, i: number) => [c, r[i]]))).filter(where).map((r: Record<string, unknown>) => String(r.id));
    };
    const keepVenues = new Set(T.venue.map((v) => v.id));
    purge = {
      person: ids('person'),
      game: ids('game'),
      event: ids('event'),
      // Residence-league teams and the old hat teams; the clubs' own teams stay.
      team: ids('team', (r) => r.city === 'Stellenbosch' || r.kind === 'hat').filter((id) => !T.team.some((t) => t.id === id) && !teamUpdates.some((u) => u.id === id)),
      session: ids('session'),
      venue: ids('venue', (r) => !keepVenues.has(r.id as string)),
      announcement: ids('announcement'),
      membership: ids('membership'),
    };
  }
}
const columnar = Object.fromEntries(
  tables.map(([t, rows]) => {
    const cols = Object.keys(Object.assign({}, ...rows));
    return [t, { cols, rows: rows.map((r) => cols.map((c) => r[c] ?? null)) }];
  }),
);
writeFileSync(DEMO_JSON, JSON.stringify({ version: VERSION, builtFor: TODAY, purge, teamUpdates, tables: columnar }));

const serverCols: Record<string, string[]> = JSON.parse(readFileSync(join(__dirname, 'server-columns.json'), 'utf8'));
const lit = (v: string | number | null | undefined) => (v == null ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const sql: string[] = [
  '-- Demo content for sharing the app. Clubs, teams and fields are from the clubs\' public pages; every',
  '-- player, game, score and practice is made up. Generated by tools/demo/build.ts; do not edit by hand.',
  '',
];
const list = (xs: string[]) => xs.map(lit).join(', ');
if (purge) {
  // First remove everything the earlier demo created (and anything users added that hangs off it).
  const P = list(purge.person), G = list(purge.game), E = list(purge.event), TM = list(purge.team), S = list(purge.session);
  sql.push('-- Remove the earlier demo (built from Stall Count exports).');
  const del = (t: string, where: string) => serverCols[t] && sql.push(`delete from ${t} where ${where};`);
  del('point_player', `point_id in (select id from point where game_id in (${G}))`);
  del('game_event', `game_id in (${G})`);
  del('point', `game_id in (${G})`);
  for (const t of ['game_player', 'spirit_score', 'game_status_log', 'game_availability', 'reflection', 'shoutout', 'bracket_slot']) del(t, `game_id in (${G})`);
  for (const t of ['practice_rsvp', 'practice_attendance', 'reflection', 'shoutout']) del(t, `session_id in (${S})`);
  del('session', `id in (${S})`);
  for (const t of ['accreditation', 'association_membership', 'club_staff', 'fitness_test', 'game_availability', 'game_player', 'hat_signup', 'meeting_rsvp', 'person_demographic', 'pickup_rsvp', 'practice_attendance', 'practice_rsvp', 'reflection', 'registration', 'saved_line_member', 'self_rating', 'membership'])
    del(t, `person_id in (${P})`);
  del('shoutout', `from_person_id in (${P}) or to_person_id in (${P})`);
  del('game', `id in (${G})`);
  del('hat_signup', `event_id in (${E})`);
  del('event_team', `event_id in (${E}) or team_id in (${TM || "''"})`);
  del('event', `id in (${E})`);
  if (purge.team.length) {
    del('membership', `team_id in (${TM})`);
    del('team', `id in (${TM})`);
  }
  del('person', `id in (${P})`);
  if (purge.venue.length) del('venue', `id in (${list(purge.venue)})`);
  del('announcement', `id in (${list(purge.announcement)})`);
  sql.push('');
}
for (const [t, rows] of tables) {
  const cols = Object.keys(Object.assign({}, ...rows)).filter((c) => serverCols[t]?.includes(c));
  for (let i = 0; i < rows.length; i += 500) {
    sql.push(`insert into ${t} (${cols.join(', ')}) values`);
    sql.push(rows.slice(i, i + 500).map((r) => `  (${cols.map((c) => lit(r[c] as never)).join(', ')})`).join(',\n'));
    sql.push(t === 'point_player' ? 'on conflict do nothing;' : 'on conflict (id) do nothing;');
  }
}
for (const u of teamUpdates) {
  const sets = Object.entries(u).filter(([k]) => k !== 'id').map(([k, v]) => `${k} = coalesce(${k}, ${lit(v as never)})`);
  sql.push(`update team set ${sets.join(', ')} where id = ${lit(u.id as string)};`);
}
// Everyone on both rosters of a played demo game is in its squad.
sql.push(`insert into game_player (id, game_id, team_id, person_id, jersey_number, status, confirmation, added_in_game)
  select md5('gp:' || g.id || ':' || m.person_id)::uuid::text, g.id, m.team_id, m.person_id, m.jersey_number, 'available', 'confirmed', 0
    from game g join membership m on m.team_id in (g.team_a_id, g.team_b_id) and m.id like '%'
   where g.id in (${T.game.filter((x) => x.started_at).map((x) => lit(x.id as string)).join(', ')})
     and m.id in (select id from membership where person_id in (select id from person where is_placeholder = 1))
on conflict do nothing;`);
sql.push(`update calendar_entry set end_date = '2026-11-14', status = 'confirmed' where id = ${lit(seedId('calendar', 'Cape Town Mixed League 2026'))};`);
// Each demo version is its own (idempotent) migration, so already-applied versions are never edited.
const MIGRATION: Record<number, string> = { 1: '20261024150000_demo_content.sql', 2: '20261024210000_demo_content_v2.sql', 3: '20261025000000_demo_content_v3.sql', 4: '20261026120000_demo_content_v4.sql' };
writeFileSync(join(ROOT, 'supabase/migrations', MIGRATION[VERSION]), sql.join('\n') + '\n');

console.log(`clubs ${counts.club} · new teams ${counts.team} (+${teamUpdates.length} updated) · people ${counts.person} · games ${counts.game} (cup ${cupGames}, league ${leagueGames}) · points ${counts.point} · events ${counts.game_event} · practices ${practices}`);
console.log(counts);
