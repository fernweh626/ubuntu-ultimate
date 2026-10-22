import type { SQLiteDatabase } from 'expo-sqlite';

import { SEED_CLUBS } from '@/content/hub';

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

const PICKUPS: [string, string, string, number, string, string][] = [
  // name, city, region, day (Mon=0), start, notes
  ['Sample: weekday pickup', 'Cape Town', 'western', 1, '18:00', 'Sample entry — edit with the real venue, time and WhatsApp link, or delete it.'],
  ['Sample: Saturday social', 'Johannesburg', 'northern', 5, '09:00', 'Sample entry — edit or delete.'],
  ['Sample: beach ultimate', 'Durban', 'kzn', 6, '15:00', 'Sample entry — edit or delete.'],
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
    for (const [name, city, region, day, start, notes] of PICKUPS) {
      await db.runAsync(
        `INSERT INTO pickup_spot (id, name, region, city, day_of_week, start_time, notes, is_sample, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        uuid(),
        name,
        region,
        city,
        day,
        start,
        notes,
        ts,
        ts,
      );
    }
  });
  await db.runAsync(`DELETE FROM app_meta WHERE key = 'sync_pulling'`);
}
