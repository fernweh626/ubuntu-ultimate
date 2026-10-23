-- Accreditation, self-ratings, fitness benchmarks, game availability, practice attendance, feedback.

-- Staff of any team this person is currently on (or a coordinator) may see their development data.
create function staff_of_person(p_person text) returns boolean language sql stable security definer set search_path = public as $$
  select level_at_least('coordinator') or exists (
    select 1 from membership m
     where m.person_id = p_person and m.end_date is null and m.deleted_at is null and is_staff(m.team_id)
  )
$$;

create table accreditation (
  id text primary key,                 -- = person_id
  person_id text not null unique,
  level text not null check (level in ('standard','advanced')),
  expires_on text,
  created_at text not null,
  updated_at text not null,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);

create table self_rating (
  id text primary key,
  person_id text not null,
  rated_on text not null,
  experience integer not null check (experience between 1 and 10),
  throwing integer not null check (throwing between 1 and 10),
  receiving integer not null check (receiving between 1 and 10),
  defence integer not null check (defence between 1 and 10),
  athleticism integer not null check (athleticism between 1 and 10),
  notes text,
  created_at text not null,
  updated_at text not null,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);

create table fitness_test (
  id text primary key,
  person_id text not null,
  kind text not null check (kind in ('beep','agility_5105','sprint_40','sprint_60')),
  value real not null,
  tested_on text not null,
  notes text,
  recorded_by_id text,
  created_at text not null,
  updated_at text not null,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);

create table game_availability (
  id text primary key,                 -- game_id:person_id
  game_id text not null,
  person_id text not null,
  team_id text not null,
  status text not null check (status in ('available','unavailable')),
  reason text,
  created_at text not null,
  updated_at text not null,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);

create table practice_attendance (
  id text primary key,                 -- session_id:person_id
  session_id text not null,
  person_id text not null,
  attended integer not null,
  created_at text not null,
  updated_at text not null,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['accreditation','self_rating','fitness_test','game_availability','practice_attendance'] loop
    execute format('create trigger touch before insert or update on %I for each row execute function touch_server_updated_at()', t);
    execute format('create trigger tombstone after delete on %I for each row execute function record_tombstone()', t);
    execute format('create index on %I (server_updated_at)', t);
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Accreditation: you, your team staff and coordinators (they check eligibility). You keep it up to date.
create policy read_acc on accreditation for select to authenticated using (person_id = me() or staff_of_person(person_id));
create policy write_acc on accreditation for all to authenticated
  using (person_id = me() or level_at_least('coordinator')) with check (person_id = me() or level_at_least('coordinator'));

-- Self-ratings: you and your staff read; only you write.
create policy read_rating on self_rating for select to authenticated using (person_id = me() or staff_of_person(person_id));
create policy write_rating on self_rating for all to authenticated using (person_id = me()) with check (person_id = me());

-- Fitness tests: you and your staff; staff can record results on testing day.
create policy read_fit on fitness_test for select to authenticated using (person_id = me() or staff_of_person(person_id));
create policy write_fit on fitness_test for all to authenticated
  using (person_id = me() or staff_of_person(person_id)) with check (person_id = me() or staff_of_person(person_id));

-- Game availability: the squad sees it; you answer for yourself, staff can answer for you.
create policy read_avail on game_availability for select to authenticated using (on_team(team_id) or is_staff(team_id));
create policy write_avail on game_availability for all to authenticated
  using (person_id = me() or is_staff(team_id)) with check ((person_id = me() and on_team(team_id)) or is_staff(team_id));

-- Practice register: the squad can see it; staff take it.
create policy read_att on practice_attendance for select to authenticated using (
  person_id = me() or on_team(session_team(session_id)) or is_staff(session_team(session_id))
);
create policy write_att on practice_attendance for all to authenticated
  using (is_staff(session_team(session_id))) with check (is_staff(session_team(session_id)));

-- Feedback: anyone using the app can send (no sign-in needed); only admins read and triage it.
create table feedback (
  id text primary key,
  kind text not null check (kind in ('bug','feature','enhancement','other')),
  title text not null check (char_length(title) between 1 and 200),
  body text check (char_length(body) <= 5000),
  screen text check (char_length(screen) <= 200),
  app_version text check (char_length(app_version) <= 50),
  device text check (char_length(device) <= 200),
  contact_ok integer not null default 0,
  person_id text,
  created_at text not null,
  status text not null default 'new' check (status in ('new','planned','in_progress','done','wont_do')),
  admin_note text,
  user_id uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);
create trigger touch before insert or update on feedback for each row execute function touch_server_updated_at();
alter table feedback enable row level security;
create policy send_feedback on feedback for insert to anon, authenticated with check (status = 'new' and admin_note is null);
create policy admin_read on feedback for select to authenticated using (level_at_least('admin'));
create policy admin_update on feedback for update to authenticated using (level_at_least('admin'));
