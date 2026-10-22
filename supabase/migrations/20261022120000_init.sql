-- SA Ultimate: server schema.
-- Mirrors the app's SQLite tables (mobile/src/db/schema.ts) so syncing is a copy, not a rewrite:
-- ids are text UUIDs made on the phone, app timestamps are ISO text. Every synced table also gets
-- server_updated_at (set by the server) which devices use to pull changes, and deletes leave a
-- tombstone so other devices learn about them.
-- Row level security is on for every table; the rules mirror mobile/src/domain/permissions.ts.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table person (
  id text primary key,
  first_name text not null,
  last_name text not null default '',
  nickname text,
  gender text check (gender in ('W','M','X')),
  preferred_number text,
  position text check (position in ('handler','cutter','hybrid')),
  is_placeholder integer not null default 0,
  claimed_by_id text,
  photo_uri text,
  is_minor integer not null default 0,           -- maintained from person_private.birth_date
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);

-- Email and birth date: written by the player or whoever adds them, read only by the player.
create table person_private (
  person_id text primary key,
  email text,
  birth_date text,
  server_updated_at timestamptz not null default now()
);

create table team (
  id text primary key,
  name text not null,
  short_name text,
  kind text not null default 'club',
  region text,
  city text,
  primary_color text,
  secondary_color text,
  logo_uri text,
  contact_name text,
  contact_phone text,
  contact_email text,
  website text,
  social text,
  about text,
  is_sample integer not null default 0,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);

create table membership (
  id text primary key,
  person_id text not null,
  team_id text not null,
  kind text not null default 'core' check (kind in ('core','guest','mercenary')),
  scope text not null default 'permanent',
  scope_ref_id text,
  role text not null default 'player' check (role in ('player','captain','coach','spirit_captain','manager')),
  jersey_number text,
  start_date text,
  end_date text,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  server_updated_at timestamptz not null default now()
);
create index on membership (person_id);
create index on membership (team_id);

create table venue (
  id text primary key,
  name text not null,
  city text,
  latitude double precision,
  longitude double precision,
  end_zone_bearing integer,
  notes text,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);

create table event (
  id text primary key,
  name text not null,
  kind text not null,
  level text not null default 'regional',
  division text not null default 'mixed',
  region text,
  location text,
  start_date text,
  end_date text,
  rules_json text,
  video_url text,
  photos_url text,
  notes text,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);

create table event_team (
  id text primary key,
  event_id text not null,
  team_id text not null,
  pool text,
  seed integer,
  created_at text not null,
  server_updated_at timestamptz not null default now(),
  unique (event_id, team_id)
);

create table game (
  id text primary key,
  event_id text,
  venue_id text,
  field text,
  team_a_id text not null,
  team_b_id text not null,
  scheduled_at text,
  status text not null default 'scheduled',
  tracking_mode text not null default 'standard',
  rules_json text not null,
  first_pull_team_id text,
  ratio_point1 text,
  a_attacks_bearing integer,
  weather_json text,
  video_url text,
  photos_url text,
  started_at text,
  ended_at text,
  home_team_id text,
  postponements integer not null default 0,
  forfeit_team_id text,
  stage text,
  round integer,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);
create index on game (event_id);

create table game_player (
  id text primary key,
  game_id text not null,
  team_id text not null,
  person_id text not null,
  jersey_number text,
  position text,
  status text not null default 'available',
  confirmation text not null default 'pending',
  added_in_game integer not null default 0,
  server_updated_at timestamptz not null default now(),
  unique (game_id, person_id)
);
create index on game_player (game_id);

create table point (
  id text primary key,
  game_id text not null,
  number integer not null,
  half integer not null default 1,
  offense_team_id text not null,
  ratio text,
  puller_id text,
  pull_outcome text,
  pulled_at text,
  scored_at text,
  scoring_team_id text,
  created_at text not null,
  server_updated_at timestamptz not null default now()
);
create index on point (game_id);

create table point_player (
  point_id text not null,
  team_id text not null,
  person_id text not null,
  server_updated_at timestamptz not null default now(),
  primary key (point_id, person_id)
);

create table game_event (
  id text primary key,
  game_id text not null,
  point_id text,
  seq integer not null,
  type text not null,
  team_id text,
  actor_id text,
  secondary_id text,
  tertiary_id text,
  value text,
  recorded_at text not null,
  device_id text,
  voided_at text,
  server_updated_at timestamptz not null default now()
);
create index on game_event (game_id, seq);

