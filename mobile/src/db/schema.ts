import type { SQLiteDatabase } from 'expo-sqlite';

/*
 * Local database. It mirrors the server (Postgres) schema planned in docs/data-model.md so that
 * syncing later is a copy, not a rewrite:
 *  - every id is a UUID string generated on the device
 *  - every row has created_at / updated_at (ISO strings); shared rows soft-delete with deleted_at
 *  - games are stored as an append-only event log (game_event) plus a `point` row per point;
 *    every statistic is derived from those, never stored twice
 */

const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE app_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);

  CREATE TABLE person (
    id TEXT PRIMARY KEY NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL DEFAULT '',
    nickname TEXT,
    email TEXT,
    birth_date TEXT,
    gender TEXT CHECK (gender IN ('W','M','X')),
    preferred_number TEXT,
    position TEXT CHECK (position IN ('handler','cutter','hybrid')),
    is_placeholder INTEGER NOT NULL DEFAULT 0,
    claimed_by_id TEXT REFERENCES person(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX idx_person_name ON person(first_name, last_name);

  CREATE TABLE team (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    short_name TEXT,
    kind TEXT NOT NULL DEFAULT 'club' CHECK (kind IN ('club','university','school','regional','national','hat','pickup')),
    region TEXT,
    city TEXT,
    primary_color TEXT,
    secondary_color TEXT,
    logo_uri TEXT,
    contact_name TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    website TEXT,
    social TEXT,
    about TEXT,
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE membership (
    id TEXT PRIMARY KEY NOT NULL,
    person_id TEXT NOT NULL REFERENCES person(id),
    team_id TEXT NOT NULL REFERENCES team(id),
    kind TEXT NOT NULL DEFAULT 'core' CHECK (kind IN ('core','guest','mercenary')),
    scope TEXT NOT NULL DEFAULT 'permanent' CHECK (scope IN ('permanent','season','event','game')),
    scope_ref_id TEXT,
    role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player','captain','coach','spirit_captain','manager')),
    jersey_number TEXT,
    start_date TEXT,
    end_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX idx_membership_team ON membership(team_id);
  CREATE INDEX idx_membership_person ON membership(person_id);

  CREATE TABLE venue (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    city TEXT,
    latitude REAL,
    longitude REAL,
    end_zone_bearing INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE event (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('tournament','league','scrimmage','practice','pickup')),
    level TEXT NOT NULL DEFAULT 'regional' CHECK (level IN ('international','national','regional','league','minor','social')),
    division TEXT NOT NULL DEFAULT 'mixed' CHECK (division IN ('mixed','open','women','u17','u20','u24','masters')),
    region TEXT,
    location TEXT,
    start_date TEXT,
    end_date TEXT,
    rules_json TEXT,
    video_url TEXT,
    photos_url TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE event_team (
    id TEXT PRIMARY KEY NOT NULL,
    event_id TEXT NOT NULL REFERENCES event(id),
    team_id TEXT NOT NULL REFERENCES team(id),
    pool TEXT,
    seed INTEGER,
    created_at TEXT NOT NULL,
    UNIQUE (event_id, team_id)
  );

  CREATE TABLE game (
    id TEXT PRIMARY KEY NOT NULL,
    event_id TEXT REFERENCES event(id),
    venue_id TEXT REFERENCES venue(id),
    field TEXT,
    team_a_id TEXT NOT NULL REFERENCES team(id),
    team_b_id TEXT NOT NULL REFERENCES team(id),
    scheduled_at TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','final','cancelled')),
    tracking_mode TEXT NOT NULL DEFAULT 'standard' CHECK (tracking_mode IN ('lite','standard','full')),
    rules_json TEXT NOT NULL,
    first_pull_team_id TEXT REFERENCES team(id),
    ratio_point1 TEXT CHECK (ratio_point1 IN ('M','W')),
    a_attacks_bearing INTEGER,
    weather_json TEXT,
    video_url TEXT,
    photos_url TEXT,
    started_at TEXT,
    ended_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX idx_game_event ON game(event_id);

  CREATE TABLE game_player (
    id TEXT PRIMARY KEY NOT NULL,
    game_id TEXT NOT NULL REFERENCES game(id),
    team_id TEXT NOT NULL REFERENCES team(id),
    person_id TEXT NOT NULL REFERENCES person(id),
    jersey_number TEXT,
    position TEXT,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','tired','injured','out')),
    UNIQUE (game_id, person_id)
  );

  CREATE TABLE point (
    id TEXT PRIMARY KEY NOT NULL,
    game_id TEXT NOT NULL REFERENCES game(id),
    number INTEGER NOT NULL,
    half INTEGER NOT NULL DEFAULT 1,
    offense_team_id TEXT NOT NULL REFERENCES team(id),
    ratio TEXT,
    puller_id TEXT REFERENCES person(id),
    pull_outcome TEXT CHECK (pull_outcome IN ('in','out','brick','unknown')),
    pulled_at TEXT,
    scored_at TEXT,
    scoring_team_id TEXT REFERENCES team(id),
    created_at TEXT NOT NULL,
    UNIQUE (game_id, number)
  );

  CREATE TABLE point_player (
    point_id TEXT NOT NULL REFERENCES point(id),
    team_id TEXT NOT NULL REFERENCES team(id),
    person_id TEXT NOT NULL REFERENCES person(id),
    PRIMARY KEY (point_id, person_id)
  );

  -- type: pass | score | drop | throwaway | stall | intercept | callahan | timeout | halftime
  --       | stoppage_start | stoppage_end | injury_sub | end
  -- actor = the player who did it (thrower, dropper, scorer, interceptor); secondary = receiver / assist;
  -- tertiary = hockey assist.
  CREATE TABLE game_event (
    id TEXT PRIMARY KEY NOT NULL,
    game_id TEXT NOT NULL REFERENCES game(id),
    point_id TEXT REFERENCES point(id),
    seq INTEGER NOT NULL,
    type TEXT NOT NULL,
    team_id TEXT REFERENCES team(id),
    actor_id TEXT REFERENCES person(id),
    secondary_id TEXT REFERENCES person(id),
    tertiary_id TEXT REFERENCES person(id),
    value TEXT,
    recorded_at TEXT NOT NULL,
    device_id TEXT,
    voided_at TEXT
  );
  CREATE INDEX idx_game_event_game ON game_event(game_id, seq);

  CREATE TABLE saved_line (
    id TEXT PRIMARY KEY NOT NULL,
    team_id TEXT NOT NULL REFERENCES team(id),
    name TEXT NOT NULL,
    side TEXT NOT NULL DEFAULT 'any' CHECK (side IN ('O','D','any')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE saved_line_member (
    line_id TEXT NOT NULL REFERENCES saved_line(id),
    person_id TEXT NOT NULL REFERENCES person(id),
    PRIMARY KEY (line_id, person_id)
  );

  CREATE TABLE spirit_score (
    id TEXT PRIMARY KEY NOT NULL,
    game_id TEXT NOT NULL REFERENCES game(id),
    from_team_id TEXT NOT NULL REFERENCES team(id),
    to_team_id TEXT NOT NULL REFERENCES team(id),
    rules INTEGER NOT NULL,
    fouls INTEGER NOT NULL,
    fairness INTEGER NOT NULL,
    attitude INTEGER NOT NULL,
    communication INTEGER NOT NULL,
    comments_json TEXT,
    overall_comment TEXT,
    submitted_at TEXT NOT NULL,
    UNIQUE (game_id, from_team_id)
  );

  CREATE TABLE pickup_spot (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    region TEXT,
    city TEXT NOT NULL,
    area TEXT,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TEXT NOT NULL,
    end_time TEXT,
    venue_text TEXT,
    map_url TEXT,
    contact_name TEXT,
    contact_phone TEXT,
    whatsapp_url TEXT,
    level TEXT NOT NULL DEFAULT 'all' CHECK (level IN ('all','beginner','competitive')),
    cost TEXT,
    notes TEXT,
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE calendar_entry (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'tournament',
    level TEXT,
    region TEXT,
    location TEXT,
    start_date TEXT,
    end_date TEXT,
    month_hint TEXT,
    status TEXT NOT NULL DEFAULT 'tbc' CHECK (status IN ('confirmed','tbc')),
    url TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  `,
  // v2: profile photos (teams already have logo_uri)
  `
  ALTER TABLE person ADD COLUMN photo_uri TEXT;
  `,
  // v3: following teams/events/players, and confirming who actually played after a game
  `
  CREATE TABLE follow (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('team','event','player')),
    target_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (kind, target_id)
  );
  -- confirmation: pending → confirmed (by team staff) or played (the player said so) or removed (wasn't there)
  ALTER TABLE game_player ADD COLUMN confirmation TEXT NOT NULL DEFAULT 'pending';
  ALTER TABLE game_player ADD COLUMN added_in_game INTEGER NOT NULL DEFAULT 0;
  `,
  // v4: fixtures — home team (sets up the field), postponements and forfeits with reasons
  `
  ALTER TABLE game ADD COLUMN home_team_id TEXT REFERENCES team(id);
  ALTER TABLE game ADD COLUMN postponements INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE game ADD COLUMN forfeit_team_id TEXT REFERENCES team(id);
  -- action: postpone | forfeit | reschedule; reason: weather | lights | not_enough_men | not_enough_women | other
  CREATE TABLE game_status_log (
    id TEXT PRIMARY KEY NOT NULL,
    game_id TEXT NOT NULL REFERENCES game(id),
    action TEXT NOT NULL,
    team_id TEXT REFERENCES team(id),
    reason TEXT,
    note TEXT,
    previous_scheduled_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_game_status_log_game ON game_status_log(game_id);
  `,
];

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
    });
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}
