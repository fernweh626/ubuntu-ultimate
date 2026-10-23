-- Meetings on the calendar (AGM, SGM… with times and a Zoom/Meet link) and coordinator announcements.

alter table calendar_entry add column start_time text;
alter table calendar_entry add column end_time text;
alter table calendar_entry add column meeting_url text;

create table announcement (
  id text primary key,
  region_code text,
  title text not null check (char_length(title) between 1 and 200),
  body text check (char_length(body) <= 5000),
  link_url text,
  link_label text,
  pinned integer not null default 0,
  published_at text not null,
  created_by_id text,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);
create trigger touch before insert or update on announcement for each row execute function touch_server_updated_at();
create trigger tombstone after delete on announcement for each row execute function record_tombstone();
create index on announcement (server_updated_at);
alter table announcement enable row level security;
create policy read_all on announcement for select using (true);
create policy write_coordinator on announcement for all to authenticated
  using (level_at_least('coordinator')) with check (level_at_least('coordinator'));
-- (backup_reader picks up new tables through its default privileges.)
