"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireMe } from "@/lib/supabase";
import type { FormState } from "@/components/action-form";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const optional = (data: FormData, key: string) => text(data, key) || null;
const date = (data: FormData, key: string) => (/^\d{4}-\d{2}-\d{2}$/.test(text(data, key)) ? text(data, key) : null);
const int = (data: FormData, key: string) => (text(data, key) === "" ? null : Math.round(Number(text(data, key))));

const KINDS = ["vertrag", "foto", "sonstiges"];
const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

async function office() {
  const me = await requireMe();
  if (!me.isOffice) throw new Error("Keine Berechtigung");
  return me;
}

export async function createCustomer(_: FormState, data: FormData): Promise<FormState> {
  const { supabase, profile, isOffice } = await requireMe();
  if (!isOffice) return { error: "Nur Büro und Chef können Kunden anlegen." };
  const name = text(data, "name");
  if (!name) return { error: "Bitte einen Namen angeben." };
  const { data: customer, error } = await supabase.from("customers").insert({ company_id: profile.company_id, name }).select("id").single();
  if (error) return { error: "Kunde konnte nicht angelegt werden." };
  redirect(`/kunden/${customer.id}`);
}

export async function saveCustomer(customerId: string, _: FormState, data: FormData): Promise<FormState> {
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return { error: "Keine Berechtigung." };
  const name = text(data, "name");
  if (!name) return { error: "Bitte einen Namen angeben." };
  const { error } = await supabase
    .from("customers")
    .update({ name, address: optional(data, "address"), email: optional(data, "email"), phone: optional(data, "phone"), notes: optional(data, "notes") })
    .eq("id", customerId);
  if (error) return { error: "Konnte nicht gespeichert werden." };
  refresh();
  return { ok: "Gespeichert." };
}

/** Datei in den Kunden-Ordner (Vertrag, Foto oder Sonstiges). Fotos verkleinert der Browser vorher. */
export async function uploadCustomerFile(customerId: string, _: FormState, data: FormData): Promise<FormState> {
  const { supabase, profile, isOffice, userId } = await requireMe();
  if (!isOffice) return { error: "Keine Berechtigung." };
  const files = data.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  const kind = KINDS.includes(text(data, "kind")) ? text(data, "kind") : "sonstiges";
  if (files.length === 0) return { error: "Bitte eine Datei auswählen." };
  for (const file of files) {
    if (!FILE_TYPES.includes(file.type)) return { error: "Bitte PDF oder Fotos (JPG, PNG) hochladen." };
    if (file.size > 9 * 1024 * 1024) return { error: `${file.name} ist zu groß (höchstens 9 MB).` };
  }
  let done = 0;
  for (const file of files) {
    const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${profile.company_id}/kunden/${customerId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("dokumente").upload(path, file, { contentType: file.type });
    if (uploadError) return { error: done ? `${done} hochgeladen, dann ging etwas schief.` : "Hochladen hat nicht geklappt." };
    const title = (files.length === 1 && text(data, "title")) || file.name.replace(/\.[^.]+$/, "") || "Datei";
    const { error } = await supabase.from("customer_files").insert({ company_id: profile.company_id, customer_id: customerId, kind, title: title.slice(0, 200), path, uploaded_by: userId });
    if (error) {
      await supabase.storage.from("dokumente").remove([path]);
      return { error: "Datei konnte nicht gespeichert werden." };
    }
    done += 1;
  }
  refresh();
  return { ok: done === 1 ? "Hochgeladen." : `${done} Dateien hochgeladen.` };
}

export async function deleteCustomerFile(id: string) {
  const { supabase } = await office();
  const { data: file } = await supabase.from("customer_files").select("path").eq("id", id).maybeSingle();
  if (!file) return;
  await supabase.from("customer_files").delete().eq("id", id);
  await supabase.storage.from("dokumente").remove([file.path]);
  refresh();
}

export async function saveContract(customerId: string, contractId: string | null, _: FormState, data: FormData): Promise<FormState> {
  const { supabase, profile, isOffice } = await requireMe();
  if (!isOffice) return { error: "Keine Berechtigung." };
  const title = text(data, "title");
  if (!title) return { error: "Bitte eine Bezeichnung angeben, z. B. Unterhaltsreinigung." };
  const notice = int(data, "notice_months");
  const renew = int(data, "auto_renew_months");
  if (notice !== null && !(notice >= 0 && notice <= 36)) return { error: "Kündigungsfrist bitte in Monaten (0 bis 36)." };
  if (renew !== null && !(renew >= 1 && renew <= 120)) return { error: "Verlängerung bitte in Monaten (1 bis 120)." };
  const row = {
    company_id: profile.company_id,
    customer_id: customerId,
    title,
    starts_on: date(data, "starts_on"),
    ends_on: date(data, "ends_on"),
    notice_months: notice,
    auto_renew_months: renew,
    remind_on: date(data, "remind_on"),
    remind_note: optional(data, "remind_note"),
    file_id: optional(data, "file_id"),
    // Geänderte Daten: Erinnerungen dürfen sich neu melden.
    notice_reminded_for: null,
    remind_sent_on: null,
  };
  const { error } = contractId ? await supabase.from("contracts").update(row).eq("id", contractId) : await supabase.from("contracts").insert(row);
  if (error) return { error: "Vertrag konnte nicht gespeichert werden." };
  refresh();
  return { ok: "Vertrag gespeichert." };
}

export async function deleteContract(id: string) {
  const { supabase } = await office();
  await supabase.from("contracts").delete().eq("id", id);
  refresh();
}
