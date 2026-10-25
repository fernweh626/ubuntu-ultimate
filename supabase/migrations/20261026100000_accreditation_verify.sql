-- Accreditation certificates: a PDF in private storage, checked by team staff (or a coordinator)
-- before CTFDA, regional and SAFDA events. Players can't mark their own as verified, and changing
-- the level, expiry or file sends it back to "not checked".

alter table accreditation
  add column file_path text check (char_length(file_path) <= 300),
  add column status text not null default 'unverified' check (status in ('unverified','verified','rejected')),
  add column checked_by text,
  add column checked_at text,
  add column check_note text check (char_length(check_note) <= 500);

create or replace function guard_accreditation_check() returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.verifying', true), '') = '1' then return new; end if;
  if tg_op = 'UPDATE' and (new.level, new.expires_on, new.file_path) is not distinct from (old.level, old.expires_on, old.file_path) then
    new.status := old.status; new.checked_by := old.checked_by; new.checked_at := old.checked_at; new.check_note := old.check_note;
  else
    new.status := 'unverified'; new.checked_by := null; new.checked_at := null; new.check_note := null;
  end if;
  return new;
end $$;
create trigger accreditation_check_guard before insert or update on accreditation for each row execute function guard_accreditation_check();

-- Staff of one of the player's teams, or a coordinator: "type and expiry are right" or "something's wrong".
create or replace function verify_accreditation(p_person text, ok boolean, note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not staff_of_person(p_person) then raise exception 'Only the player''s team staff or a coordinator can check this'; end if;
  if p_person = me() and not level_at_least('coordinator') then raise exception 'Someone else has to check your own accreditation'; end if;
  perform set_config('app.verifying', '1', true);
  update accreditation set status = case when ok then 'verified' else 'rejected' end, checked_by = me(),
         checked_at = to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), check_note = nullif(trim(note), ''),
         updated_at = to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), server_updated_at = now()
   where person_id = p_person;
  if not found then raise exception 'No accreditation saved for this player'; end if;
end $$;
revoke all on function verify_accreditation(text, boolean, text) from public, anon;
grant execute on function verify_accreditation(text, boolean, text) to authenticated;

-- Certificates: PDF only, 5 MB, in a folder per player. The player uploads; they and whoever can
-- check it (staff_of_person) can read it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('accreditation', 'accreditation', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;
create policy accreditation_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'accreditation' and (storage.foldername(name))[1] = public.me());
create policy accreditation_read on storage.objects for select to authenticated
  using (bucket_id = 'accreditation' and ((storage.foldername(name))[1] = public.me() or public.staff_of_person((storage.foldername(name))[1])));
create policy accreditation_delete on storage.objects for delete to authenticated
  using (bucket_id = 'accreditation' and (storage.foldername(name))[1] = public.me());
