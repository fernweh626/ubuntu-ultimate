-- "I'm going" for a pickup on a given day, so it shows in the player's schedule and others see a head count.
-- Signed-in players can see who's going (pickups are open to everyone); you only write your own.
create table pickup_rsvp (
  id text primary key,                 -- pickup_id:on_date:person_id
  pickup_id text not null,
  on_date text not null,
  person_id text not null,
  status text not null check (status in ('going','late','not_going')),
  note text check (char_length(note) <= 500),
  created_at text not null,
  updated_at text not null,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);
create trigger touch before insert or update on pickup_rsvp for each row execute function touch_server_updated_at();
create trigger tombstone after delete on pickup_rsvp for each row execute function record_tombstone();
create index on pickup_rsvp (server_updated_at);
create index on pickup_rsvp (pickup_id, on_date);
alter table pickup_rsvp enable row level security;
create policy read_signed_in on pickup_rsvp for select to authenticated using (true);
create policy write_own on pickup_rsvp for all to authenticated using (person_id = me()) with check (person_id = me());