create table saved_line (
  id text primary key,
  team_id text not null,
  name text not null,
  side text not null default 'any',
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  server_updated_at timestamptz not null default now()
);

create table saved_line_member (
  line_id text not null,
  person_id text not null,
  server_updated_at timestamptz not null default now(),
  primary key (line_id, person_id)
);

create table spirit_score (
  id text primary key,
  game_id text not null,
  from_team_id text not null,
  to_team_id text not null,
  rules integer not null,
  fouls integer not null,
  fairness integer not null,
  attitude integer not null,
  communication integer not null,
  comments_json text,
  overall_comment text,
  submitted_at text not null,
  server_updated_at timestamptz not null default now(),
  unique (game_id, from_team_id)
);

create table pickup_spot (
  id text primary key,
  name text not null,
  region text,
  city text not null,
  area text,
  day_of_week integer not null,
  start_time text not null,
  end_time text,
  venue_text text,
  map_url text,
  contact_name text,
  contact_phone text,
  whatsapp_url text,
  level text not null default 'all',
  cost text,
  notes text,
  is_sample integer not null default 0,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);

create table calendar_entry (
  id text primary key,
  name text not null,
  kind text not null default 'tournament',
  level text,
  region text,
  location text,
  start_date text,
  end_date text,
  month_hint text,
  status text not null default 'tbc',
  url text,
  notes text,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);

create table follow (
  id text primary key,
  user_id uuid not null default auth.uid(),
  kind text not null,
  target_id text not null,
  created_at text not null,
  server_updated_at timestamptz not null default now(),
  unique (user_id, kind, target_id)
);

create table game_status_log (
  id text primary key,
  game_id text not null,
  action text not null,
  team_id text,
  reason text,
  note text,
  previous_scheduled_at text,
  created_at text not null,
  server_updated_at timestamptz not null default now()
);

create table bracket_slot (
  id text primary key,
  event_id text not null,
  name text not null,
  round integer not null,
  position integer not null,
  source_a text not null,
  source_b text not null,
  game_id text,
  grp text,
  place integer,
  scheduled_at text,
  venue_id text,
  created_at text not null,
  server_updated_at timestamptz not null default now()
);

create table session (
  id text primary key,
  kind text not null,
  team_id text,
  title text,
  started_at text not null,
  duration_min integer not null,
  venue_id text,
  created_by_id text,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);

create table reflection (
  id text primary key,
  person_id text not null,
  team_id text,
  game_id text,
  session_id text,
  kind text not null,
  minutes integer,
  rpe integer,
  self_rating integer,
  playing_time text,
  niggle_area text,
  niggle_severity text,
  answers_json text not null default '{}',
  created_at text not null,
  updated_at text not null,
  server_updated_at timestamptz not null default now()
);

create table shoutout (
  id text primary key,
  from_person_id text not null,
  to_person_id text not null,
  team_id text,
  game_id text,
  session_id text,
  reason text,
  created_at text not null,
  server_updated_at timestamptz not null default now()
);

-- Server-only tables -----------------------------------------------------------------------------

-- Which person a signed-in user is.
create table account (
  user_id uuid primary key references auth.users on delete cascade,
  person_id text not null unique,
  created_at timestamptz not null default now()
);

-- Admin / coordinator / scorekeeper levels. Team staff comes from membership.role.
create table role_grant (
  id text primary key default gen_random_uuid()::text,
  person_id text not null,
  level text not null check (level in ('admin','coordinator','scorekeeper')),
  granted_by text,
  created_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  unique (person_id, level)
);

-- Asking to join a team; staff approve or decline.
create table join_request (
  id text primary key,
  person_id text not null,
  team_id text not null,
  kind text not null default 'core' check (kind in ('core','guest','mercenary')),
  message text,
  status text not null default 'pending' check (status in ('pending','approved','declined','cancelled')),
  decided_by text,
  created_at text not null,
  updated_at text not null,
  server_updated_at timestamptz not null default now()
);

-- Tombstones so devices learn about deletes.
create table deleted_row (
  id bigserial primary key,
  tbl text not null,
  pk jsonb not null,
  deleted_at timestamptz not null default now()
);
create index on deleted_row (deleted_at);

