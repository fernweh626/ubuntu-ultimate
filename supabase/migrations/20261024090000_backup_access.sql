-- Nightly backups (see the ubuntu-ultimate-backups repo) log in as a read-only role, backup_reader,
-- created by hand on the server so its password never appears in git. It can read every table in
-- public (it bypasses row-level security, as a backup must) and can't write anything.
-- Supabase doesn't let other roles read auth.users directly, so this one function hands the backup
-- the sign-in accounts. It lives in its own schema, which the app's API doesn't expose, and only
-- backup_reader may call it.

create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;

create or replace function backup.auth_users()
returns table (id uuid, email text, encrypted_password text, email_confirmed_at timestamptz, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = auth, pg_temp as $$
  select id, email::text, encrypted_password::text, email_confirmed_at, raw_user_meta_data, created_at, updated_at from auth.users
$$;
revoke all on function backup.auth_users() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'backup_reader') then
    grant usage on schema backup to backup_reader;
    grant execute on function backup.auth_users() to backup_reader;
  end if;
end $$;
