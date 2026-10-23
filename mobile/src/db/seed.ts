import type { SQLiteDatabase } from 'expo-sqlite';

import { CONTENT_VERSION, pickupSeedKey, RETIRED_PICKUP_KEYS, SEED_CLUBS, STARTER_LINKS, STARTER_PICKUPS } from '@/content/hub';
import { md5 } from './md5';
import { adoptSharedIds } from './shared-ids';

import { now, uuid } from './repo';
import { seedId } from './seed-ids';

const CLUB_COLORS: Record<string, string> = {
  'Chilli Legends': '#BF0000',
  Ghost: '#00562B',
  'Maties Meerkats': '#61223B',
};

// Invented players so a game can be scored on first launch. Clearly marked as samples; delete any time.
const SAMPLE_SQUADS: { team: string; color: string; short: string; players: [string, string, 'W' | 'M', 'handler' | 'cutter' | 'hybrid', string][] }[] = [
  {
    team: 'Sample Light',
    color: '#2F6FB2',
    short: 'LGT',
    players: [
      ['Aisha', 'Daniels', 'W', 'handler', '4'],
      ['Ben', 'Botha', 'M', 'cutter', '11'],
      ['Carla', 'Naidoo', 'W', 'cutter', '7'],
      ['David', 'Mokoena', 'M', 'handler', '23'],
      ['Esme', 'van Wyk', 'W', 'hybrid', '15'],
      ['Faisal', 'Adams', 'M', 'hybrid', '9'],
      ['Grace', 'Dlamini', 'W', 'cutter', '2'],
      ['Hennie', 'Pretorius', 'M', 'cutter', '31'],
      ['Imka', 'Steyn', 'W', 'handler', '18'],
      ['Jabu', 'Khumalo', 'M', 'cutter', '6'],
      ['Kayla', 'Smith', 'W', 'hybrid', '21'],
      ['Liam', 'Jacobs', 'M', 'handler', '10'],
    ],
  },
  {
    team: 'Sample Dark',
    color: '#14181A',
    short: 'DRK',
    players: [
      ['Amahle', 'Zulu', 'W', 'cutter', '3'],
      ['Bongani', 'Nkosi', 'M', 'handler', '12'],
      ['Chloe', 'Fourie', 'W', 'handler', '8'],
      ['Dian', 'Venter', 'M', 'cutter', '44'],
      ['Elena', 'Petersen', 'W', 'cutter', '5'],
      ['Francois', 'du Toit', 'M', 'hybrid', '17'],
      ['Gugu', 'Mthembu', 'W', 'hybrid', '13'],
      ['Hugo', 'Visser', 'M', 'cutter', '27'],
      ['Iman', 'Hendricks', 'W', 'cutter', '20'],
      ['Jason', 'Marais', 'M', 'handler', '1'],
      ['Kgomotso', 'Molefe', 'W', 'handler', '14'],
      ['Luke', 'Swart', 'M', 'cutter', '33'],
    ],
  },
];

const VENUES: [string, string, number, number][] = [
  ['Plumstead 1', 'Cape Town', -34.026253, 18.4741681],
  ['Plumstead 2', 'Cape Town', -34.0265125, 18.4735879],
  ['Wynberg 1', 'Cape Town', -34.0091386693607, 18.4604537531774],
];

const CALENDAR: {
  name: string;
  kind: string;
  level: string;
  region: string | null;
  location: string | null;
  start: string | null;
  end: string | null;
  month: string | null;
  status: 'confirmed' | 'tbc';
  notes: string;
}[] = [
  { name: 'Mixed Western Regionals 2026', kind: 'tournament', level: 'regional', region: 'western', location: 'Cape Town', start: '2026-10-02', end: '2026-10-04', month: null, status: 'confirmed', notes: 'Qualifier for Mixed Nationals.' },
  { name: 'Cape Town Mixed League 2026', kind: 'league', level: 'league', region: 'western', location: 'Cape Town', start: '2026-08-22', end: '2026-11-02', month: null, status: 'confirmed', notes: '' },
  { name: 'Gauteng Mixed League 2026', kind: 'league', level: 'league', region: 'northern', location: 'Gauteng', start: '2026-08-31', end: '2026-11-29', month: null, status: 'confirmed', notes: '' },
  { name: 'Mixed Nationals 2026', kind: 'tournament', level: 'national', region: 'kzn', location: 'KwaZulu-Natal', start: '2026-12-04', end: '2026-12-06', month: null, status: 'confirmed', notes: 'The flagship mixed-division championship.' },
  { name: 'Rocktober', kind: 'tournament', level: 'social', region: 'northern', location: 'Gauteng', start: null, end: null, month: 'October', status: 'tbc', notes: 'Often the biggest tournament of the year — high-intensity but social, and a draw for international teams.' },
  { name: 'Swinburne Hat', kind: 'tournament', level: 'social', region: null, location: 'Near Harrismith', start: null, end: null, month: 'February', status: 'tbc', notes: 'A relaxed hat weekend where you are drafted onto a random team. A great first tournament.' },
  { name: 'Regionals (all regions)', kind: 'tournament', level: 'regional', region: null, location: null, start: null, end: null, month: 'Before Nationals', status: 'tbc', notes: 'Northern, Western, KZN and Eastern Cape qualifiers.' },
  { name: 'Open & Women’s Nationals', kind: 'tournament', level: 'national', region: null, location: null, start: null, end: null, month: 'Second half of the year', status: 'tbc', notes: 'Single-gender national championships.' },
  { name: 'Inter-University Tournament', kind: 'tournament', level: 'national', region: null, location: null, start: null, end: null, month: 'TBC', status: 'tbc', notes: 'Student-only competition for university teams.' },
  { name: 'U24 Inter-Regional Tournament', kind: 'tournament', level: 'national', region: null, location: null, start: null, end: null, month: 'TBC', status: 'tbc', notes: 'Regional sides compete to shape national-team selection.' },
  { name: 'All-Africa Club Championships', kind: 'tournament', level: 'international', region: null, location: null, start: null, end: null, month: 'TBC', status: 'tbc', notes: 'The WFDF-sanctioned continental club event.' },
];


