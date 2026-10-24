-- Players who already have a member number (e.g. CT123 from years of CTFDA forms) claim it, as long
-- as nobody else has. Admins can correct mistakes in the register.
create function claim_member_number(assoc text, prefix text, num text) returns text language plpgsql security definer set search_path = public as $$
declare
  pid text := me();
  clean text := upper(replace(coalesce(num, ''), ' ', ''));
  mine text;
  owner text;
begin
  if pid is null then raise exception 'Sign in and link your player first'; end if;
  if clean !~ ('^' || upper(prefix) || '\d+$') then raise exception 'Member numbers look like %123', upper(prefix); end if;
  select number into mine from association_number where association = assoc and person_id = pid;
  if mine is not null then return mine; end if;
  select person_id into owner from association_number where association = assoc and number = clean;
  if owner is not null then raise exception 'That number belongs to someone else. Ask the association to check it.'; end if;
  insert into association_number (association, number, person_id) values (assoc, clean, pid);
  return clean;
end $$;
grant execute on function claim_member_number(text, text, text) to authenticated;
