-- Scheduled practices: notes, cancellation and weekly series on session, plus who's coming.

alter table session add column notes text;
alter table session add column cancelled_at text;
alter table session add column series_id text;

create table practice_rsvp (
  id text primary key,              -- session_id:person_id, so two phones answering agree
  session_id text not null,
  person_id text not null,
  status text not null check (status in ('going','not_going')),
  reason text,
  created_at text not null,
  updated_at text not null,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now(),
  unique (session_id, person_id)
);

create trigger touch before insert or update on practice_rsvp for each row execute function touch_server_updated_at();
create trigger tombstone after delete on practice_rsvp for each row execute function record_tombstone();
create index on practice_rsvp (server_updated_at);
create index on practice_rsvp (session_id);

create function session_team(p_session text) returns text language sql stable security definer set search_path = public as $$
  select team_id from session where id = p_session
$$;

alter table practice_rsvp enable row level security;

-- The squad sees who's coming; nobody outside the team does.
create policy read_team on practice_rsvp for select to authenticated using (
  person_id = me() or on_team(session_team(session_id)) or is_staff(session_team(session_id))
);
-- You answer for yourself; staff can answer for a player (e.g. someone told them on WhatsApp).
create policy write_own_or_staff on practice_rsvp for insert to authenticated with check (
  (person_id = me() and on_team(session_team(session_id))) or is_staff(session_team(session_id))
);
create policy update_own_or_staff on practice_rsvp for update to authenticated using (
  person_id = me() or is_staff(session_team(session_id))
);
create policy delete_own_or_staff on practice_rsvp for delete to authenticated using (
  person_id = me() or is_staff(session_team(session_id))
);

