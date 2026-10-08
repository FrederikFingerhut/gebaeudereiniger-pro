"use server";

import { redirect } from "next/navigation";
import { requireMe } from "@/lib/supabase";
import type { FormState } from "@/components/action-form";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const optional = (data: FormData, key: string) => text(data, key) || null;

/** Adresse in Koordinaten umwandeln (OpenStreetMap). Klappt das nicht, geht Stempeln per QR-Code. */
async function geocode(address: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Gebaeudereiniger-Pro/1.0" }, signal: AbortSignal.timeout(5000) });
    const [hit] = (await res.json()) as { lat: string; lon: string }[];
    return hit ? { latitude: Number(hit.lat), longitude: Number(hit.lon) } : null;
  } catch {
    return null;
  }
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
  const position = manual ?? (old && old.address === address && old.latitude !== null ? undefined : await geocode(address));

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
