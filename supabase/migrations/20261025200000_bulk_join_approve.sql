-- Team staff approve or decline several join requests at once, optionally labelling them
-- (core / guest / mercenary) instead of what the player asked for.
create or replace function decide_join_requests(reqs text[], approve boolean, as_kind text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r join_request;
  n integer := 0;
  ts text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if as_kind is not null and as_kind not in ('core','guest','mercenary') then raise exception 'Unknown label'; end if;
  for r in select * from join_request where id = any(reqs) and status = 'pending' loop
    if not is_staff(r.team_id) then raise exception 'Only this team''s staff can decide'; end if;
    update join_request set status = case when approve then 'approved' else 'declined' end,
           kind = coalesce(as_kind, kind), decided_by = me(), updated_at = ts
     where id = r.id;
    if approve and not exists (
      select 1 from membership where person_id = r.person_id and team_id = r.team_id and end_date is null and deleted_at is null
    ) then
      insert into membership (id, person_id, team_id, kind, role, start_date, created_at, updated_at)
      values (gen_random_uuid()::text, r.person_id, r.team_id, coalesce(as_kind, r.kind), 'player', to_char(now(), 'YYYY-MM-DD'), ts, ts);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function decide_join_requests(text[], boolean, text) from public, anon;
grant execute on function decide_join_requests(text[], boolean, text) to authenticated;
