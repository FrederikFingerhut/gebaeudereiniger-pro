-- Mitarbeiter verschieben eigene Einsätze; Fotos der Krankmeldung -------------------------
-- Bei Schlüsselobjekten ändern sich Tag und Uhrzeit oft kurzfristig. Mitarbeiter dürfen
-- ihre eigenen, noch nicht begonnenen Einsätze deshalb selbst verschieben (bis 14 Tage
-- im Voraus). Das Büro bekommt jedes Mal eine Nachricht.

create function reschedule_visit(p_visit uuid, p_date date, p_time time) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v visits;
  today date := berlin_today();
begin
  select * into v from visits where id = p_visit and company_id = current_company_id() for update;
  if v.id is null or v.employee_id is distinct from auth.uid() then
    raise exception 'einsatz_unbekannt';
  end if;
  if v.status <> 'geplant' or v.date < today then
    raise exception 'einsatz_abgeschlossen';
  end if;
  if p_date is null or p_time is null or p_date < today or p_date > today + 14 then
    raise exception 'neuer_tag_ungueltig';
  end if;
  if p_date = v.date and p_time = v.start_time then
    return;
  end if;
  if exists (select 1 from visit_swaps where visit_id = v.id and status in ('offen', 'angenommen')) then
    raise exception 'tausch_offen';
  end if;

  -- Am Schutz-Trigger vorbei (Mitarbeiter dürfen sonst nicht umplanen) und ohne
  -- Nachricht an sich selbst.
  perform set_config('app.system', 'on', true);
  begin
    update visits set
      date = p_date,
      start_time = p_time,
      -- Ursprünglichen Serientag merken, damit dort kein neuer Einsatz entsteht.
      moved_from = case when p_date <> v.date and v.series_id is not null then coalesce(v.moved_from, v.date) else v.moved_from end
    where id = v.id;
  exception when unique_violation then
    perform set_config('app.system', 'off', true);
    raise exception 'tag_belegt';
  end;
  perform set_config('app.system', 'off', true);

  select * into v from visits where id = p_visit;
  perform notify_office(v.company_id, 'visit_moved', visit_params(v) || jsonb_build_object(
    'name', (select full_name from profiles where id = auth.uid())), '/planung');
end $$;

revoke execute on function reschedule_visit(uuid, date, time) from public, anon;
grant execute on function reschedule_visit(uuid, date, time) to authenticated;

-- Krankmeldung mit Foto (z. B. AU-Bescheinigung) ------------------------------------------
-- Gesundheitsdaten: Ablage im Büro-Speicher "dokumente" unter
-- <company_id>/krank/<mitarbeiter_id>/<datei>. Sehen dürfen das nur der Mitarbeiter
-- selbst und das Büro (buero, chef), nicht Objektleiter.
alter table absences add column attachment_paths text[] not null default '{}';

drop policy "Mitarbeiter melden sich krank" on absences;
create policy "Mitarbeiter melden sich krank" on absences for insert
  with check (
    company_id = current_company_id() and employee_id = auth.uid() and approved is null and not is_customer()
    and cardinality(attachment_paths) <= 3
    and not exists (
      select 1 from unnest(attachment_paths) as p(path)
      where p.path not like company_id::text || '/krank/' || auth.uid()::text || '/%'
    )
  );

create policy "Mitarbeiter laden Krankmeldung hoch" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dokumente'
    and (storage.foldername(name))[1] = current_company_id()::text
    and (storage.foldername(name))[2] = 'krank'
    and (storage.foldername(name))[3] = auth.uid()::text
    and not is_customer()
  );

create policy "Mitarbeiter sehen eigene Krankmeldung" on storage.objects for select to authenticated
  using (
    bucket_id = 'dokumente'
    and (storage.foldername(name))[1] = current_company_id()::text
    and (storage.foldername(name))[2] = 'krank'
    and (storage.foldername(name))[3] = auth.uid()::text
  );
