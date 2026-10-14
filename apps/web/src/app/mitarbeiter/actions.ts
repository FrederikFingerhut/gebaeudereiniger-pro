"use server";

import { refresh } from "next/cache";
import { adminDb, requireMe } from "@/lib/supabase";
import { sendWelcomeMail } from "@/lib/welcome";
import type { FormState } from "@/components/action-form";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const ROLES = ["mitarbeiter", "objektleiter", "buero", "chef"];
const LANGUAGES = ["de", "en", "ru", "uk"];

const number = (data: FormData, key: string) => {
  const value = text(data, key).replace(",", ".");
  return value === "" ? null : Number(value);
};

/**
 * Legt einen Login für einen Mitarbeiter an. Mit Willkommens-Mail legt er sein
 * Passwort selbst fest; sonst gibt das Büro ihm E-Mail und Start-Passwort.
 */
export async function createEmployee(_: FormState, data: FormData): Promise<FormState> {
  const { profile, isOffice } = await requireMe();
  if (!isOffice) return { error: "Nur Büro und Chef können Mitarbeiter anlegen." };
  const fullName = text(data, "name");
  const email = text(data, "email").toLowerCase();
  const welcome = data.get("welcome") === "on";
  const password = String(data.get("password") ?? "");
  const role = ROLES.includes(text(data, "role")) ? text(data, "role") : "mitarbeiter";
  const language = LANGUAGES.includes(text(data, "language")) ? text(data, "language") : "de";
  const weeklyHours = number(data, "weekly_hours");
  const vacationDays = number(data, "vacation_days") ?? 0;
  if (!fullName || !email) return { error: "Bitte Name und E-Mail angeben." };
  if (!welcome && password.length < 8) return { error: "Ohne Willkommens-Mail braucht es ein Start-Passwort mit mindestens 8 Zeichen." };
  if (password && password.length < 8) return { error: "Das Start-Passwort braucht mindestens 8 Zeichen." };
  if ((weeklyHours !== null && !(weeklyHours >= 0 && weeklyHours <= 60)) || !(vacationDays >= 0 && vacationDays <= 60)) {
    return { error: "Bitte Wochenstunden und Urlaubstage zwischen 0 und 60 angeben." };
  }
  if (role === "chef" && profile.role !== "chef") return { error: "Nur der Chef kann weitere Chefs anlegen." };

  let admin;
  try {
    admin = adminDb();
  } catch {
    return { error: "Auf dem Server fehlt noch der geheime Datenbank-Schlüssel." };
  }
  // Ohne Start-Passwort ein zufälliges, das niemand kennt; das eigene setzt er über die Mail.
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: password || `${crypto.randomUUID()}Aa1!`,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) return { error: error.message.includes("already") ? "Diese E-Mail hat schon einen Zugang." : `Zugang konnte nicht angelegt werden: ${error.message}` };

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    company_id: profile.company_id,
    full_name: fullName,
    role,
    language,
    phone: text(data, "phone") || null,
    weekly_hours: weeklyHours,
    vacation_days: vacationDays,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: "Mitarbeiter konnte nicht angelegt werden." };
  }
  refresh();
  if (welcome) {
    const mailError = await sendWelcomeMail(admin, created.user.id, email, fullName);
    if (mailError) return { error: `${fullName} ist angelegt, aber: ${mailError} Du kannst sie bei der Person erneut senden.` };
    return { ok: `${fullName} ist angelegt. Die Willkommens-Mail ist an ${email} unterwegs.` };
  }
  return { ok: `${fullName} ist angelegt. Anmeldung in der App mit ${email} und dem Start-Passwort.` };
}