-- Expo push tokens per signed-in user (for notifications).
create table push_token (
  token text primary key,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Sync plumbing: server_updated_at on every write, tombstones on delete
-- ---------------------------------------------------------------------------------------------

create function touch_server_updated_at() returns trigger language plpgsql as $$
begin
  new.server_updated_at := now();
  return new;
end $$;

create function record_tombstone() returns trigger language plpgsql security definer set search_path = public as $$
declare
  key jsonb;
begin
  key := case tg_table_name
    when 'point_player' then jsonb_build_object('point_id', old.point_id, 'person_id', old.person_id)
    when 'saved_line_member' then jsonb_build_object('line_id', old.line_id, 'person_id', old.person_id)
    when 'person_private' then jsonb_build_object('person_id', old.person_id)
    else jsonb_build_object('id', to_jsonb(old) ->> 'id')
  end;
  insert into deleted_row (tbl, pk) values (tg_table_name, key);
  return old;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['person','person_private','team','membership','venue','event','event_team','game','game_player',
    'point','point_player','game_event','saved_line','saved_line_member','spirit_score','pickup_spot','calendar_entry',
    'follow','game_status_log','bracket_slot','session','reflection','shoutout','role_grant','join_request']
  loop
    execute format('create trigger touch before insert or update on %I for each row execute function touch_server_updated_at()', t);
    execute format('create trigger tombstone after delete on %I for each row execute function record_tombstone()', t);
    execute format('create index on %I (server_updated_at)', t);
  end loop;
end $$;

-- Keep person.is_minor in step with the private birth date, so everyone can see the age rule but not the date.
create function sync_is_minor() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update person set is_minor = case
      when new.birth_date is not null and (new.birth_date::date + interval '18 years') > now() then 1 else 0 end
    where id = new.person_id;
  return new;
end $$;
create trigger is_minor after insert or update of birth_date on person_private for each row execute function sync_is_minor();

-- ---------------------------------------------------------------------------------------------
-- Who am I, and what may I do
-- ---------------------------------------------------------------------------------------------

create function me() returns text language sql stable security definer set search_path = public as $$
  select person_id from account where user_id = auth.uid()
$$;

-- admin > coordinator > scorekeeper (team staff is per team, see is_staff)
create function level_at_least(lvl text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from role_grant
     where person_id = me()
       and case lvl
             when 'admin' then level = 'admin'
             when 'coordinator' then level in ('admin','coordinator')
             else level in ('admin','coordinator','scorekeeper')
           end
  )
$$;

create function is_staff(p_team text) returns boolean language sql stable security definer set search_path = public as $$
  select level_at_least('coordinator') or exists (
    select 1 from membership
     where person_id = me() and team_id = p_team and role <> 'player'
       and end_date is null and deleted_at is null
  )
$$;

create function on_team(p_team text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from membership where person_id = me() and team_id = p_team and end_date is null and deleted_at is null
  )
$$;

create function team_created_by_me(p_team text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from team t where t.id = p_team and t.created_by = auth.uid())
$$;

-- Score a game: scorekeepers and up, staff of either team, or whoever started a friendly.
create function can_score_game(p_game text) returns boolean language sql stable security definer set search_path = public as $$
  select level_at_least('scorekeeper') or exists (
    select 1 from game
     where id = p_game and (created_by = auth.uid() or is_staff(team_a_id) or is_staff(team_b_id))
  ) or not exists (select 1 from game where id = p_game)
$$;

create function can_score_point(p_point text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select can_score_game(game_id) from point where id = p_point), true)
$$;

create function can_manage_line(p_line text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_staff(team_id) from saved_line where id = p_line), true)
$$;

-- The very first person to sign in after setup becomes admin (there is nobody else to grant it).
create function claim_first_admin() returns boolean language plpgsql security definer set search_path = public as $$
begin
  if me() is null or exists (select 1 from role_grant where level = 'admin') then
    return false;
  end if;
  insert into role_grant (person_id, level, granted_by) values (me(), 'admin', me());
  return true;
end $$;

-- Grant or remove a level, following the rules: admin → coordinator/scorekeeper; coordinator → scorekeeper;
-- team staff → scorekeeper. Scorekeepers and players grant nothing.
create function grant_level(target text, lvl text, give boolean) returns void language plpgsql security definer set search_path = public as $$
declare
  allowed boolean;
begin
  allowed := case lvl
    when 'admin' then level_at_least('admin')
    when 'coordinator' then level_at_least('admin')
    when 'scorekeeper' then level_at_least('coordinator') or exists (
      select 1 from membership where person_id = me() and role <> 'player' and end_date is null and deleted_at is null)
    else false
  end;
  if not allowed then
    raise exception 'You can''t give out that level';
  end if;
  if give then
    insert into role_grant (person_id, level, granted_by) values (target, lvl, me()) on conflict do nothing;
  else
    delete from role_grant where person_id = target and level = lvl;
  end if;
