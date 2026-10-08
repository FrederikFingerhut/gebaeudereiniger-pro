"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import type { FormState } from "@/components/action-form";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

export async function signIn(_: FormState, data: FormData): Promise<FormState> {
  const supabase = await db();
  const { error } = await supabase.auth.signInWithPassword({ email: text(data, "email"), password: String(data.get("password") ?? "") });
  if (error) return { error: error.status === 400 ? "E-Mail oder Passwort stimmt nicht." : "Anmeldung gerade nicht möglich. Bitte später nochmal versuchen." };
  redirect("/");
}

export async function signUp(_: FormState, data: FormData): Promise<FormState> {
  const companyName = text(data, "company");
  const fullName = text(data, "name");
  const password = String(data.get("password") ?? "");
  if (!companyName || !fullName) return { error: "Bitte Firmenname und eigenen Namen angeben." };
  if (password.length < 8) return { error: "Das Passwort braucht mindestens 8 Zeichen." };

  const supabase = await db();
  const origin = (await headers()).get("origin") ?? "";
  const { data: result, error } = await supabase.auth.signUp({
    email: text(data, "email"),
    password,
    options: { data: { company_name: companyName, full_name: fullName }, emailRedirectTo: `${origin}/anmelden` },
  });
  if (error) return { error: `Registrierung fehlgeschlagen: ${error.message}` };
  if (!result.session) {
    return { ok: "Fast geschafft: Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail und melde dich dann an." };
  }
  const { error: companyError } = await supabase.rpc("create_company", { p_company_name: companyName, p_full_name: fullName });
  if (companyError) return { error: "Die Firma konnte nicht angelegt werden. Bitte nochmal versuchen." };
  redirect("/");
}

export async function createCompany(_: FormState, data: FormData): Promise<FormState> {
  const supabase = await db();
  const { error } = await supabase.rpc("create_company", { p_company_name: text(data, "company"), p_full_name: text(data, "name") });
  if (error) {
    if (error.message === "schon_in_firma") redirect("/");
    return { error: error.message === "name_fehlt" ? "Bitte Firmenname und eigenen Namen angeben." : "Die Firma konnte nicht angelegt werden." };
  }
  redirect("/");
}

export async function signOut() {
  const supabase = await db();
  await supabase.auth.signOut();
  redirect("/anmelden");
}
