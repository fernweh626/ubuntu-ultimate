-- Pickups: anyone signed in can add one; only whoever added it, up to 10 people they pick, and admins
-- can change it. editor_ids is a JSON array of person ids.
alter table pickup_spot add column created_by_person text;
alter table pickup_spot add column editor_ids text
  check (editor_ids is null or (json_typeof(editor_ids::json) = 'array' and json_array_length(editor_ids::json) <= 10));

drop policy insert_signed_in on pickup_spot;
create policy insert_signed_in on pickup_spot for insert to authenticated
  with check (created_by_person is null or created_by_person = me());

drop policy update_owner on pickup_spot;
create policy update_owner on pickup_spot for update to authenticated using (
  created_by = auth.uid()
  or (created_by_person is not null and created_by_person = me())
  or (editor_ids is not null and editor_ids::jsonb ? me())
  or level_at_least('admin')
);

-- Editors can change the pickup, but only its creator (or an admin) can change who the editors are.
create function pickup_editors_guard() returns trigger language plpgsql as $$
begin
  if new.created_by_person is distinct from old.created_by_person and not level_at_least('admin') then
    raise exception 'Only an admin can change who added a pickup';
  end if;
  if new.editor_ids is distinct from old.editor_ids
     and not (level_at_least('admin') or old.created_by = auth.uid() or (old.created_by_person is not null and old.created_by_person = me())) then
    raise exception 'Only whoever added this pickup can choose its editors';
  end if;
  return new;
end $$;
create trigger editors_guard before update on pickup_spot for each row execute function pickup_editors_guard();
