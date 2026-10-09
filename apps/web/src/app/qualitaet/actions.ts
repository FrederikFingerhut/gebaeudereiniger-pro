"use server";

import { redirect } from "next/navigation";
import { parseInspectionItems, type InspectionItem } from "@gp/shared";
import { requireMe } from "@/lib/supabase";
import type { FormState } from "@/components/action-form";

const MAX_PHOTOS = 8;

/** Prüfbericht speichern: Noten je Bereich, Bemerkung und Fotos (im Browser schon verkleinert). */
export async function saveInspection(_: FormState, data: FormData): Promise<FormState> {
  const { supabase, profile, userId } = await requireMe();
  if (!["objektleiter", "buero", "chef"].includes(profile.role)) return { error: "Keine Berechtigung." };

  const siteId = String(data.get("site_id") ?? "");
  let items: InspectionItem[];
  try {
    items = parseInspectionItems(JSON.parse(String(data.get("items") ?? "[]")));
  } catch {
    items = [];
  }
  if (!siteId) return { error: "Bitte ein Objekt wählen." };
  if (items.length === 0) return { error: "Bitte mindestens einen Bereich bewerten." };

  const photos = data.getAll("photo").filter((f): f is File => f instanceof File && f.size > 0).slice(0, MAX_PHOTOS);
  const paths: string[] = [];
  for (const photo of photos) {
    if (!photo.type.startsWith("image/")) continue;
    const path = `${profile.company_id}/${userId}/pruefung-${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from("fotos").upload(path, photo, { contentType: "image/jpeg" });
    if (!error) paths.push(path);
  }

  const { data: row, error } = await supabase
    .from("inspections")
    .insert({
      company_id: profile.company_id,
      site_id: siteId,
      inspector_id: userId,
      date: String(data.get("date") || "") || undefined,
      items,
      note: String(data.get("note") ?? "").trim() || null,
      photo_paths: paths,
    })
    .select("id")
    .single();
  if (error || !row) return { error: "Speichern hat nicht geklappt." };
  redirect(`/qualitaet/${row.id}`);
}

export async function deleteInspection(id: string) {
  const { supabase } = await requireMe();
  const { data } = await supabase.from("inspections").select("photo_paths").eq("id", id).maybeSingle();
  if (data?.photo_paths?.length) await supabase.storage.from("fotos").remove(data.photo_paths);
  await supabase.from("inspections").delete().eq("id", id);
  redirect("/qualitaet");
}
