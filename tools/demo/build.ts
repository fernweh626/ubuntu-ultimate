/*
 * Builds the shared demo content for Ubuntu Ultimate.
 *
 *   cd mobile && npx tsx ../tools/demo/build.ts <westernregionals dir> <resleague dir>
 *
 * Inputs: the two Stall Count exports (unzipped). They contain real people's names and are NEVER
 * committed. Every player gets an invented name (same person → same invented name across both
 * exports); team names, results and point-by-point logs stay real. Everything else (the Cape Town
 * Mixed League 2026, Chilli practices, the AGM, announcements) is made up for the demo.
 *
 * Outputs (both committed, both anonymised):
 *   mobile/src/content/demo/demo-2026.json            loaded on phones by ensureDemoContent()
 *   supabase/migrations/20261024150000_demo_content.sql  the same rows for the server
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CLUB_DIRECTORY } from '../../mobile/src/content/clubs';
import { md5 } from '../../mobile/src/db/md5';
import { ratioForPoint, rulesFor } from '../../mobile/src/domain/rules';

const [WR_DIR, RES_DIR] = process.argv.slice(2);
if (!WR_DIR || !RES_DIR) throw new Error('usage: build.ts <westernregionals dir> <resleague dir>');
const ROOT = join(__dirname, '..', '..');
const TODAY = '2026-10-24'; // the demo's "now": games before this are played
const CREATED = '2026-10-24T00:00:00.000Z';

/* ---------------- helpers ---------------- */

const uuidOf = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
/** Same formula as the app's seedId() and the server's seed_id(). */
const seedId = (kind: string, name: string) => uuidOf(md5(`${kind}:${name}`));
const demoId = (key: string) => seedId('demo', key);

function csv(dir: string, suffix: string): Record<string, string>[] {
  const file = readdirSync(dir).find((f) => f.endsWith(`_${suffix}.csv`));
  if (!file) return [];
  const text = readFileSync(join(dir, file), 'utf8').replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') row.push(cur), (cur = '');
    else if (c === '\n') row.push(cur.replace(/\r$/, '')), rows.push(row), (row = []), (cur = '');
    else cur += c;
  }
  if (cur || row.length) row.push(cur), rows.push(row);
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

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
const ORDER = ['club', 'venue', 'team', 'person', 'membership', 'event', 'event_team', 'game', 'point', 'point_player', 'game_event', 'game_status_log', 'spirit_score', 'session', 'practice_rsvp', 'practice_attendance', 'game_availability', 'calendar_entry', 'announcement'];

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
  { name: 'Coetzenburg B fields', city: 'Stellenbosch', lat: -33.94136, lng: 18.86998 },
];
for (const v of VENUES) add('venue', { id: seedId('venue', v.name), name: v.name, city: v.city, latitude: v.lat, longitude: v.lng, created_at: CREATED, updated_at: CREATED });
const venueFor = (name: string, city: string, lat?: string, lng?: string) => {
  if (name === 'Plumstead 1' || name === 'Plumstead 2') return seedId('venue', name);
  if (!name) return null;
  const id = seedId('venue', `${city}:${name}`);
  if (!T.venue.some((v) => v.id === id)) add('venue', { id, name: `${name}, ${city === 'Stellenbosch' ? 'Coetzenburg' : city}`, city, latitude: lat ? Number(lat) : null, longitude: lng ? Number(lng) : null, created_at: CREATED, updated_at: CREATED });
  return id;
};

/* ---------------- people from the exports, with invented names ---------------- */

