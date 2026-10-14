"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireMe } from "@/lib/supabase";
import type { FormState } from "@/components/action-form";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const signature = (data: FormData, key: string) => {
  const value = text(data, key);
  return value.startsWith("data:image/png;base64,") && value.length < 300_000 ? value : null;
};

async function manager() {
  const me = await requireMe();
  if (me.profile.role === "mitarbeiter") throw new Error("Keine Berechtigung");
  return me;
}

export async function createKey(_: FormState, data: FormData): Promise<FormState> {
  const { supabase, profile } = await manager();
  const siteId = text(data, "site_id");
  const label = text(data, "label");
  const count = Math.round(Number(text(data, "count") || 1));
  if (!siteId || !label) return { error: "Bitte Objekt und Bezeichnung angeben." };
  if (!(count >= 1 && count <= 99)) return { error: "Anzahl bitte zwischen 1 und 99." };
  const { error } = await supabase.from("site_keys").insert({ company_id: profile.company_id, site_id: siteId, label, count, holder_name: null });
  if (error) return { error: "Schlüssel konnte nicht angelegt werden." };
  refresh();
  return { ok: `${label} angelegt. Mit „Übergeben“ protokollierst du, wer ihn bekommt.` };
}

export async function deleteKey(id: string) {
  const { supabase } = await manager();
  await supabase.from("site_keys").delete().eq("id", id);
  refresh();
}

/** Übergabe mit Unterschriften speichern und zum druckbaren Protokoll weiterleiten. */
export async function saveHandover(keyId: string, _: FormState, data: FormData): Promise<FormState> {
  const { supabase, profile } = await manager();
  const toProfile = text(data, "to_profile");
  let toName = text(data, "to_name");
  if (toProfile) {
    const { data: person } = await supabase.from("profiles").select("full_name").eq("id", toProfile).maybeSingle();
    if (!person) return { error: "Mitarbeiter nicht gefunden." };
    toName = person.full_name;
  }
  const fromName = text(data, "from_name");
  const count = Math.round(Number(text(data, "count") || 1));
  if (!fromName || !toName) return { error: "Bitte angeben, wer übergibt und wer bekommt." };
  if (!(count >= 1 && count <= 99)) return { error: "Anzahl bitte zwischen 1 und 99." };
  const signatureFrom = signature(data, "signature_from");
  const signatureTo = signature(data, "signature_to");
  if (!signatureFrom || !signatureTo) return { error: "Bitte beide unterschreiben lassen." };
  const { data: row, error } = await supabase
    .from("key_handovers")
    .insert({
      company_id: profile.company_id,
      key_id: keyId,
      from_name: fromName,
      to_name: toName,
      to_profile: toProfile || null,
      count,
      note: text(data, "note") || null,
      signature_from: signatureFrom,
      signature_to: signatureTo,
    })
    .select("id")
    .single();
  if (error) return { error: "Übergabe konnte nicht gespeichert werden." };
  redirect(`/schluessel/protokoll/${row.id}`);
}
