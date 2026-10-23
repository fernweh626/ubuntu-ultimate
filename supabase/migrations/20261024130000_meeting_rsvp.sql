-- RSVPs for meetings on the calendar (AGM, SGM…). Anyone signed in can say if they're coming;
-- you see your own answer; coordinators see everyone's (names and counts).
create table meeting_rsvp (
  id text primary key,                 -- calendar_entry_id:person_id
  calendar_entry_id text not null,
  person_id text not null,
  status text not null check (status in ('going','late','not_going')),
  note text,
  created_at text not null,
  updated_at text not null,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);
create trigger touch before insert or update on meeting_rsvp for each row execute function touch_server_updated_at();
create trigger tombstone after delete on meeting_rsvp for each row execute function record_tombstone();
create index on meeting_rsvp (server_updated_at);
create index on meeting_rsvp (calendar_entry_id);
alter table meeting_rsvp enable row level security;
create policy read_rsvp on meeting_rsvp for select to authenticated using (person_id = me() or level_at_least('coordinator'));
create policy write_own on meeting_rsvp for all to authenticated using (person_id = me()) with check (person_id = me());
