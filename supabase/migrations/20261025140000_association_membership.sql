-- Association membership (CTFDA first): yearly sign-up, member numbers, payment status, demographics,
-- and a pre-loaded list of past members that only admins can read.
-- POPIA: population group is special personal information. Only the person and admins can read it,
-- and the app shows admins totals, not individuals.

-- One row per person, association and season (id = association:season:person_id).
create table association_membership (
  id text primary key,
  person_id text not null,
  association text not null,
  season integer not null,
  number text,
  involvement text,
  option text,
  fee_cents integer not null default 0 check (fee_cents >= 0),
  status text not null default 'social' check (status in ('social','unpaid','claimed','paid','waived')),
  pay_reference text check (char_length(pay_reference) <= 80),
  consents_json text check (char_length(consents_json) <= 2000),
  note text check (char_length(note) <= 2000),
  submitted_at text,
  paid_at text,
  created_at text not null,
  updated_at text not null,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);
create trigger touch before insert or update on association_membership for each row execute function touch_server_updated_at();
create trigger tombstone after delete on association_membership for each row execute function record_tombstone();
create index on association_membership (server_updated_at);
create index on association_membership (association, season);
alter table association_membership enable row level security;
create policy read_own_or_admin on association_membership for select to authenticated using (person_id = me() or level_at_least('admin'));
create policy write_own_or_admin on association_membership for all to authenticated
  using (person_id = me() or level_at_least('admin')) with check (person_id = me() or level_at_least('admin'));

-- Member numbers belong to one person per association, for life (CT123 stays yours).
create table association_number (
  association text not null,
  number text not null,
  person_id text not null,
  created_at timestamptz not null default now(),
  primary key (association, number),
  unique (association, person_id)
);
alter table association_number enable row level security;
create policy read_own_or_admin on association_number for select to authenticated using (person_id = me() or level_at_least('admin'));
-- Written only by issue_member_number() and admins.
create policy admin_write on association_number for all to authenticated using (level_at_least('admin')) with check (level_at_least('admin'));

-- Players can't mark themselves paid, or use someone else's number.
create function association_membership_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if level_at_least('admin') then return new; end if;
  if new.status in ('paid', 'waived') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    raise exception 'Only an admin can confirm a payment';
  end if;
  if new.paid_at is distinct from (case when tg_op = 'INSERT' then null else old.paid_at end) then
    raise exception 'Only an admin can confirm a payment';
  end if;
  if new.number is not null and not exists (
    select 1 from association_number n where n.association = new.association and n.number = upper(new.number) and n.person_id = new.person_id
  ) then
    raise exception 'That member number isn''t yours';
  end if;
  return new;
end $$;
create trigger guard before insert or update on association_membership for each row execute function association_membership_guard();

-- Demographics, one row per person (id = person_id).
create table person_demographic (
  id text primary key,
  person_id text not null unique,
  population_group text check (char_length(population_group) <= 60),
  origin text check (origin in ('local','transplant')),
  birth_year integer check (birth_year between 1900 and 2100),
  suburb text check (char_length(suburb) <= 120),
  consent_at text,
  created_at text not null,
  updated_at text not null,
  created_by uuid default auth.uid(),
  server_updated_at timestamptz not null default now()
);
create trigger touch before insert or update on person_demographic for each row execute function touch_server_updated_at();
create trigger tombstone after delete on person_demographic for each row execute function record_tombstone();
create index on person_demographic (server_updated_at);
alter table person_demographic enable row level security;
create policy read_own_or_admin on person_demographic for select to authenticated using (person_id = me() or level_at_least('admin'));
create policy write_own on person_demographic for all to authenticated using (person_id = me()) with check (person_id = me());

-- Past and current membership forms uploaded by admins (Google Form exports). Never synced to phones.
create table association_roster (
  id text primary key,                 -- association:number, or association:email when no number
  association text not null,
  number text,
  first_name text,
  last_name text,
  email text,
  phone text,
  emergency text,
  suburb text,
  gender text,
  population_group text,
  origin text,
  birth_year integer,
  involvement text,
  season integer,
  uploaded_at timestamptz not null default now()
);
create index on association_roster (association, lower(email));
alter table association_roster enable row level security;
create policy admin_all on association_roster for all to authenticated using (level_at_least('admin')) with check (level_at_least('admin'));

create table association_counter (
  association text primary key,
  next_number integer not null default 1
);
alter table association_counter enable row level security;
create policy admin_all on association_counter for all to authenticated using (level_at_least('admin')) with check (level_at_least('admin'));

-- The signed-in player's own row in the pre-loaded list, matched on their sign-in email. Nothing else.
create function my_roster_row(assoc text) returns association_roster language sql stable security definer set search_path = public as $$
  select r.* from association_roster r
   where r.association = assoc and r.email is not null
     and lower(r.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
   order by r.season desc nulls last, r.uploaded_at desc
   limit 1
$$;

-- The caller's member number: the one they already have, the one on the pre-loaded list for their
-- email, or the next free one (prefix + number, e.g. CT124).
create function issue_member_number(assoc text, prefix text) returns text language plpgsql security definer set search_path = public as $$
declare
  pid text := me();
  existing text;
  n integer;
  biggest integer;
begin
  if pid is null then raise exception 'Sign in and link your player first'; end if;
  select number into existing from association_number where association = assoc and person_id = pid;
  if existing is not null then return existing; end if;

  select upper(replace(number, ' ', '')) into existing from my_roster_row(assoc) where number ~* ('^' || prefix || '\s*\d+$');
  if existing is not null and not exists (select 1 from association_number where association = assoc and number = existing) then
    insert into association_number (association, number, person_id) values (assoc, existing, pid);
    return existing;
  end if;

  select coalesce(max(substring(number from '\d+$')::integer), 0) into biggest
    from (select number from association_number where association = assoc
          union all select number from association_roster where association = assoc and number ~* ('^' || prefix || '\s*\d+$')) x;
  insert into association_counter (association, next_number) values (assoc, biggest + 1)
    on conflict (association) do update set next_number = greatest(association_counter.next_number, biggest + 1)
    returning next_number into n;
  update association_counter set next_number = n + 1 where association = assoc;
  insert into association_number (association, number, person_id) values (assoc, upper(prefix) || n, pid);
  return upper(prefix) || n;
end $$;

grant execute on function my_roster_row(text) to authenticated;
grant execute on function issue_member_number(text, text) to authenticated;
