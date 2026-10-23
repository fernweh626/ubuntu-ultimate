-- POPIA: paid-up member lists and the registration/payment links are admin-only to change.
-- (Team staff can still read a player's standing, which the "ready to play" check needs.)
drop policy write_standing on association_standing;
create policy write_standing on association_standing for all to authenticated
  using (level_at_least('admin')) with check (level_at_least('admin'));
drop policy write_links on org_link;
create policy write_links on org_link for all to authenticated
  using (level_at_least('admin')) with check (level_at_least('admin'));
