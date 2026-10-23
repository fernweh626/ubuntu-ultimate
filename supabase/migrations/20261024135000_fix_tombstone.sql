-- Fix: record_tombstone() referenced old.point_id / old.line_id / old.person_id directly, which
-- PL/pgSQL can't resolve on tables without those columns, so deletes failed on most tables.
-- Read every key through to_jsonb(old) instead.
create or replace function record_tombstone() returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(old);
  key jsonb;
begin
  key := case tg_table_name
    when 'point_player' then jsonb_build_object('point_id', r ->> 'point_id', 'person_id', r ->> 'person_id')
    when 'saved_line_member' then jsonb_build_object('line_id', r ->> 'line_id', 'person_id', r ->> 'person_id')
    when 'person_private' then jsonb_build_object('person_id', r ->> 'person_id')
    else jsonb_build_object('id', r ->> 'id')
  end;
  insert into deleted_row (tbl, pk) values (tg_table_name, key);
  return old;
end $$;
