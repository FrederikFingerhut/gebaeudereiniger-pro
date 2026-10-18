"use server";

import { refresh } from "next/cache";
import { berlinDate } from "@gp/shared";
import { requireMe } from "@/lib/supabase";
import type { FormState } from "@/components/action-form";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: string) => /^\d{2}:\d{2}/.test(v);

/** Wiederkehrenden Einsatz anlegen (seriesId = null) oder ändern. */
export async function saveSeries(seriesId: string | null, _: FormState, data: FormData): Promise<FormState> {
  const { supabase, profile } = await requireMe();
  const weekdays = data.getAll("weekday").map(Number).filter((n) => n >= 1 && n <= 7);
  const siteId = text(data, "site_id");
  const employeeId = text(data, "employee_id");
  const startTime = text(data, "start_time");
  const intervalWeeks = Math.min(4, Math.max(1, Number(text(data, "interval_weeks")) || 1));
  const validFrom = text(data, "valid_from") || berlinDate();
  if (!siteId || !employeeId || !isTime(startTime) || weekdays.length === 0) return { error: "Bitte Objekt, Mitarbeiter, Uhrzeit und mindestens einen Wochentag wählen." };
  if (!isDate(validFrom)) return { error: "Ungültiges Startdatum." };

  const { data: site } = await supabase.from("sites").select("planned_minutes").eq("id", siteId).single();
  const values = {
    site_id: siteId,
    employee_id: employeeId,
    weekdays,
    interval_weeks: intervalWeeks,
    start_time: startTime,
    planned_minutes: Number(text(data, "planned_minutes")) || site?.planned_minutes || 60,
    valid_from: validFrom,
  };

  if (!seriesId) {
    const { error } = await supabase.from("visit_series").insert({ company_id: profile.company_id, ...values });
    if (error) return { error: "Konnte nicht gespeichert werden." };
    refresh();
    return { ok: "Gespeichert. Die Einsätze erscheinen im Plan." };
  }

  const { error } = await supabase.from("visit_series").update(values).eq("id", seriesId);
  if (error) return { error: "Konnte nicht gespeichert werden." };
  // Künftige, noch nicht angefangene Einsätze neu aus der geänderten Serie erzeugen.
  // Von Hand verschobene Einsätze bleiben, wie sie sind.
  await supabase.from("visits").delete().eq("series_id", seriesId).gte("date", berlinDate()).eq("status", "geplant").is("moved_from", null);
  refresh();
  return { ok: "Geändert. Ab heute gilt der neue Plan." };
}

/** Einzelnen Auftrag einplanen, der sich nicht wiederholt. */
export async function createVisit(_: FormState, data: FormData): Promise<FormState> {
  const { supabase, profile } = await requireMe();
  const siteId = text(data, "site_id");
  const employeeId = text(data, "employee_id");
  const date = text(data, "date");
  const startTime = text(data, "start_time");
  if (!siteId || !isDate(date) || !isTime(startTime)) return { error: "Bitte Objekt, Tag und Uhrzeit wählen." };
  if (date < berlinDate()) return { error: "Der Tag liegt in der Vergangenheit." };

  const { data: site } = await supabase.from("sites").select("planned_minutes").eq("id", siteId).single();
  const { error } = await supabase.from("visits").insert({
    company_id: profile.company_id,
    site_id: siteId,
    employee_id: employeeId || null,
    date,
    start_time: startTime,
    planned_minutes: Number(text(data, "planned_minutes")) || site?.planned_minutes || 60,
    note: text(data, "note") || null,
  });
  if (error) return { error: "Konnte nicht gespeichert werden." };
  refresh();
  return { ok: "Eingeplant." };
}

/** Serie beenden: ab heute keine neuen Einsätze, offene künftige Einsätze werden gelöscht. */
export async function endSeries(seriesId: string) {
  const { supabase } = await requireMe();
  const today = berlinDate();
  await supabase.from("visit_series").update({ valid_until: today }).eq("id", seriesId);
  await supabase.from("visits").delete().eq("series_id", seriesId).gt("date", today).eq("status", "geplant");
  refresh();
}

/** Einzelnen Einsatz ändern: Mitarbeiter (oder „fällt aus“), Tag, Uhrzeit, Minuten, Hinweis. */
export async function editVisit(visitId: string, _: FormState, data: FormData): Promise<FormState> {
  const { supabase } = await requireMe();
  const employeeId = text(data, "employee_id");
  if (employeeId === "ausfall") {
    const { error } = await supabase.from("visits").update({ status: "ausgefallen" }).eq("id", visitId);
    if (error) return { error: "Konnte nicht geändert werden." };
    refresh();
    return { ok: "Fällt aus." };
  }

  const date = text(data, "date");
  const startTime = text(data, "start_time");
  if (!isDate(date) || !isTime(startTime)) return { error: "Bitte Tag und Uhrzeit angeben." };
  const { data: visit } = await supabase.from("visits").select("date, status, series_id, moved_from").eq("id", visitId).maybeSingle();
  if (!visit) return { error: "Einsatz nicht gefunden." };
  if (visit.status !== "geplant") return { error: "Nur geplante Einsätze lassen sich ändern." };

  const moved = date !== visit.date;
  const { error } = await supabase
    .from("visits")
    .update({
      employee_id: employeeId || null,
      date,
      start_time: startTime,
      planned_minutes: Number(text(data, "planned_minutes")) || undefined,
      note: text(data, "note") || null,
      // Ursprünglichen Serientag merken, damit dort kein neuer Einsatz entsteht.
      moved_from: moved && visit.series_id ? (visit.moved_from ?? visit.date) : visit.moved_from,
    })
    .eq("id", visitId);
  if (error) return { error: error.code === "23505" ? "An dem Tag ist dieses Objekt aus derselben Serie schon geplant." : "Konnte nicht geändert werden." };
  refresh();
  return { ok: "Geändert." };
}

/** Einsatz im Wochenplan verschieben: anderer Tag und/oder anderer Mitarbeiter. */
export async function moveVisit(visitId: string, employeeId: string | null, date: string): Promise<FormState> {
  const { supabase } = await requireMe();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Ungültiger Tag." };
  const { data: visit } = await supabase.from("visits").select("date, status, series_id, moved_from").eq("id", visitId).maybeSingle();
  if (!visit) return { error: "Einsatz nicht gefunden." };
  if (visit.status !== "geplant") return { error: "Nur geplante Einsätze lassen sich verschieben." };

  const moved = date !== visit.date;
  const { error } = await supabase
    .from("visits")
    .update({
      employee_id: employeeId,
      date,
      // Ursprünglichen Serientag merken, damit dort kein neuer Einsatz entsteht.
      moved_from: moved && visit.series_id ? (visit.moved_from ?? visit.date) : visit.moved_from,
    })
    .eq("id", visitId);
  if (error) return { error: error.code === "23505" ? "An dem Tag ist dieses Objekt aus derselben Serie schon geplant." : "Konnte nicht verschoben werden." };
  refresh();
  return { ok: "Verschoben." };
}