/** Willkommens-Mail (erneut) schicken, z. B. wenn sich jemand noch nie angemeldet hat. */
export async function resendWelcome(userId: string, _: FormState): Promise<FormState> {
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return { error: "Keine Berechtigung." };
  const { data: target } = await supabase.from("profiles").select("id, full_name").eq("id", userId).maybeSingle();
  if (!target) return { error: "Mitarbeiter nicht gefunden." };
  const admin = adminDb();
  const { data: user } = await admin.auth.admin.getUserById(userId);
  if (!user.user?.email) return { error: "Für diese Person ist keine E-Mail hinterlegt." };
  const mailError = await sendWelcomeMail(admin, userId, user.user.email, target.full_name);
  return mailError ? { error: mailError } : { ok: `Willkommens-Mail an ${user.user.email} geschickt.` };
}

/** Wochenstunden, Urlaub, Telefon und Sprache eines Mitarbeiters. */
export async function saveEmployee(userId: string, _: FormState, data: FormData): Promise<FormState> {
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return { error: "Keine Berechtigung." };
  const weeklyHours = number(data, "weekly_hours");
  const vacationDays = number(data, "vacation_days") ?? 0;
  if ((weeklyHours !== null && !(weeklyHours >= 0 && weeklyHours <= 60)) || !(vacationDays >= 0 && vacationDays <= 60)) {
    return { error: "Bitte Wochenstunden und Urlaubstage zwischen 0 und 60 angeben." };
  }
  const language = LANGUAGES.includes(text(data, "language")) ? text(data, "language") : "de";
  const { error } = await supabase
    .from("profiles")
    .update({ weekly_hours: weeklyHours, vacation_days: vacationDays, phone: text(data, "phone") || null, language })
    .eq("id", userId);
  if (error) return { error: "Konnte nicht gespeichert werden." };
  refresh();
  return { ok: "Gespeichert." };
}

/** Lohnabrechnung (PDF) für einen Monat hochladen; eine vorhandene wird ersetzt. */
export async function uploadPayslip(userId: string, _: FormState, data: FormData): Promise<FormState> {
  const { supabase, isOffice, profile } = await requireMe();
  if (!isOffice) return { error: "Keine Berechtigung." };
  const month = text(data, "month");
  const file = data.get("file");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { error: "Bitte den Monat wählen." };
  if (!(file instanceof File) || file.size === 0) return { error: "Bitte eine PDF-Datei auswählen." };
  if (file.type !== "application/pdf") return { error: "Bitte die Lohnabrechnung als PDF hochladen." };
  if (file.size > 8 * 1024 * 1024) return { error: "Die Datei ist zu groß (höchstens 8 MB)." };

  const path = `${profile.company_id}/lohn/${userId}/${month}-${crypto.randomUUID().slice(0, 8)}.pdf`;
  const { error: uploadError } = await supabase.storage.from("dokumente").upload(path, file, { contentType: "application/pdf" });
  if (uploadError) return { error: "Hochladen hat nicht geklappt." };

  const period = `${month}-01`;
  const { data: old } = await supabase.from("payslips").select("id, path").eq("employee_id", userId).eq("period", period).maybeSingle();
  const { error } = old
    ? await supabase.from("payslips").update({ path, created_at: new Date().toISOString() }).eq("id", old.id)
    : await supabase.from("payslips").insert({ company_id: profile.company_id, employee_id: userId, period, path });
  if (error) {
    await supabase.storage.from("dokumente").remove([path]);
    return { error: "Lohnabrechnung konnte nicht gespeichert werden." };
  }
  if (old) await supabase.storage.from("dokumente").remove([old.path]);
  refresh();
  return { ok: old ? "Lohnabrechnung ersetzt." : "Hochgeladen. Der Mitarbeiter bekommt eine Nachricht aufs Handy." };
}

export async function deletePayslip(id: string) {
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return;
  const { data: slip } = await supabase.from("payslips").select("path").eq("id", id).maybeSingle();
  if (!slip) return;
  await supabase.from("payslips").delete().eq("id", id);
  await supabase.storage.from("dokumente").remove([slip.path]);
  refresh();
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