export async function seedIfEmpty(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM team`);
  if ((row?.n ?? 0) > 0) return;
  const ts = now();
  // Starting data isn't a local change: keep it out of the sync outbox (the server has its own copy).
  await db.runAsync(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_pulling', '1')`);
  await db.withTransactionAsync(async () => {
    for (const c of SEED_CLUBS) {
      await db.runAsync(
        `INSERT INTO team (id, name, short_name, kind, region, city, primary_color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        await seedId('team', c.name),
        c.name,
        c.short,
        c.name.startsWith('UCT') || c.name.startsWith('Wits') || c.name.startsWith('Maties') ? 'university' : 'club',
        c.region,
        c.city,
        CLUB_COLORS[c.name] ?? null,
        ts,
        ts,
      );
    }
    for (const s of SAMPLE_SQUADS) {
      const teamId = uuid();
      await db.runAsync(
        `INSERT INTO team (id, name, short_name, kind, region, city, primary_color, is_sample, about, created_at, updated_at)
         VALUES (?, ?, ?, 'pickup', 'western', 'Cape Town', ?, 1, ?, ?, ?)`,
        teamId,
        s.team,
        s.short,
        s.color,
        'Sample team with made-up players so you can try scoring. Delete it any time.',
        ts,
        ts,
      );
      for (const [first, last, gender, position, number] of s.players) {
        const personId = uuid();
        await db.runAsync(
          `INSERT INTO person (id, first_name, last_name, gender, position, preferred_number, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          personId,
          first,
          last,
          gender,
          position,
          number,
          ts,
          ts,
        );
        await db.runAsync(
          `INSERT INTO membership (id, person_id, team_id, kind, jersey_number, start_date, created_at, updated_at)
           VALUES (?, ?, ?, 'core', ?, ?, ?, ?)`,
          uuid(),
          personId,
          teamId,
          number,
          ts.slice(0, 10),
          ts,
          ts,
        );
      }
    }
    for (const [name, city, lat, lng] of VENUES) {
      await db.runAsync(
        `INSERT INTO venue (id, name, city, latitude, longitude, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        await seedId('venue', name),
        name,
        city,
        lat,
        lng,
        ts,
        ts,
      );
    }
    for (const c of CALENDAR) {
      await db.runAsync(
        `INSERT INTO calendar_entry (id, name, kind, level, region, location, start_date, end_date, month_hint, status,
           notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        await seedId('calendar', c.name),
        c.name,
        c.kind,
        c.level,
        c.region,
        c.location,
        c.start,
        c.end,
        c.month,
        c.status,
        c.notes,
        ts,
        ts,
      );
    }
  });
  await db.runAsync(`DELETE FROM app_meta WHERE key = 'sync_pulling'`);
}

/**
 * Real content from the associations' sites (pickups, links). Runs every start-up but only does
 * work when CONTENT_VERSION goes up, so existing phones get new content too. Ids are seed ids, so the
 * rows match the server's copy (supabase/migrations/*_starter_content.sql) and never sync as edits.
 */
