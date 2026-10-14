"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { adminDb, requireMe } from "@/lib/supabase";
import type { FormState } from "@/components/action-form";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const optional = (data: FormData, key: string) => text(data, key) || null;

/**
 * Adresse in Koordinaten umwandeln (OpenStreetMap). Klappt das nicht, geht Stempeln per QR-Code.
 * `near`: Mitte der bisherigen Objekte. Treffer in der Nähe haben Vorrang, damit z. B.
 * „Poststraße 35“ ohne Ort nicht in einer anderen Stadt landet.
 */
async function geocode(address: string, near: { latitude: number; longitude: number } | null): Promise<{ latitude: number; longitude: number } | null> {
  const search = async (box: string) => {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de${box}&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Gebaeudereiniger-Pro/1.0" }, signal: AbortSignal.timeout(5000) });
    const [hit] = (await res.json()) as { lat: string; lon: string }[];
    return hit ? { latitude: Number(hit.lat), longitude: Number(hit.lon) } : null;
  };
  try {
    if (near) {
      const d = 0.8; // etwa 60–90 km in jede Richtung
      const hit = await search(`&bounded=1&viewbox=${near.longitude - d},${near.latitude + d},${near.longitude + d},${near.latitude - d}`);
      if (hit) return hit;
    }
    return await search("");
  } catch {
    return null;
  }
}

/** Mitte der vorhandenen Objekte (Median), ohne Ausreißer-Einfluss. */
async function companyCenter(supabase: Awaited<ReturnType<typeof requireMe>>["supabase"]) {
  const { data } = await supabase.from("sites").select("latitude, longitude").not("latitude", "is", null);
  const rows = (data ?? []) as { latitude: number; longitude: number }[];
  if (rows.length === 0) return null;
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return { latitude: median(rows.map((r) => r.latitude)), longitude: median(rows.map((r) => r.longitude)) };
}

function parseCoordinates(value: string): { latitude: number; longitude: number } | null | "invalid" {
  if (!value) return null;
  const [lat, lon] = value.split(/[,;\s]+/).map((n) => Number(n.replace(",", ".")));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return "invalid";
  return { latitude: lat, longitude: lon };
}

export async function saveSite(siteId: string | null, _: FormState, data: FormData): Promise<FormState> {
  const { supabase, profile, isOffice } = await requireMe();
  if (profile.role === "mitarbeiter") return { error: "Keine Berechtigung." };
  const companyId = profile.company_id;

  const name = text(data, "name");
  const address = text(data, "address");
  if (!name || !address) return { error: "Bitte Name und Adresse angeben." };
  const plannedMinutes = Number(text(data, "planned_minutes")) || 60;

  // Kunde: vorhandenen nehmen oder neu anlegen
  let customerId = text(data, "customer_id");
  if (!customerId || customerId === "neu") {
    const customerName = text(data, "customer_name") || name;
    const { data: customer, error } = await supabase.from("customers").insert({ company_id: companyId, name: customerName }).select("id").single();
    if (error) return { error: "Kunde konnte nicht angelegt werden." };
    customerId = customer.id;
  }

  // Standort: von Hand eingetragen, sonst aus der Adresse
  const manual = parseCoordinates(text(data, "coordinates"));
  if (manual === "invalid") return { error: "Koordinaten bitte so eingeben: 52.3759, 9.7320" };
  const { data: old } = siteId ? await supabase.from("sites").select("address, latitude").eq("id", siteId).single() : { data: null };
  const position = manual ?? (old && old.address === address && old.latitude !== null ? undefined : await geocode(address, await companyCenter(supabase)));

  const row = {
    company_id: companyId,
    customer_id: customerId,
    name,
    address,
    planned_minutes: plannedMinutes,
    geofence_radius_m: Number(text(data, "geofence_radius_m")) || 150,
    access_notes: optional(data, "access_notes"),
    contact: optional(data, "contact"),
    special_notes: optional(data, "special_notes"),
    ...(position === undefined ? {} : { latitude: position?.latitude ?? null, longitude: position?.longitude ?? null }),
  };
  const { data: site, error } = siteId
    ? await supabase.from("sites").update(row).eq("id", siteId).select("id").single()
    : await supabase.from("sites").insert(row).select("id").single();
  if (error) return { error: "Objekt konnte nicht gespeichert werden." };

  // Preis (nur Büro und Chef)
  if (isOffice) {
    const price = Math.round(Number(text(data, "price").replace(/\./g, "").replace(",", ".")) * 100) || 0;
    await supabase.from("site_billing").upsert({ site_id: site.id, company_id: companyId, billing_mode: text(data, "billing_mode") === "pro_einsatz" ? "pro_einsatz" : "pauschale", price_cents: price });
  }

  // Checkliste: eine Zeile je Punkt. Alte Punkte werden ausgeblendet, damit Haken alter Einsätze erhalten bleiben.
  const lines = text(data, "checklist").split("\n").map((l) => l.trim()).filter(Boolean);
  const { data: existing } = await supabase.from("checklist_items").select("id, title, active").eq("site_id", site.id);
  const keep = new Map((existing ?? []).map((i) => [(i.title as { de?: string }).de ?? "", i]));
  for (const item of existing ?? []) {
    if (item.active && !lines.includes((item.title as { de?: string }).de ?? "")) {
      await supabase.from("checklist_items").update({ active: false }).eq("id", item.id);
    }
  }
  for (const [position, line] of lines.entries()) {
    const item = keep.get(line);
    if (item) await supabase.from("checklist_items").update({ position, active: true }).eq("id", item.id);
    else await supabase.from("checklist_items").insert({ company_id: companyId, site_id: site.id, position, title: { de: line } });
  }

  if (!siteId) redirect(`/objekte/${site.id}`);
  return { ok: position === null ? "Gespeichert. Die Adresse wurde nicht gefunden: Stempeln geht nur per QR-Code, oder Koordinaten eintragen." : "Gespeichert." };
}

