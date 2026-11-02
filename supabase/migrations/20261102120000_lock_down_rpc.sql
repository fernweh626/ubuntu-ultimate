-- Defence in depth for the API. Postgres lets everyone (including signed-out visitors) call new
-- functions by default. These functions already refuse a caller with no player, but there is no
-- reason to offer them to signed-out visitors at all.

-- A signed-out visitor has no email, so they must never match a roster row.
create or replace function my_roster_row(assoc text) returns association_roster language sql stable security definer set search_path = public as $$
  select r.* from association_roster r
   where r.association = assoc and r.email is not null
     and nullif(auth.jwt() ->> 'email', '') is not null
     and lower(r.email) = lower(auth.jwt() ->> 'email')
   order by r.season desc nulls last, r.uploaded_at desc
   limit 1
$$;

revoke execute on function
  my_roster_row(text),
  issue_member_number(text, text),
  claim_member_number(text, text, text),
  claim_first_admin(),
  grant_level(text, text, boolean),
  decide_join_request(text, boolean)
from public, anon;

grant execute on function
  my_roster_row(text),
  issue_member_number(text, text),
  claim_member_number(text, text, text),
  claim_first_admin(),
  grant_level(text, text, boolean),
  decide_join_request(text, boolean)
to authenticated;