export async function ensureStarterContent(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'content_version'`);
  if (Number(row?.value ?? 0) >= CONTENT_VERSION) return;
  const ts = now();
  await db.runAsync(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_pulling', '1')`);
  try {
    await db.withTransactionAsync(async () => {
      // The made-up sample pickups, and website pickups that aren't running any more, are replaced.
      await db.runAsync(`DELETE FROM pickup_spot WHERE is_sample = 1`);
      const current = new Set(await Promise.all(STARTER_PICKUPS.map((p) => seedId('pickup', pickupSeedKey(p)))));
      for (const key of RETIRED_PICKUP_KEYS) {
        const id = await seedId('pickup', key);
        if (!current.has(id)) await db.runAsync(`DELETE FROM pickup_spot WHERE id = ?`, id);
      }
      for (const p of STARTER_PICKUPS) {
        await db.runAsync(
          `INSERT INTO pickup_spot (id, name, region, city, area, day_of_week, start_time, venue_text, whatsapp_url, contact_name, level, cost, notes, is_sample, created_at, updated_at)
           VALUES (?, ?, 'western', ?, ?, ?, ?, ?, ?, ?, 'all', 'Free', ?, 0, ?, ?)
           ON CONFLICT(id) DO UPDATE SET start_time = excluded.start_time, venue_text = excluded.venue_text, notes = excluded.notes,
             contact_name = excluded.contact_name, name = excluded.name`,
          await seedId('pickup', pickupSeedKey(p)),
          p.name,
          p.city,
          p.area || null,
          p.day,
          p.start,
          p.venue,
          p.whatsapp,
          p.contact ?? null,
          p.notes,
          ts,
          ts,
        );
      }
      for (const [i, l] of STARTER_LINKS.entries()) {
        await db.runAsync(
          `INSERT OR IGNORE INTO org_link (id, region_code, kind, label, url, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          await seedId('link', l.url),
          l.region,
          l.kind,
          l.label,
          l.url,
          i,
          ts,
          ts,
        );
      }
      await db.runAsync(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('content_version', ?)`, String(CONTENT_VERSION));
    });
  } finally {
    await db.runAsync(`DELETE FROM app_meta WHERE key = 'sync_pulling'`);
  }
}

/** Bump with tools/demo/build.ts's `version` when the demo content changes. */
const DEMO_VERSION = 1;

type DemoFile = {
  version: number;
  teamUpdates: Record<string, string | number | null>[];
  tables: Record<string, { cols: string[]; rows: (string | number | null)[][] }>;
};

/**
 * Demo content for sharing the app (tools/demo/build.ts): clubs and teams from the public directories,
 * real Western Regionals and Residence League results with invented player names, a made-up Cape Town
 * Mixed League, Chilli Legends practices, an AGM and two announcements. Same ids as the server's copy.
 */
export async function ensureDemoContent(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'demo_version'`);
  if (Number(row?.value ?? 0) >= DEMO_VERSION) return;
  // Only read the (large) demo file when it's actually needed.
  const demo = require('@/content/demo/demo-2026.json') as DemoFile;
  // Demo rows point at the shared starting teams and fields, so older phones adopt the shared ids first.
  await adoptSharedIds(db);
  await db.runAsync(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_pulling', '1')`);
  try {
    await db.withTransactionAsync(async () => {
      for (const [table, { cols, rows }] of Object.entries(demo.tables)) {
        // Several rows per statement, under SQLite's variable limit.
        const per = Math.max(1, Math.floor(900 / cols.length));
        for (let i = 0; i < rows.length; i += per) {
          const chunk = rows.slice(i, i + per);
          await db.runAsync(
            `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES ${chunk.map(() => `(${cols.map(() => '?').join(', ')})`).join(', ')}`,
            ...chunk.flat(),
          );
        }
      }
      for (const u of demo.teamUpdates) {
        const sets = Object.keys(u).filter((k) => k !== 'id');
        await db.runAsync(`UPDATE team SET ${sets.map((k) => `${k} = COALESCE(${k}, ?)`).join(', ')} WHERE id = ?`, ...sets.map((k) => u[k]), u.id);
      }
      // Squads: everyone on the two demo rosters played in each played demo game.
      const played = (demo.tables.game?.rows ?? []).map((r) => Object.fromEntries(demo.tables.game.cols.map((c, i) => [c, r[i]]))).filter((g) => g.started_at);
      const members = await db.getAllAsync<{ person_id: string; team_id: string; jersey_number: string | null }>(
        `SELECT m.person_id, m.team_id, m.jersey_number FROM membership m JOIN person p ON p.id = m.person_id WHERE p.is_placeholder = 1`,
      );
      const byTeam = new Map<string, typeof members>();
      for (const m of members) byTeam.set(m.team_id, [...(byTeam.get(m.team_id) ?? []), m]);
      for (const g of played) {
        const squad = [...(byTeam.get(String(g.team_a_id)) ?? []), ...(byTeam.get(String(g.team_b_id)) ?? [])];
        for (let i = 0; i < squad.length; i += 100) {
          const chunk = squad.slice(i, i + 100);
          await db.runAsync(
            `INSERT OR IGNORE INTO game_player (id, game_id, team_id, person_id, jersey_number, status, confirmation, added_in_game) VALUES ${chunk.map(() => `(?, ?, ?, ?, ?, 'available', 'confirmed', 0)`).join(', ')}`,
            ...chunk.flatMap((m) => {
              const h = md5(`gp:${g.id}:${m.person_id}`);
              return [`${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`, g.id, m.team_id, m.person_id, m.jersey_number];
            }),
          );
        }
      }
      await db.runAsync(`UPDATE calendar_entry SET end_date = '2026-11-14', status = 'confirmed' WHERE id = ?`, await seedId('calendar', 'Cape Town Mixed League 2026'));
      await db.runAsync(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('demo_version', ?)`, String(demo.version));
    });
  } finally {
    await db.runAsync(`DELETE FROM app_meta WHERE key = 'sync_pulling'`);
  }
}
