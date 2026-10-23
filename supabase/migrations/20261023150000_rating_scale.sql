-- Self-ratings are 1–5 (was 1–10 before any data existed).
alter table self_rating drop constraint if exists self_rating_experience_check, drop constraint if exists self_rating_throwing_check,
  drop constraint if exists self_rating_receiving_check, drop constraint if exists self_rating_defence_check, drop constraint if exists self_rating_athleticism_check;
alter table self_rating add constraint self_rating_scale check (
  experience between 1 and 5 and throwing between 1 and 5 and receiving between 1 and 5 and defence between 1 and 5 and athleticism between 1 and 5
);
-- Admins can delete reports (spam, test entries).
create policy admin_delete on feedback for delete to authenticated using (level_at_least('admin'));
