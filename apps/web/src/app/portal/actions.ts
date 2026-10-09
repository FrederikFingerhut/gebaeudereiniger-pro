"use server";

import { refresh } from "next/cache";
import { requireCustomer } from "@/lib/supabase";
import type { FormState } from "@/components/action-form";

/** Reklamation aus dem Kundenportal: landet beim Büro unter den Meldungen. */
export async function sendComplaint(_: FormState, data: FormData): Promise<FormState> {
  const { supabase, profile, userId } = await requireCustomer();
  const siteId = String(data.get("site_id") ?? "");
  const text = String(data.get("text") ?? "").trim();
  if (!siteId || !text) return { error: "Bitte Objekt wählen und kurz beschreiben, was nicht gepasst hat." };

  const paths: string[] = [];
  const photos = data.getAll("photo").filter((f): f is File => f instanceof File && f.size > 0 && f.type.startsWith("image/")).slice(0, 4);
  for (const photo of photos) {
    const path = `${profile.company_id}/${userId}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from("fotos").upload(path, photo, { contentType: "image/jpeg" });
    if (!error) paths.push(path);
  }
  const { error } = await supabase
    .from("reports")
    .insert({ company_id: profile.company_id, site_id: siteId, author_id: userId, kind: "reklamation", text, photo_paths: paths });
  if (error) return { error: "Senden hat nicht geklappt. Bitte noch einmal versuchen." };
  refresh();
  return { ok: "Danke! Wir kümmern uns darum und melden uns." };
}