/** Zugang fürs Kundenportal anlegen: der Kunde sieht nur seine Objekte, Einsätze und Prüfberichte. */
export async function createCustomerLogin(_: FormState, data: FormData): Promise<FormState> {
  const { supabase, profile, isOffice } = await requireMe();
  if (!isOffice) return { error: "Nur Büro und Chef können Kundenzugänge anlegen." };
  const customerId = text(data, "customer_id");
  const fullName = text(data, "name");
  const email = text(data, "email").toLowerCase();
  const password = String(data.get("password") ?? "");
  if (!customerId || !fullName || !email) return { error: "Bitte Kunde, Name und E-Mail angeben." };
  if (password.length < 8) return { error: "Das Start-Passwort braucht mindestens 8 Zeichen." };
  const { data: customer } = await supabase.from("customers").select("id").eq("id", customerId).maybeSingle();
  if (!customer) return { error: "Kunde nicht gefunden." };

  let admin;
  try {
    admin = adminDb();
  } catch {
    return { error: "Auf dem Server fehlt noch der geheime Datenbank-Schlüssel." };
  }
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error) return { error: error.message.includes("already") ? "Diese E-Mail hat schon einen Zugang." : `Zugang konnte nicht angelegt werden: ${error.message}` };
  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: created.user.id, company_id: profile.company_id, full_name: fullName, role: "kunde", customer_id: customerId, language: "de" });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: "Kundenzugang konnte nicht angelegt werden." };
  }
  refresh();
  const host = (await headers()).get("host");
  return { ok: `Zugang für ${fullName} angelegt. Anmeldung unter ${host ? `https://${host}/anmelden` : "der Adresse des Büro-Webs"} mit ${email} und dem Start-Passwort.` };
}

/** Standort, an dem ein Mitarbeiter eingestempelt hat, als Objekt-Standort übernehmen. */
export async function adoptEntryLocation(entryId: string) {
  const { supabase, profile } = await requireMe();
  if (profile.role === "mitarbeiter") return;
  const { data: entry } = await supabase
    .from("time_entries")
    .select("clock_in_latitude, clock_in_longitude, visits(site_id)")
    .eq("id", entryId)
    .maybeSingle();
  const visit = entry?.visits as unknown as { site_id: string } | { site_id: string }[] | null;
  const siteId = Array.isArray(visit) ? visit[0]?.site_id : visit?.site_id;
  if (!entry || entry.clock_in_latitude === null || !siteId) return;
  await supabase.from("sites").update({ latitude: entry.clock_in_latitude, longitude: entry.clock_in_longitude }).eq("id", siteId);
  await supabase.from("time_entries").update({ off_site_checked: true }).eq("id", entryId);
  refresh();
}

export async function markOffSiteChecked(entryId: string) {
  const { supabase, profile } = await requireMe();
  if (profile.role === "mitarbeiter") return;
  await supabase.from("time_entries").update({ off_site_checked: true }).eq("id", entryId);
  refresh();
}
