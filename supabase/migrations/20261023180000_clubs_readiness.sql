-- Association numbers & good standing, form links, clubs with several teams, and "I'll be late".

create table registration (
  id text primary key,                 -- = person_id
  person_id text not null unique,
  safda_number text,
  region_code text,
  region_number text,
  phone text,
  created_at text not null,
  updated_at text not null,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);

create table association_standing (
  id text primary key,                 -- association:number
  association text not null,
  number text not null,
  status text not null check (status in ('good','unpaid','lapsed')),
  paid_until text,
  uploaded_at text not null,
  updated_at text not null,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);
create index on association_standing (association, number);

create table org_link (
  id text primary key,
  region_code text,
  label text not null,
  url text not null,
  sort integer not null default 0,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);

create table club (
  id text primary key,
  name text not null,
  short_name text,
  region text,
  city text,
  primary_color text,
  logo_uri text,
  contact_phone text,
  contact_email text,
  website text,
  social text,
  about text,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);

create table club_staff (
  id text primary key,
  club_id text not null,
  person_id text not null,
  role text not null default 'admin' check (role in ('admin','coach','manager')),
  created_at text not null,
  updated_at text not null,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now(),
  unique (club_id, person_id)
);

alter table team add column club_id text;
alter table team add column division text;

do $$
declare t text;
begin
  foreach t in array array['registration','association_standing','org_link','club','club_staff'] loop
    execute format('create trigger touch before insert or update on %I for each row execute function touch_server_updated_at()', t);
    execute format('create trigger tombstone after delete on %I for each row execute function record_tombstone()', t);
    execute format('create index on %I (server_updated_at)', t);
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Any staff role anywhere (or coordinator+): may see good-standing lists.
create function is_any_staff() returns boolean language sql stable security definer set search_path = public as $$
  select level_at_least('coordinator') or exists (
    select 1 from membership where person_id = me() and role <> 'player' and end_date is null and deleted_at is null
  ) or exists (select 1 from club_staff where person_id = me())
$$;

create function is_club_admin(p_club text) returns boolean language sql stable security definer set search_path = public as $$
  select level_at_least('coordinator') or exists (select 1 from club_staff where club_id = p_club and person_id = me())
$$;

-- Club staff count as staff on every team in their club.
create or replace function is_staff(p_team text) returns boolean language sql stable security definer set search_path = public as $$
  select level_at_least('coordinator') or exists (
    select 1 from membership
     where person_id = me() and team_id = p_team and role <> 'player'
       and end_date is null and deleted_at is null
  ) or exists (
    select 1 from club_staff cs join team t on t.club_id = cs.club_id where t.id = p_team and cs.person_id = me()
  )
$$;

-- Registration: you, your staff and coordinators (staff follow up on WhatsApp). You keep it current.
create policy read_reg on registration for select to authenticated using (person_id = me() or staff_of_person(person_id));
create policy write_reg on registration for all to authenticated
  using (person_id = me() or level_at_least('coordinator')) with check (person_id = me() or level_at_least('coordinator'));

-- Standing lists: staff see them; you see your own row; coordinators/admins upload.
create policy read_standing on association_standing for select to authenticated using (
  is_any_staff() or exists (
    select 1 from registration r where r.person_id = me()
      and ((association_standing.association = 'safda' and r.safda_number = association_standing.number)
        or (association_standing.association = r.region_code and r.region_number = association_standing.number))
  )
);
create policy write_standing on association_standing for all to authenticated
  using (level_at_least('coordinator')) with check (level_at_least('coordinator'));

create policy read_links on org_link for select using (true);
create policy write_links on org_link for all to authenticated using (level_at_least('coordinator')) with check (level_at_least('coordinator'));

create policy read_all on club for select using (true);
create policy insert_signed_in on club for insert to authenticated with check (true);
create policy update_club on club for update to authenticated using (is_club_admin(id) or created_by = auth.uid());
create policy read_all on club_staff for select using (true);
-- The person who creates a club becomes its first admin; after that, club admins manage club staff.
create policy write_club_staff on club_staff for insert to authenticated with check (
  is_club_admin(club_id) or exists (select 1 from club c where c.id = club_id and c.created_by = auth.uid())
);
create policy update_club_staff on club_staff for update to authenticated using (is_club_admin(club_id));
create policy delete_club_staff on club_staff for delete to authenticated using (is_club_admin(club_id));

-- "I'll be late"
alter table practice_rsvp drop constraint if exists practice_rsvp_status_check;
alter table practice_rsvp add constraint practice_rsvp_status_check check (status in ('going','late','not_going'));
alter table game_availability drop constraint if exists game_availability_status_check;
alter table game_availability add constraint game_availability_status_check check (status in ('available','late','unavailable'));
