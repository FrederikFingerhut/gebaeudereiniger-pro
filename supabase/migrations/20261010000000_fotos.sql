-- Fotos bei Meldungen ------------------------------------------------------------
-- Ablage im privaten Speicher "fotos" unter <company_id>/<mitarbeiter_id>/<datei>.jpg.
-- Der Pfad selbst trägt Firma und Verfasser, daran hängen die Zugriffsregeln.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Fotos hochladen" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1] = current_company_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "Fotos ansehen" on storage.objects for select to authenticated
  using (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1] = current_company_id()::text
    and (is_manager() or (storage.foldername(name))[2] = auth.uid()::text)
  );

create policy "Leitung löscht Fotos" on storage.objects for delete to authenticated
  using (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1] = current_company_id()::text
    and is_manager()
  );

-- Mitarbeiter hängen an ihre Meldung nur eigene Fotos der eigenen Firma.
drop policy "Mitarbeiter melden" on reports;
create policy "Mitarbeiter melden" on reports for insert
  with check (
    company_id = current_company_id()
    and author_id = auth.uid()
    and not exists (
      select 1 from unnest(photo_paths) as p(path)
      where p.path not like company_id::text || '/' || auth.uid()::text || '/%'
    )
  );
