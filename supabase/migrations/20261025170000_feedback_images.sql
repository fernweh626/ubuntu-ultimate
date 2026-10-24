-- Screenshots on bug reports and ideas: up to 3 per report, in a private bucket only admins can view.
alter table feedback add column images text check (char_length(images) <= 1000);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Anyone (signed in or not, like the report itself) can add images; only admins can see them.
create policy feedback_images_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'feedback');
create policy feedback_images_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'feedback' and public.level_at_least('admin'));
create policy feedback_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'feedback' and public.level_at_least('admin'));
