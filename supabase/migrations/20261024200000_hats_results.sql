-- Hat tournaments and lighter game results.

alter table event add column is_hat integer not null default 0;
alter table event add column cost text;
alter table event add column payment_url text;
alter table event add column details text;
alter table event add column start_time text;
alter table event add column venue_id text;
alter table event add column hat_status text;
alter table event add column team_count integer;

-- result_mode null = tracked point by point; 'score' = final score only; 'winner' = who won; 'none' = just played.
alter table game add column result_mode text check (result_mode in ('score','winner','none'));
alter table game add column final_a integer;
alter table game add column final_b integer;
alter table game add column winner_team_id text;

create table hat_signup (
  id text primary key,                 -- event_id:person_id
  event_id text not null,
  person_id text not null,
  attending text not null default 'yes' check (attending in ('yes','maybe','no')),
  wants_captain integer not null default 0,
  skill integer check (skill between 1 and 5),
  paid integer not null default 0,
  paid_confirmed integer not null default 0,
  on_the_day integer not null default 0,
  note text,
  created_at text not null,
  updated_at text not null,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);
create trigger touch before insert or update on hat_signup for each row execute function touch_server_updated_at();
create trigger tombstone after delete on hat_signup for each row execute function record_tombstone();
create index on hat_signup (server_updated_at);
create index on hat_signup (event_id);
alter table hat_signup enable row level security;
-- You see and change your own sign-up; coordinators see everyone's (to draw teams, confirm payment,
-- add on-the-day players). Teams themselves are public once drawn (team + membership).
create policy read_signup on hat_signup for select to authenticated using (person_id = me() or level_at_least('coordinator'));
create policy write_signup on hat_signup for all to authenticated
  using (person_id = me() or level_at_least('coordinator')) with check (person_id = me() or level_at_least('coordinator'));
-- Players can't mark their own payment as confirmed.
create function hat_signup_guard() returns trigger language plpgsql as $$
begin
  if not level_at_least('coordinator') then
    new.paid_confirmed := coalesce(case when tg_op = 'UPDATE' then old.paid_confirmed end, 0);
  end if;
  return new;
end $$;
create trigger guard before insert or update on hat_signup for each row execute function hat_signup_guard();
