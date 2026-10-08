"use server";

import { refresh } from "next/cache";
import { berlinDate } from "@gp/shared";
import { requireMe } from "@/lib/supabase";
import type { FormState } from "@/components/action-form";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

export async function createSeries(_: FormState, data: FormData): Promise<FormState> {
  const { supabase, profile } = await requireMe();
  const weekdays = data.getAll("weekday").map(Number).filter((n) => n >= 1 && n <= 7);
  const siteId = text(data, "site_id");
  const employeeId = text(data, "employee_id");
  const startTime = text(data, "start_time");
  if (!siteId || !employeeId || !startTime || weekdays.length === 0) return { error: "Bitte Objekt, Mitarbeiter, Uhrzeit und mindestens einen Wochentag wählen." };

  const { data: site } = await supabase.from("sites").select("planned_minutes").eq("id", siteId).single();
  const { error } = await supabase.from("visit_series").insert({
    company_id: profile.company_id,
    site_id: siteId,
    employee_id: employeeId,
    weekdays,
    start_time: startTime,
    planned_minutes: Number(text(data, "planned_minutes")) || site?.planned_minutes || 60,
    valid_from: text(data, "valid_from") || berlinDate(),
  });
  if (error) return { error: "Konnte nicht gespeichert werden." };
  refresh();
  return { ok: "Gespeichert. Die Einsätze erscheinen im Plan." };
}

/** Serie beenden: ab heute keine neuen Einsätze, offene künftige Einsätze werden gelöscht. */
export async function endSeries(seriesId: string) {
  const { supabase } = await requireMe();
  const today = berlinDate();
  await supabase.from("visit_series").update({ valid_until: today }).eq("id", seriesId);
  await supabase.from("visits").delete().eq("series_id", seriesId).gt("date", today).eq("status", "geplant");
  refresh();
}

/** Einsatz einem anderen Mitarbeiter geben (z. B. Vertretung bei Krankheit) oder ausfallen lassen. */
export async function reassignVisit(visitId: string, _: FormState, data: FormData): Promise<FormState> {
  const { supabase } = await requireMe();
  const employeeId = text(data, "employee_id");
  const { error } = employeeId === "ausfall"
    ? await supabase.from("visits").update({ status: "ausgefallen" }).eq("id", visitId)
    : await supabase.from("visits").update({ employee_id: employeeId, status: "geplant" }).eq("id", visitId);
  if (error) return { error: "Konnte nicht geändert werden." };
  refresh();
  return { ok: "Geändert." };
}
