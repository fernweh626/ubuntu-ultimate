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
  // v5: practices/pickups as sessions, post-session reflections, shout-outs
  `
  CREATE TABLE session (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('practice','pickup','other')),
    team_id TEXT REFERENCES team(id),
    title TEXT,
    started_at TEXT NOT NULL,
    duration_min INTEGER NOT NULL,
    venue_id TEXT REFERENCES venue(id),
    created_by_id TEXT REFERENCES person(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  -- One per person per game/session. Load and wellbeing numbers are columns so they can be summed;
  -- everything else is in answers_json. Visible to the person and to staff of the team only.
  CREATE TABLE reflection (
    id TEXT PRIMARY KEY NOT NULL,
    person_id TEXT NOT NULL REFERENCES person(id),
    team_id TEXT REFERENCES team(id),
    game_id TEXT REFERENCES game(id),
    session_id TEXT REFERENCES session(id),
    kind TEXT NOT NULL CHECK (kind IN ('game','practice','pickup')),
    minutes INTEGER,
    rpe INTEGER CHECK (rpe BETWEEN 1 AND 10),
    self_rating INTEGER CHECK (self_rating BETWEEN 1 AND 5),
    playing_time TEXT CHECK (playing_time IN ('too_little','right','too_much')),
    niggle_area TEXT,
    niggle_severity TEXT CHECK (niggle_severity IN ('mild','moderate','bad')),
    answers_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (person_id, game_id),
    UNIQUE (person_id, session_id)
  );
  CREATE INDEX idx_reflection_person ON reflection(person_id, created_at);

  -- Visible to everyone on that team's squad, never public.
  CREATE TABLE shoutout (
    id TEXT PRIMARY KEY NOT NULL,
    from_person_id TEXT NOT NULL REFERENCES person(id),
    to_person_id TEXT NOT NULL REFERENCES person(id),
    team_id TEXT REFERENCES team(id),
    game_id TEXT REFERENCES game(id),
    session_id TEXT REFERENCES session(id),
    reason TEXT,
    created_at TEXT NOT NULL
  );
  `,
  // v6: competition formats — which stage/round a game belongs to, and playoff brackets
  `
  ALTER TABLE game ADD COLUMN stage TEXT;   -- null/'pool' = round robin or pool play, 'swiss', 'playoff'
  ALTER TABLE game ADD COLUMN round INTEGER;
  -- One slot per playoff game. Each side is filled from a source once it is known:
  -- {"type":"rank","pool":"A"|null,"rank":1} | {"type":"winner","slot":"<slot id>"} | {"type":"loser","slot":"<slot id>"}
  CREATE TABLE bracket_slot (
    id TEXT PRIMARY KEY NOT NULL,
    event_id TEXT NOT NULL REFERENCES event(id),
    name TEXT NOT NULL,
    round INTEGER NOT NULL,
    position INTEGER NOT NULL,
    source_a TEXT NOT NULL,
    source_b TEXT NOT NULL,
    game_id TEXT REFERENCES game(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_bracket_slot_event ON bracket_slot(event_id);
  `,
  // v7: bracket slots can be scheduled before their teams are known, and know which places they decide
  `
  ALTER TABLE bracket_slot ADD COLUMN grp TEXT;            -- 'Championship', '5th–8th', …
  ALTER TABLE bracket_slot ADD COLUMN place INTEGER;       -- for a placing game, the better place it decides (1 = final)
  ALTER TABLE bracket_slot ADD COLUMN scheduled_at TEXT;
  ALTER TABLE bracket_slot ADD COLUMN venue_id TEXT REFERENCES venue(id);
  `,
  // v8: online sync — a local outbox filled by triggers, levels and join requests from the server
  `
  ALTER TABLE person ADD COLUMN is_minor INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE role_grant (
    id TEXT PRIMARY KEY NOT NULL,
    person_id TEXT NOT NULL,
    level TEXT NOT NULL,
    granted_by TEXT,
    created_at TEXT
  );

  CREATE TABLE join_request (
    id TEXT PRIMARY KEY NOT NULL,
    person_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'core',
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    decided_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Every local change to a synced table lands here (one row per record) until it reaches the server.
  -- Rows written while pulling from the server are skipped (app_meta.sync_pulling is set).
  CREATE TABLE sync_outbox (
    tbl TEXT NOT NULL,
    pk TEXT NOT NULL,
    op TEXT NOT NULL CHECK (op IN ('upsert','delete')),
    at TEXT NOT NULL,
    PRIMARY KEY (tbl, pk)
  );

  CREATE TRIGGER sync_person_insert AFTER INSERT ON person
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('person', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_person_update AFTER UPDATE ON person
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('person', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_person_delete AFTER DELETE ON person
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('person', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_team_insert AFTER INSERT ON team
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('team', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_team_update AFTER UPDATE ON team
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('team', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_team_delete AFTER DELETE ON team
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('team', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_membership_insert AFTER INSERT ON membership
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('membership', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_membership_update AFTER UPDATE ON membership
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('membership', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_membership_delete AFTER DELETE ON membership
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('membership', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_venue_insert AFTER INSERT ON venue
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('venue', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_venue_update AFTER UPDATE ON venue
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('venue', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_venue_delete AFTER DELETE ON venue
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('venue', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_event_insert AFTER INSERT ON event
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('event', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_event_update AFTER UPDATE ON event
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('event', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_event_delete AFTER DELETE ON event
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('event', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_event_team_insert AFTER INSERT ON event_team
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('event_team', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_event_team_update AFTER UPDATE ON event_team
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('event_team', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_event_team_delete AFTER DELETE ON event_team
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('event_team', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_game_insert AFTER INSERT ON game
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('game', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_game_update AFTER UPDATE ON game
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('game', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_game_delete AFTER DELETE ON game
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('game', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_game_player_insert AFTER INSERT ON game_player
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('game_player', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_game_player_update AFTER UPDATE ON game_player
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('game_player', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_game_player_delete AFTER DELETE ON game_player
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('game_player', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_point_insert AFTER INSERT ON point
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('point', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_point_update AFTER UPDATE ON point
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('point', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_point_delete AFTER DELETE ON point
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('point', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_point_player_insert AFTER INSERT ON point_player
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('point_player', json_object('point_id', NEW.point_id, 'person_id', NEW.person_id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_point_player_update AFTER UPDATE ON point_player
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('point_player', json_object('point_id', NEW.point_id, 'person_id', NEW.person_id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_point_player_delete AFTER DELETE ON point_player
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('point_player', json_object('point_id', OLD.point_id, 'person_id', OLD.person_id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_game_event_insert AFTER INSERT ON game_event
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('game_event', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_game_event_update AFTER UPDATE ON game_event
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('game_event', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_game_event_delete AFTER DELETE ON game_event
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('game_event', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_saved_line_insert AFTER INSERT ON saved_line
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('saved_line', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_saved_line_update AFTER UPDATE ON saved_line
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('saved_line', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_saved_line_delete AFTER DELETE ON saved_line
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('saved_line', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_saved_line_member_insert AFTER INSERT ON saved_line_member
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('saved_line_member', json_object('line_id', NEW.line_id, 'person_id', NEW.person_id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_saved_line_member_update AFTER UPDATE ON saved_line_member
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('saved_line_member', json_object('line_id', NEW.line_id, 'person_id', NEW.person_id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_saved_line_member_delete AFTER DELETE ON saved_line_member
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('saved_line_member', json_object('line_id', OLD.line_id, 'person_id', OLD.person_id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_spirit_score_insert AFTER INSERT ON spirit_score
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('spirit_score', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_spirit_score_update AFTER UPDATE ON spirit_score
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('spirit_score', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_spirit_score_delete AFTER DELETE ON spirit_score
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('spirit_score', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_pickup_spot_insert AFTER INSERT ON pickup_spot
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('pickup_spot', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_pickup_spot_update AFTER UPDATE ON pickup_spot
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('pickup_spot', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_pickup_spot_delete AFTER DELETE ON pickup_spot
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('pickup_spot', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_calendar_entry_insert AFTER INSERT ON calendar_entry
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('calendar_entry', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_calendar_entry_update AFTER UPDATE ON calendar_entry
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('calendar_entry', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_calendar_entry_delete AFTER DELETE ON calendar_entry
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('calendar_entry', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_follow_insert AFTER INSERT ON follow
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('follow', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_follow_update AFTER UPDATE ON follow
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('follow', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_follow_delete AFTER DELETE ON follow
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('follow', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_game_status_log_insert AFTER INSERT ON game_status_log
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('game_status_log', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_game_status_log_update AFTER UPDATE ON game_status_log
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('game_status_log', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_game_status_log_delete AFTER DELETE ON game_status_log
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('game_status_log', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_bracket_slot_insert AFTER INSERT ON bracket_slot
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('bracket_slot', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_bracket_slot_update AFTER UPDATE ON bracket_slot
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('bracket_slot', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_bracket_slot_delete AFTER DELETE ON bracket_slot
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('bracket_slot', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_session_insert AFTER INSERT ON session
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('session', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_session_update AFTER UPDATE ON session
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('session', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_session_delete AFTER DELETE ON session
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('session', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_reflection_insert AFTER INSERT ON reflection
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('reflection', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_reflection_update AFTER UPDATE ON reflection
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('reflection', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_reflection_delete AFTER DELETE ON reflection
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('reflection', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_shoutout_insert AFTER INSERT ON shoutout
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('shoutout', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_shoutout_update AFTER UPDATE ON shoutout
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('shoutout', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_shoutout_delete AFTER DELETE ON shoutout
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('shoutout', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_join_request_insert AFTER INSERT ON join_request
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('join_request', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_join_request_update AFTER UPDATE ON join_request
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('join_request', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_join_request_delete AFTER DELETE ON join_request
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('join_request', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  `,
  // v9: follow pickups too (for the Home timeline). SQLite can't alter a CHECK, so rebuild the table + its sync triggers.
  `
  CREATE TABLE follow_v9 (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('team','event','player','pickup')),
    target_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (kind, target_id)
  );
  INSERT INTO follow_v9 (id, kind, target_id, created_at) SELECT id, kind, target_id, created_at FROM follow;
  DROP TABLE follow;
  ALTER TABLE follow_v9 RENAME TO follow;
  CREATE TRIGGER sync_follow_insert AFTER INSERT ON follow
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('follow', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_follow_update AFTER UPDATE ON follow
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('follow', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_follow_delete AFTER DELETE ON follow
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('follow', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  `,
  // v10: scheduled practices (notes, cancel, weekly series) and who's coming.
  `
  ALTER TABLE session ADD COLUMN notes TEXT;
  ALTER TABLE session ADD COLUMN cancelled_at TEXT;
  ALTER TABLE session ADD COLUMN series_id TEXT;
  -- One row per player per practice; id is session_id:person_id so two phones answering agree.
  CREATE TABLE practice_rsvp (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES session(id),
    person_id TEXT NOT NULL REFERENCES person(id),
    status TEXT NOT NULL CHECK (status IN ('going','not_going')),
    reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (session_id, person_id)
  );
  CREATE INDEX idx_practice_rsvp_session ON practice_rsvp (session_id);
  CREATE TRIGGER sync_practice_rsvp_insert AFTER INSERT ON practice_rsvp
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('practice_rsvp', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_practice_rsvp_update AFTER UPDATE ON practice_rsvp
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('practice_rsvp', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_practice_rsvp_delete AFTER DELETE ON practice_rsvp
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('practice_rsvp', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  `,
  // v11: accreditation, self-ratings, fitness tests, game availability and practice attendance.
  `
  -- One current accreditation per player (id = person_id). The certificate photo stays on the phone.
  CREATE TABLE accreditation (
    id TEXT PRIMARY KEY NOT NULL,
    person_id TEXT NOT NULL UNIQUE REFERENCES person(id),
    level TEXT NOT NULL CHECK (level IN ('standard','advanced')),
    expires_on TEXT,
    photo_uri TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  -- Self-rating, 1–5 in five areas, redone every six months; rows are the history.
  CREATE TABLE self_rating (
    id TEXT PRIMARY KEY NOT NULL,
    person_id TEXT NOT NULL REFERENCES person(id),
    rated_on TEXT NOT NULL,
    experience INTEGER NOT NULL,
    throwing INTEGER NOT NULL,
    receiving INTEGER NOT NULL,
    defence INTEGER NOT NULL,
    athleticism INTEGER NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_self_rating_person ON self_rating (person_id, rated_on);
  -- Benchmarks. value: beep = level + shuttle/100 (10.05 = level 10 shuttle 5); others in seconds.
  CREATE TABLE fitness_test (
    id TEXT PRIMARY KEY NOT NULL,
    person_id TEXT NOT NULL REFERENCES person(id),
    kind TEXT NOT NULL CHECK (kind IN ('beep','agility_5105','sprint_40','sprint_60')),
    value REAL NOT NULL,
    tested_on TEXT NOT NULL,
    notes TEXT,
    recorded_by_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_fitness_test_person ON fitness_test (person_id, kind, tested_on);
  -- "Are you available?" for a game; id = game_id:person_id.
  CREATE TABLE game_availability (
    id TEXT PRIMARY KEY NOT NULL,
    game_id TEXT NOT NULL REFERENCES game(id),
    person_id TEXT NOT NULL REFERENCES person(id),
    team_id TEXT NOT NULL REFERENCES team(id),
    status TEXT NOT NULL CHECK (status IN ('available','unavailable')),
    reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_game_availability_game ON game_availability (game_id);
  -- Practice register taken by staff; id = session_id:person_id.
  CREATE TABLE practice_attendance (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES session(id),
    person_id TEXT NOT NULL REFERENCES person(id),
    attended INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_practice_attendance_session ON practice_attendance (session_id);
  -- Bug reports and ideas. Sent straight to the server (works without signing in); sent_at marks delivery.
  CREATE TABLE feedback (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('bug','feature','enhancement','other')),
    title TEXT NOT NULL,
    body TEXT,
    screen TEXT,
    app_version TEXT,
    device TEXT,
    contact_ok INTEGER NOT NULL DEFAULT 0,
    person_id TEXT,
    created_at TEXT NOT NULL,
    sent_at TEXT
  );
  CREATE TRIGGER sync_accreditation_insert AFTER INSERT ON accreditation
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('accreditation', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_accreditation_update AFTER UPDATE ON accreditation
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('accreditation', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_accreditation_delete AFTER DELETE ON accreditation
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('accreditation', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_self_rating_insert AFTER INSERT ON self_rating
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('self_rating', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_self_rating_update AFTER UPDATE ON self_rating
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('self_rating', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_self_rating_delete AFTER DELETE ON self_rating
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('self_rating', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_fitness_test_insert AFTER INSERT ON fitness_test
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('fitness_test', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_fitness_test_update AFTER UPDATE ON fitness_test
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('fitness_test', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_fitness_test_delete AFTER DELETE ON fitness_test
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('fitness_test', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_game_availability_insert AFTER INSERT ON game_availability
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('game_availability', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_game_availability_update AFTER UPDATE ON game_availability
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('game_availability', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_game_availability_delete AFTER DELETE ON game_availability
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('game_availability', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_practice_attendance_insert AFTER INSERT ON practice_attendance
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('practice_attendance', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_practice_attendance_update AFTER UPDATE ON practice_attendance
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('practice_attendance', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_practice_attendance_delete AFTER DELETE ON practice_attendance
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('practice_attendance', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  `,
  // v12: association numbers & good standing, form links, and clubs that run several teams.
  `
  -- Your SAFDA and regional association numbers, and a phone number your staff can WhatsApp. id = person_id.
  CREATE TABLE registration (
    id TEXT PRIMARY KEY NOT NULL,
    person_id TEXT NOT NULL UNIQUE REFERENCES person(id),
    safda_number TEXT,
    region_code TEXT,
    region_number TEXT,
    phone TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  -- Good-standing lists uploaded by admins from SAFDA / the regions. id = association:number.
  CREATE TABLE association_standing (
    id TEXT PRIMARY KEY NOT NULL,
    association TEXT NOT NULL,
    number TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('good','unpaid','lapsed')),
    paid_until TEXT,
    uploaded_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_association_standing ON association_standing (association, number);
  -- Links to SAFDA / regional sign-up and payment forms. region_code NULL = national (SAFDA).
  CREATE TABLE org_link (
    id TEXT PRIMARY KEY NOT NULL,
    region_code TEXT,
    label TEXT NOT NULL,
    url TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  -- A club runs several teams (Mixed, Open, Women's, U20…). Club admins act as staff on all of them.
  CREATE TABLE club (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    short_name TEXT,
    region TEXT,
    city TEXT,
    primary_color TEXT,
    logo_uri TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    website TEXT,
    social TEXT,
    about TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE TABLE club_staff (
    id TEXT PRIMARY KEY NOT NULL,
    club_id TEXT NOT NULL REFERENCES club(id),
    person_id TEXT NOT NULL REFERENCES person(id),
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','coach','manager')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (club_id, person_id)
  );
  ALTER TABLE team ADD COLUMN club_id TEXT REFERENCES club(id);
  ALTER TABLE team ADD COLUMN division TEXT;
  -- "I'll be late" as an answer for practices and games (SQLite can't alter a CHECK, so rebuild).
  CREATE TABLE practice_rsvp_v12 (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES session(id),
    person_id TEXT NOT NULL REFERENCES person(id),
    status TEXT NOT NULL CHECK (status IN ('going','late','not_going')),
    reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (session_id, person_id)
  );
  INSERT INTO practice_rsvp_v12 SELECT id, session_id, person_id, status, reason, created_at, updated_at FROM practice_rsvp;
  DROP TABLE practice_rsvp;
  ALTER TABLE practice_rsvp_v12 RENAME TO practice_rsvp;
  CREATE INDEX idx_practice_rsvp_session ON practice_rsvp (session_id);
  CREATE TABLE game_availability_v12 (
    id TEXT PRIMARY KEY NOT NULL,
    game_id TEXT NOT NULL REFERENCES game(id),
    person_id TEXT NOT NULL REFERENCES person(id),
    team_id TEXT NOT NULL REFERENCES team(id),
    status TEXT NOT NULL CHECK (status IN ('available','late','unavailable')),
    reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT INTO game_availability_v12 SELECT id, game_id, person_id, team_id, status, reason, created_at, updated_at FROM game_availability;
  DROP TABLE game_availability;
  ALTER TABLE game_availability_v12 RENAME TO game_availability;
  CREATE INDEX idx_game_availability_game ON game_availability (game_id);
  CREATE TRIGGER sync_practice_rsvp_insert AFTER INSERT ON practice_rsvp
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('practice_rsvp', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_practice_rsvp_update AFTER UPDATE ON practice_rsvp
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('practice_rsvp', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_practice_rsvp_delete AFTER DELETE ON practice_rsvp
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('practice_rsvp', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_game_availability_insert AFTER INSERT ON game_availability
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('game_availability', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_game_availability_update AFTER UPDATE ON game_availability
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('game_availability', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_game_availability_delete AFTER DELETE ON game_availability
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('game_availability', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_registration_insert AFTER INSERT ON registration
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('registration', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_registration_update AFTER UPDATE ON registration
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('registration', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_registration_delete AFTER DELETE ON registration
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('registration', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_association_standing_insert AFTER INSERT ON association_standing
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('association_standing', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_association_standing_update AFTER UPDATE ON association_standing
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('association_standing', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_association_standing_delete AFTER DELETE ON association_standing
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('association_standing', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_org_link_insert AFTER INSERT ON org_link
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('org_link', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_org_link_update AFTER UPDATE ON org_link
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('org_link', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_org_link_delete AFTER DELETE ON org_link
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('org_link', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_club_insert AFTER INSERT ON club
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('club', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_club_update AFTER UPDATE ON club
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('club', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_club_delete AFTER DELETE ON club
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('club', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_club_staff_insert AFTER INSERT ON club_staff
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('club_staff', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_club_staff_update AFTER UPDATE ON club_staff
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('club_staff', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_club_staff_delete AFTER DELETE ON club_staff
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('club_staff', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  `,
  // v13: what kind of link (merch, registration, community…), so the Hub can group them.
  `
  ALTER TABLE org_link ADD COLUMN kind TEXT;
  `,
  // v14: meetings on the calendar (AGM, SGM… with a time and a Zoom/Meet link) and announcements.
  `
  ALTER TABLE calendar_entry ADD COLUMN start_time TEXT;
  ALTER TABLE calendar_entry ADD COLUMN end_time TEXT;
  ALTER TABLE calendar_entry ADD COLUMN meeting_url TEXT;
  -- Posted by coordinators/admins. region_code NULL = national.
  CREATE TABLE announcement (
    id TEXT PRIMARY KEY NOT NULL,
    region_code TEXT,
    title TEXT NOT NULL,
    body TEXT,
    link_url TEXT,
    link_label TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    published_at TEXT NOT NULL,
    created_by_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX idx_announcement_published ON announcement (published_at);
  CREATE TRIGGER sync_announcement_insert AFTER INSERT ON announcement
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('announcement', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_announcement_update AFTER UPDATE ON announcement
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('announcement', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_announcement_delete AFTER DELETE ON announcement
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('announcement', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  `,
  // v15: RSVPs for meetings (AGM, SGM…). id = calendar_entry_id:person_id.
  `
  CREATE TABLE meeting_rsvp (
    id TEXT PRIMARY KEY NOT NULL,
    calendar_entry_id TEXT NOT NULL REFERENCES calendar_entry(id),
    person_id TEXT NOT NULL REFERENCES person(id),
    status TEXT NOT NULL CHECK (status IN ('going','late','not_going')),
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_meeting_rsvp_entry ON meeting_rsvp (calendar_entry_id);
  CREATE TRIGGER sync_meeting_rsvp_insert AFTER INSERT ON meeting_rsvp
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('meeting_rsvp', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_meeting_rsvp_update AFTER UPDATE ON meeting_rsvp
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('meeting_rsvp', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_meeting_rsvp_delete AFTER DELETE ON meeting_rsvp
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('meeting_rsvp', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  `,
  // v16: hat tournaments (sign-up, payment, draw) and lighter results (final score, winner only, or none).
  `
  ALTER TABLE event ADD COLUMN is_hat INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE event ADD COLUMN cost TEXT;
  ALTER TABLE event ADD COLUMN payment_url TEXT;
  ALTER TABLE event ADD COLUMN details TEXT;
  ALTER TABLE event ADD COLUMN start_time TEXT;
  ALTER TABLE event ADD COLUMN venue_id TEXT;
  ALTER TABLE event ADD COLUMN hat_status TEXT;
  ALTER TABLE event ADD COLUMN team_count INTEGER;
  -- result_mode NULL = tracked point by point; 'score' = final score only; 'winner' = who won; 'none' = just played.
  ALTER TABLE game ADD COLUMN result_mode TEXT;
  ALTER TABLE game ADD COLUMN final_a INTEGER;
  ALTER TABLE game ADD COLUMN final_b INTEGER;
  ALTER TABLE game ADD COLUMN winner_team_id TEXT;
  -- One per player per hat; id = event_id:person_id.
  CREATE TABLE hat_signup (
    id TEXT PRIMARY KEY NOT NULL,
    event_id TEXT NOT NULL REFERENCES event(id),
    person_id TEXT NOT NULL REFERENCES person(id),
    attending TEXT NOT NULL DEFAULT 'yes' CHECK (attending IN ('yes','maybe','no')),
    wants_captain INTEGER NOT NULL DEFAULT 0,
    skill INTEGER,
    paid INTEGER NOT NULL DEFAULT 0,
    paid_confirmed INTEGER NOT NULL DEFAULT 0,
    on_the_day INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_hat_signup_event ON hat_signup (event_id);
  CREATE TRIGGER sync_hat_signup_insert AFTER INSERT ON hat_signup
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('hat_signup', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_hat_signup_update AFTER UPDATE ON hat_signup
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('hat_signup', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_hat_signup_delete AFTER DELETE ON hat_signup
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('hat_signup', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  `,
  // v17: 'beach' division. SQLite can't alter a CHECK, so the event table is rebuilt. Other tables point
  // at event, so this runs with foreign keys off and is checked afterwards (see migrate()).
  `
  -- @fk-off
  CREATE TABLE event_v17 (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('tournament','league','scrimmage','practice','pickup')),
    level TEXT NOT NULL DEFAULT 'regional' CHECK (level IN ('international','national','regional','league','minor','social')),
    division TEXT NOT NULL DEFAULT 'mixed' CHECK (division IN ('mixed','open','women','beach','u17','u20','u24','masters')),
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
    deleted_at TEXT,
    is_hat INTEGER NOT NULL DEFAULT 0,
    cost TEXT,
    payment_url TEXT,
    details TEXT,
    start_time TEXT,
    venue_id TEXT,
    hat_status TEXT,
    team_count INTEGER
  );
  INSERT INTO event_v17 (id, name, kind, level, division, region, location, start_date, end_date, rules_json, video_url, photos_url, notes, created_at, updated_at, deleted_at, is_hat, cost, payment_url, details, start_time, venue_id, hat_status, team_count) SELECT id, name, kind, level, division, region, location, start_date, end_date, rules_json, video_url, photos_url, notes, created_at, updated_at, deleted_at, is_hat, cost, payment_url, details, start_time, venue_id, hat_status, team_count FROM event;
  DROP TABLE event;
  ALTER TABLE event_v17 RENAME TO event;
  CREATE TRIGGER sync_event_insert AFTER INSERT ON event
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('event', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_event_update AFTER UPDATE ON event
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('event', json_object('id', NEW.id), 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  CREATE TRIGGER sync_event_delete AFTER DELETE ON event
    WHEN (SELECT value FROM app_meta WHERE key = 'sync_pulling') IS NULL
    BEGIN INSERT INTO sync_outbox (tbl, pk, op, at) VALUES ('event', json_object('id', OLD.id), 'delete', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(tbl, pk) DO UPDATE SET op = excluded.op, at = excluded.at; END;
  `,
];

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    // Table rebuilds that other tables point at need foreign keys off (it can't change inside a transaction).
    const fkOff = sql.includes('@fk-off');
    if (fkOff) await db.execAsync('PRAGMA foreign_keys = OFF');
    try {
      await db.withTransactionAsync(async () => {
        await db.execAsync(sql);
        if (fkOff) {
          const broken = await db.getAllAsync('PRAGMA foreign_key_check');
          if (broken.length) throw new Error(`Migration ${version + 1} broke ${broken.length} foreign keys`);
        }
      });
    } finally {
      if (fkOff) await db.execAsync('PRAGMA foreign_keys = ON');
    }
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}
