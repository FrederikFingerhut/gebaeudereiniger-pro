"use server";

import { refresh } from "next/cache";
import { requireMe } from "@/lib/supabase";
import type { FormState } from "@/components/action-form";

async function manager() {
  const me = await requireMe();
  if (!["objektleiter", "buero", "chef"].includes(me.profile.role)) throw new Error("Keine Berechtigung");
  return me;
}

/** Mehrere Materialien auf einmal anlegen, eins pro Zeile. */
export async function addMaterial(siteId: string, _: FormState, data: FormData): Promise<FormState> {
  const { supabase, profile } = await manager();
  const names = String(data.get("names") ?? "")
    .split("\n")
    .map((n) => n.trim().slice(0, 120))
    .filter(Boolean);
  if (names.length === 0) return { error: "Bitte mindestens ein Material eintragen." };
  const { count } = await supabase.from("material_items").select("id", { count: "exact", head: true }).eq("site_id", siteId);
  const { error } = await supabase
    .from("material_items")
    .insert(names.map((name, i) => ({ company_id: profile.company_id, site_id: siteId, name, position: (count ?? 0) + i })));
  if (error) return { error: "Material konnte nicht gespeichert werden." };
  refresh();
  return { ok: names.length === 1 ? `${names[0]} hinzugefügt.` : `${names.length} Materialien hinzugefügt.` };
}

export async function deleteMaterial(id: string) {
  const { supabase } = await manager();
  await supabase.from("material_items").delete().eq("id", id);
  refresh();
}

/** Nachgefüllt: Stand zurück auf „da“. */
export async function refillMaterial(id: string) {
  const { supabase } = await manager();
  await supabase.rpc("set_material_status", { p_item: id, p_status: "ok" });
  refresh();
}