const personIdOf = (realId: string) => demoId(`person:${realId}`);
const people = new Map<string, { id: string; gender: 'W' | 'M' | null }>();
function addPerson(realId: string, gender: string, jersey: string | null) {
  if (people.has(realId)) return people.get(realId)!;
  const g = gender === 'W' ? 'W' : gender === 'M' ? 'M' : null;
  const { first, last } = inventName(realId, g);
  const p = { id: personIdOf(realId), gender: g };
  people.set(realId, p);
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

/* ---------------- real events: Western Regionals 2026, Stellenbosch Residence League 2026 ---------------- */

type LoadedRoster = Map<string, { personId: string; gender: 'W' | 'M' | null; jersey: string | null }[]>; // team → players

function importExport(dir: string, opts: { key: string; level: string; kind: 'tournament' | 'league'; teamOf: (name: string, divisionName: string) => string; divisionOf: (divisionName: string) => string; region: string; eventName: (divisionName: string) => string }) {
  const matches = csv(dir, 'matches');
  const logs = csv(dir, 'match_logs');
  const roster = csv(dir, 'team_roster');
  const players = new Map(csv(dir, 'player').map((p) => [p.id, p]));
  const venues = new Map(csv(dir, 'venues').map((v) => [v.id, v]));
  const spirits = csv(dir, 'spirit_scores');
  const brackets = new Set(csv(dir, 'bracket_nodes').map((b) => b.match_id).filter(Boolean));
  const poolTeams = csv(dir, 'pool_teams');
  const divTeams = csv(dir, 'division_teams');
  const event = csv(dir, 'event')[0];
  const divisions = [...new Set(divTeams.map((d) => d.division_name))];

  const eventIdOf = (div: string) => demoId(`event:${opts.key}:${div}`);
  const teamDiv = new Map(divTeams.map((d) => [d.team_id, d.division_name]));
  const realTeam = new Map<string, string>(); // export team id → app team id
  for (const d of divTeams) realTeam.set(d.team_id, opts.teamOf(d.team_name, d.division_name));

  for (const div of divisions) {
    add('event', { id: eventIdOf(div), name: opts.eventName(div), kind: opts.kind, level: opts.level, division: opts.divisionOf(div), region: opts.region, location: event.location, start_date: event.start_date, end_date: event.end_date, rules_json: JSON.stringify(rulesFor(opts.kind === 'league' ? 'league' : 'wfdf', opts.divisionOf(div) as 'mixed')), notes: 'Real results and point-by-point logs from the Stall Count export. Player names are invented for the demo.', created_at: CREATED, updated_at: CREATED });
    for (const d of divTeams.filter((x) => x.division_name === div)) {
      const pool = poolTeams.find((p) => p.team_id === d.team_id)?.pool_name?.replace(/^MX /, '').replace(/^Pool /, '') ?? null;
      add('event_team', { id: demoId(`et:${opts.key}:${d.team_id}`), event_id: eventIdOf(div), team_id: realTeam.get(d.team_id)!, pool, seed: null, created_at: CREATED });
    }
  }

  // Rosters → people + memberships.
  const rosterByTeam: LoadedRoster = new Map();
  for (const r of roster) {
    const real = players.get(r.player_id);
    const p = addPerson(r.player_id, r.player_gender_code || real?.gender_code || '', r.jersey_number || real?.jersey_number || null);
    const team = realTeam.get(r.team_id);
    if (!team) continue;
    addMember(p.id, team, r.is_captain === 'true' ? 'captain' : r.is_spirit_captain === 'true' ? 'spirit_captain' : 'player', r.jersey_number || null);
    (rosterByTeam.get(team) ?? rosterByTeam.set(team, []).get(team)!).push({ personId: p.id, gender: p.gender, jersey: r.jersey_number || null });
  }

  let imported = 0;
  for (const m of matches) {
    if (m.status === 'canceled') continue;
    const gameId = demoId(`game:${opts.key}:${m.id}`);
    const A = realTeam.get(m.team_a)!;
    const B = realTeam.get(m.team_b)!;
    const div = teamDiv.get(m.team_a) ?? divisions[0];
    const v = venues.get(m.venue_id);
    const venueId = venueFor(m.venue_name, v?.city || m.venue_city || '', v?.latitude, v?.longitude);
    const forfeitB = m.status === 'forfeit_teamB';
    const scheduled = m.status === 'scheduled';
    const evs = logs.filter((l) => l.match_id === m.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const startedAt = evs.find((e) => e.event_code === 'match_start')?.created_at ?? m.start_time;
    const endedAt = evs.filter((e) => e.event_code === 'match_end').pop()?.created_at ?? evs[evs.length - 1]?.created_at ?? m.start_time;
    const puller = m.starting_team_id ? realTeam.get(m.starting_team_id) ?? A : A;
    const rules = rulesFor(opts.kind === 'league' ? 'league' : 'wfdf', opts.divisionOf(div) as 'mixed');
    add('game', {
      id: gameId, event_id: eventIdOf(div), venue_id: venueId, team_a_id: A, team_b_id: B, scheduled_at: m.start_time, status: scheduled ? 'scheduled' : 'final',
      tracking_mode: 'lite', rules_json: JSON.stringify(rules), first_pull_team_id: puller, ratio_point1: m.abba_pattern === 'female' ? 'W' : m.abba_pattern === 'male' ? 'M' : null,
      started_at: scheduled || forfeitB ? null : startedAt, ended_at: scheduled ? null : endedAt, home_team_id: A, postponements: 0, forfeit_team_id: forfeitB ? B : null,
      stage: brackets.has(m.id) ? 'playoff' : m.pool_name ? 'pool' : null, round: null, created_at: CREATED, updated_at: CREATED,
    });
    if (forfeitB) add('game_status_log', { id: demoId(`log:${opts.key}:${m.id}`), game_id: gameId, action: 'forfeit', team_id: B, reason: 'other', note: 'Forfeit (from the season export)', previous_scheduled_at: null, created_at: m.start_time });
    if (scheduled || forfeitB) continue;

    // Points from the score events; offence flips to the team that was scored on.
    let seq = 0;
    let n = 0;
    let half = 1;
    let offense = puller === A ? B : A;
    let pointId = demoId(`pt:${gameId}:1`);
    let pulledAt = startedAt;
    const halftimeAt = evs.find((e) => e.event_code === 'halftime_start')?.created_at ?? null;
    const actor = (id: string) => (id ? personIdOf(id) : null);
    const ensurePoint = () => {
      if (T.point?.length && T.point[T.point.length - 1].id === pointId) return;
      n += 1;
      add('point', { id: pointId, game_id: gameId, number: n, half, offense_team_id: offense, ratio: null, puller_id: null, pull_outcome: 'in', pulled_at: pulledAt, scored_at: null, scoring_team_id: null, created_at: pulledAt });
    };
    for (const e of evs) {
      const team = e.team_id ? realTeam.get(e.team_id) ?? null : null;
      if (e.event_code === 'score' || e.event_code === 'callahan') {
        ensurePoint();
        const pt = T.point[T.point.length - 1];
        pt.scored_at = e.created_at;
        pt.scoring_team_id = team;
        pt.ratio = /^F/.test(e.abba_line) ? 'W' : /^M/.test(e.abba_line) ? 'M' : null;
        add('game_event', { id: demoId(`ev:${e.id}`), game_id: gameId, point_id: pointId, seq: ++seq, type: e.event_code, team_id: team, actor_id: actor(e.actor_id), secondary_id: e.event_code === 'score' ? actor(e.secondary_actor_id) : null, recorded_at: e.created_at, device_id: 'import' });
        if (halftimeAt && half === 1 && e.created_at <= halftimeAt && !evs.some((x) => (x.event_code === 'score' || x.event_code === 'callahan') && x.created_at > e.created_at && x.created_at <= halftimeAt)) {
          add('game_event', { id: demoId(`ht:${gameId}`), game_id: gameId, point_id: pointId, seq: ++seq, type: 'halftime', recorded_at: halftimeAt, device_id: 'import' });
          half = 2;
        }
        offense = team === A ? B : A;
        pointId = demoId(`pt:${gameId}:${n + 1}`);
        pulledAt = new Date(Date.parse(e.created_at) + 60_000).toISOString();
      } else if (e.event_code === 'turnover' || e.event_code === 'block' || e.event_code === 'timeout_start') {
        ensurePoint();
        const type = e.event_code === 'turnover' ? 'throwaway' : e.event_code === 'block' ? 'intercept' : 'timeout';
        add('game_event', { id: demoId(`ev:${e.id}`), game_id: gameId, point_id: pointId, seq: ++seq, type, team_id: team, actor_id: type === 'timeout' ? null : actor(e.actor_id), recorded_at: e.created_at, device_id: 'import' });
      }
    }
    // Drop a trailing point that never finished.
    if (T.point.length && T.point[T.point.length - 1].game_id === gameId && !T.point[T.point.length - 1].scored_at) {
      const orphan = T.point.pop()!;
      T.game_event = T.game_event.filter((x) => x.point_id !== orphan.id);
    }
    imported += 1;
  }

  // Spirit scores (5 WFDF categories, 0–4 each). One per game per scoring team: the last one counts.
  const lastSpirit = new Map<string, Record<string, string>>();
  for (const s of spirits) lastSpirit.set(`${s.match_id}:${s.rated_team_id}`, s);
  for (const s of lastSpirit.values()) {
    const m = matches.find((x) => x.id === s.match_id);
    if (!m || m.status === 'canceled') continue;
    const to = realTeam.get(s.rated_team_id);
    const from = to === realTeam.get(m.team_a) ? realTeam.get(m.team_b) : realTeam.get(m.team_a);
    if (!to || !from) continue;
    add('spirit_score', { id: demoId(`spirit:${s.id}`), game_id: demoId(`game:${opts.key}:${m.id}`), from_team_id: from, to_team_id: to, rules: Number(s.rules_knowledge), fouls: Number(s.fouls_contact), fairness: Number(s.self_control), attitude: Number(s.positive_attitude), communication: Number(s.communication), comments_json: '{}', overall_comment: s.comments || null, submitted_at: s.submitted_at || m.start_time });
  }
  return { rosterByTeam, imported };
}

const wr = importExport(WR_DIR, {
  key: 'wr2026', level: 'regional', kind: 'tournament', region: 'western', teamOf: (name) => teamId(name), divisionOf: () => 'mixed', eventName: () => 'Mixed Western Regionals 2026',
});
const res = importExport(RES_DIR, {
  key: 'res2026', level: 'league', kind: 'league', region: 'western',
  teamOf: (name, div) => {
    const id = teamId(`Res: ${name}`);
    if (!T.team.some((t) => t.id === id)) add('team', { id, name, short_name: null, kind: 'university', region: 'western', city: 'Stellenbosch', division: /women/i.test(div) ? 'women' : 'open', about: 'Stellenbosch University residence team.', is_sample: 0, created_at: CREATED, updated_at: CREATED });
    return id;
  },
  divisionOf: (div) => (/women/i.test(div) ? 'women' : 'open'),
  eventName: (div) => `Stellenbosch Residence League 2026 · ${/women/i.test(div) ? 'Women’s' : 'Men’s'}`,
});

/* ---------------- Chilli Heat: invented roster ---------------- */

const HEAT = teamId('Chilli Heat');
const heatRoster: { personId: string; gender: 'W' | 'M'; jersey: string }[] = [];
for (let i = 0; i < 16; i++) {
  const g = i % 2 ? 'M' : 'W';
  const p = addPerson(`heat:${i}`, g, String(10 + i * 3));
  addMember(p.id, HEAT, i === 0 ? 'captain' : 'player', String(10 + i * 3));
  heatRoster.push({ personId: p.id, gender: g, jersey: String(10 + i * 3) });
}

/* ---------------- Cape Town Mixed League 2026 (invented double round robin) ---------------- */

const LEAGUE = demoId('event:ctml2026');
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

const rosterOf = (team: string) => (team === HEAT ? heatRoster : (wr.rosterByTeam.get(team) ?? []));
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
function simulateGame(gameId: string, a: string, b: string, start: string) {
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
    for (let k = 0; k < turns; k++) {
      const defending = holder === a ? b : a;
      const at = new Date(t + ((k + 1) * dur * 1000) / (turns + 2)).toISOString();
      if (r() < 0.35) add('game_event', { id: demoId(`ev:${gameId}:${n}:${k}`), game_id: gameId, point_id: pointId, seq: ++seq, type: 'intercept', team_id: defending, actor_id: pickOf(r, lines[defending]).personId, recorded_at: at, device_id: 'demo' });
      else add('game_event', { id: demoId(`ev:${gameId}:${n}:${k}`), game_id: gameId, point_id: pointId, seq: ++seq, type: r() < 0.6 ? 'throwaway' : 'drop', team_id: holder, actor_id: pickOf(r, lines[holder]).personId, recorded_at: at, device_id: 'demo' });
      holder = defending;
    }
    const line = lines[scorer];
    const goal = pickOf(r, line);
    const assist = pickOf(r, line.filter((p) => p !== goal));
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

/* ---------------- write the JSON (phones) and SQL (server) ---------------- */

const tables = ORDER.filter((t) => T[t]?.length).map((t) => [t, T[t]] as const);
const counts = Object.fromEntries(tables.map(([t, rows]) => [t, rows.length]));
// Columnar (column names once, then value lists) keeps the file small enough to ship in the app.
const columnar = Object.fromEntries(
  tables.map(([t, rows]) => {
    const cols = Object.keys(Object.assign({}, ...rows));
    return [t, { cols, rows: rows.map((r) => cols.map((c) => r[c] ?? null)) }];
  }),
);
writeFileSync(join(ROOT, 'mobile/src/content/demo/demo-2026.json'), JSON.stringify({ version: 1, builtFor: TODAY, teamUpdates, tables: columnar }));

const serverCols: Record<string, string[]> = JSON.parse(readFileSync(join(__dirname, 'server-columns.json'), 'utf8'));
const lit = (v: string | number | null | undefined) => (v == null ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const sql: string[] = [
  '-- Demo content for sharing the app: clubs and teams from the public SAFDA/CTFDA directories, real results',
  '-- and point-by-point logs from Western Regionals 2026 and the Stellenbosch Residence League 2026 with',
  '-- invented player names (is_placeholder = 1), and a made-up Cape Town Mixed League 2026, Chilli Legends',
  '-- practices, an AGM and announcements. Generated by tools/demo/build.ts; do not edit by hand.',
  '',
];
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
writeFileSync(join(ROOT, 'supabase/migrations/20261024150000_demo_content.sql'), sql.join('\n') + '\n');

console.log(`clubs ${counts.club} · new teams ${counts.team} (+${teamUpdates.length} updated) · people ${counts.person} · games ${counts.game} (WR ${wr.imported}, Res ${res.imported}, league ${leagueGames}) · points ${counts.point} · events ${counts.game_event} · practices ${practices}`);
console.log(counts);
