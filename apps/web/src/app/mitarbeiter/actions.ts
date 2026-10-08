"use server";

import { refresh } from "next/cache";
import { adminDb, requireMe } from "@/lib/supabase";
import type { FormState } from "@/components/action-form";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const ROLES = ["mitarbeiter", "objektleiter", "buero", "chef"];
const LANGUAGES = ["de", "en", "ru", "uk"];

/** Legt einen Login für einen Mitarbeiter an. Das Büro gibt ihm E-Mail und Start-Passwort. */
export async function createEmployee(_: FormState, data: FormData): Promise<FormState> {
  const { profile, isOffice } = await requireMe();
  if (!isOffice) return { error: "Nur Büro und Chef können Mitarbeiter anlegen." };
  const fullName = text(data, "name");
  const email = text(data, "email").toLowerCase();
  const password = String(data.get("password") ?? "");
  const role = ROLES.includes(text(data, "role")) ? text(data, "role") : "mitarbeiter";
  const language = LANGUAGES.includes(text(data, "language")) ? text(data, "language") : "de";
  if (!fullName || !email) return { error: "Bitte Name und E-Mail angeben." };
  if (password.length < 8) return { error: "Das Start-Passwort braucht mindestens 8 Zeichen." };
  if (role === "chef" && profile.role !== "chef") return { error: "Nur der Chef kann weitere Chefs anlegen." };

  let admin;
  try {
    admin = adminDb();
  } catch {
    return { error: "Auf dem Server fehlt noch der geheime Datenbank-Schlüssel." };
  }
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error) return { error: error.message.includes("already") ? "Diese E-Mail hat schon einen Zugang." : `Zugang konnte nicht angelegt werden: ${error.message}` };

  const { error: profileError } = await admin.from("profiles").insert({ id: created.user.id, company_id: profile.company_id, full_name: fullName, role, language, phone: text(data, "phone") || null });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: "Mitarbeiter konnte nicht angelegt werden." };
  }
  refresh();
  return { ok: `${fullName} ist angelegt. Anmeldung in der App mit ${email} und dem Start-Passwort.` };
}

export async function setPassword(userId: string, _: FormState, data: FormData): Promise<FormState> {
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return { error: "Keine Berechtigung." };
  const password = String(data.get("password") ?? "");
  if (password.length < 8) return { error: "Mindestens 8 Zeichen." };
  // Nur Mitarbeiter der eigenen Firma (die Zugriffsregeln zeigen nur diese).
  const { data: target } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!target) return { error: "Mitarbeiter nicht gefunden." };
  const { error } = await adminDb().auth.admin.updateUserById(userId, { password });
  return error ? { error: "Passwort konnte nicht geändert werden." } : { ok: "Neues Passwort gesetzt." };
}

export async function setActive(userId: string, active: boolean) {
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return;
  await supabase.from("profiles").update({ active }).eq("id", userId);
  // Deaktivierte Mitarbeiter können sich nicht mehr anmelden.
  try {
    await adminDb().auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
  } catch {
    // Ohne geheimen Schlüssel bleibt nur die Markierung im Profil.
  }
  refresh();
}

export async function decideAbsence(id: string, approved: boolean) {
  const { supabase } = await requireMe();
  await supabase.from("absences").update({ approved }).eq("id", id);
  refresh();
}
