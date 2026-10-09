"use server";

import { refresh } from "next/cache";
import { parseEuro, priceGuideUnits, type PriceGuideUnit } from "@gp/shared";
import { requireMe } from "@/lib/supabase";
import type { FormState } from "@/components/action-form";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const percent = (data: FormData, key: string) => {
  const n = Number(text(data, key).replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 1000 ? n : null;
};

/** Lohn und Zuschläge als Standard für alle Kalkulationen speichern. */
export async function saveCalcSettings(_: FormState, data: FormData): Promise<FormState> {
  const { supabase, profile, isOffice } = await requireMe();
  if (!isOffice) return { error: "Keine Berechtigung." };
  const wage = parseEuro(text(data, "wage"));
  const values = ["ancillary", "material", "overhead", "profit"].map((k) => percent(data, k));
  if (wage === null || values.some((v) => v === null)) return { error: "Bitte Lohn und Zuschläge als Zahlen eingeben." };
  const [ancillary, material, overhead, profit] = values as number[];
  const { error } = await supabase.from("calc_settings").upsert({
    company_id: profile.company_id,
    wage_cents: wage,
    ancillary_percent: ancillary,
    material_percent: material,
    overhead_percent: overhead,
    profit_percent: profit,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: "Speichern hat nicht geklappt." };
  refresh();
  return { ok: "Als Standard gespeichert." };
}

export async function addPriceGuide(_: FormState, data: FormData): Promise<FormState> {
  const { supabase, profile, isOffice } = await requireMe();
  if (!isOffice) return { error: "Keine Berechtigung." };
  const title = text(data, "title");
  const unit = text(data, "unit") as PriceGuideUnit;
  const price = parseEuro(text(data, "price"));
  if (!title || price === null || !(unit in priceGuideUnits)) return { error: "Bitte Leistung, Einheit und Preis angeben." };
  const { error } = await supabase.from("price_guides").insert({ company_id: profile.company_id, title, unit, price_cents: price, note: text(data, "note") || null });
  if (error) return { error: "Speichern hat nicht geklappt." };
  refresh();
  return { ok: `„${title}“ gespeichert.` };
}

export async function deletePriceGuide(id: string) {
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return;
  await supabase.from("price_guides").delete().eq("id", id);
  refresh();
}