end $$;

-- Staff approve a join request: the person joins the team.
create function decide_join_request(req text, approve boolean) returns void language plpgsql security definer set search_path = public as $$
declare
  r join_request;
begin
  select * into r from join_request where id = req;
  if r is null then raise exception 'Request not found'; end if;
  if not is_staff(r.team_id) then raise exception 'Only this team''s staff can decide'; end if;
  update join_request set status = case when approve then 'approved' else 'declined' end,
         decided_by = me(), updated_at = to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
   where id = req;
  if approve and not exists (
    select 1 from membership where person_id = r.person_id and team_id = r.team_id and end_date is null and deleted_at is null
  ) then
    insert into membership (id, person_id, team_id, kind, role, start_date, created_at, updated_at)
    values (gen_random_uuid()::text, r.person_id, r.team_id, r.kind, 'player',
            to_char(now(), 'YYYY-MM-DD'),
            to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------------------------

alter table person enable row level security;
alter table person_private enable row level security;
alter table team enable row level security;
alter table membership enable row level security;
alter table venue enable row level security;
alter table event enable row level security;
alter table event_team enable row level security;
alter table game enable row level security;
alter table game_player enable row level security;
alter table point enable row level security;
alter table point_player enable row level security;
alter table game_event enable row level security;
alter table saved_line enable row level security;
alter table saved_line_member enable row level security;
alter table spirit_score enable row level security;
alter table pickup_spot enable row level security;
alter table calendar_entry enable row level security;
alter table follow enable row level security;
alter table game_status_log enable row level security;
alter table bracket_slot enable row level security;
alter table session enable row level security;
alter table reflection enable row level security;
alter table shoutout enable row level security;
alter table account enable row level security;
alter table role_grant enable row level security;
alter table join_request enable row level security;
alter table deleted_row enable row level security;
alter table push_token enable row level security;

-- Public stats: anyone (even not signed in) can read the competition data.
create policy read_all on team for select using (true);
create policy read_all on membership for select using (true);
create policy read_all on venue for select using (true);
create policy read_all on event for select using (true);
create policy read_all on event_team for select using (true);
create policy read_all on game for select using (true);
create policy read_all on game_player for select using (true);
create policy read_all on point for select using (true);
create policy read_all on point_player for select using (true);
create policy read_all on game_event for select using (true);
create policy read_all on spirit_score for select using (true);
create policy read_all on pickup_spot for select using (true);
create policy read_all on calendar_entry for select using (true);
create policy read_all on game_status_log for select using (true);
create policy read_all on bracket_slot for select using (true);
create policy read_all on role_grant for select using (true);
create policy read_all on deleted_row for select using (true);

-- People: readable by all, but last names of under-18s are hidden (see person_public below).
create policy read_all on person for select using (true);
create policy insert_signed_in on person for insert to authenticated with check (true);
create policy update_self_or_staff on person for update to authenticated using (
  id = me() or level_at_least('coordinator') or created_by = auth.uid()
  or exists (select 1 from membership m where m.person_id = person.id and is_staff(m.team_id))
);

-- Private details: write-only for others, readable by the person themselves.
create policy read_own on person_private for select to authenticated using (person_id = me());
create policy write_any on person_private for insert to authenticated with check (true);
create policy update_own_or_adder on person_private for update to authenticated using (
  person_id = me()
  or exists (select 1 from person p where p.id = person_private.person_id and p.created_by = auth.uid())
);

create policy insert_signed_in on team for insert to authenticated with check (true);
create policy update_staff on team for update to authenticated using (is_staff(id) or created_by = auth.uid());

create policy write_staff on membership for insert to authenticated with check (
  is_staff(team_id) or team_created_by_me(team_id)
);
create policy update_staff_or_self on membership for update to authenticated using (
  is_staff(team_id) or team_created_by_me(team_id) or person_id = me()
);
create policy delete_staff on membership for delete to authenticated using (is_staff(team_id));

create policy insert_signed_in on venue for insert to authenticated with check (true);
create policy update_owner on venue for update to authenticated using (created_by = auth.uid() or level_at_least('coordinator'));

create policy write_coordinator on event for insert to authenticated with check (level_at_least('coordinator'));
create policy update_coordinator on event for update to authenticated using (level_at_least('coordinator'));
create policy write_coordinator on event_team for all to authenticated using (level_at_least('coordinator')) with check (level_at_least('coordinator'));
create policy write_coordinator on bracket_slot for all to authenticated using (level_at_least('coordinator')) with check (level_at_least('coordinator'));

-- Games: scorekeepers and up start any game; anyone signed in can start a friendly (no event).
create policy insert_game on game for insert to authenticated with check (
  level_at_least('scorekeeper') or event_id is null or is_staff(team_a_id) or is_staff(team_b_id)
);
create policy update_game on game for update to authenticated using (
  can_score_game(id) or is_staff(team_a_id) or is_staff(team_b_id)
);
create policy write_scorer on game_player for insert to authenticated with check (can_score_game(game_id));
create policy update_game_player on game_player for update to authenticated using (
  can_score_game(game_id) or is_staff(team_id) or person_id = me()
);
create policy delete_scorer on game_player for delete to authenticated using (can_score_game(game_id));
create policy write_scorer on point for all to authenticated using (can_score_game(game_id)) with check (can_score_game(game_id));
create policy write_scorer on point_player for all to authenticated using (can_score_point(point_id)) with check (can_score_point(point_id));
create policy write_scorer on game_event for all to authenticated using (can_score_game(game_id)) with check (can_score_game(game_id));
create policy write_status on game_status_log for insert to authenticated with check (
  level_at_least('coordinator') or exists (select 1 from game g where g.id = game_id and (is_staff(g.team_a_id) or is_staff(g.team_b_id)))
);

create policy read_team on saved_line for select using (on_team(team_id) or is_staff(team_id));
create policy write_staff on saved_line for all to authenticated using (is_staff(team_id)) with check (is_staff(team_id));
create policy read_team on saved_line_member for select using (true);
create policy write_staff on saved_line_member for all to authenticated using (can_manage_line(line_id)) with check (can_manage_line(line_id));

create policy write_staff on spirit_score for all to authenticated using (is_staff(from_team_id)) with check (is_staff(from_team_id));

create policy insert_signed_in on pickup_spot for insert to authenticated with check (true);
create policy update_owner on pickup_spot for update to authenticated using (created_by = auth.uid() or level_at_least('coordinator'));
create policy insert_signed_in on calendar_entry for insert to authenticated with check (level_at_least('coordinator'));
create policy update_coordinator on calendar_entry for update to authenticated using (level_at_least('coordinator'));

create policy own on follow for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy read_session on session for select using (
  created_by = auth.uid() or (team_id is not null and (on_team(team_id) or is_staff(team_id)))
);
create policy write_session on session for insert to authenticated with check (team_id is null or is_staff(team_id) or on_team(team_id));
create policy update_session on session for update to authenticated using (created_by = auth.uid() or (team_id is not null and is_staff(team_id)));

-- Reflections: the player, and staff of their team. Nobody else.
create policy read_reflection on reflection for select to authenticated using (person_id = me() or (team_id is not null and is_staff(team_id)));
create policy write_own on reflection for insert to authenticated with check (person_id = me());
create policy update_own on reflection for update to authenticated using (person_id = me());

-- Shout-outs: the squad (and the two people involved).
create policy read_squad on shoutout for select to authenticated using (
  from_person_id = me() or to_person_id = me() or (team_id is not null and on_team(team_id))
);
create policy write_own on shoutout for insert to authenticated with check (from_person_id = me());
create policy delete_own on shoutout for delete to authenticated using (from_person_id = me());

create policy own on account for select to authenticated using (user_id = auth.uid());
create policy claim on account for insert to authenticated with check (
  user_id = auth.uid() and not exists (select 1 from account a where a.person_id = account.person_id)
);

create policy read_join on join_request for select to authenticated using (person_id = me() or is_staff(team_id));
create policy ask on join_request for insert to authenticated with check (person_id = me());
create policy cancel_own on join_request for update to authenticated using (person_id = me());

create policy own on push_token for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Under-18s: everyone sees first name + surname initial; the person sees their own full name.
create view person_public with (security_invoker = false) as
  select id, first_name,
         case when is_minor = 1 and id is distinct from me() then left(last_name, 1) else last_name end as last_name,
         nickname, gender, preferred_number, position, is_placeholder, claimed_by_id, photo_uri, is_minor,
         created_at, updated_at, deleted_at, server_updated_at
    from person;
revoke select on person from anon, authenticated;
grant select (id, first_name, nickname, gender, preferred_number, position, is_placeholder, claimed_by_id, photo_uri,
              is_minor, created_at, updated_at, deleted_at, server_updated_at, created_by) on person to anon, authenticated;
grant select on person_public to anon, authenticated;

-- Realtime for live games.
alter publication supabase_realtime add table game, point, game_event;
