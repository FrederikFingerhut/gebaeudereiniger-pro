import { createClient } from "@supabase/supabase-js";
import { appUrls } from "@gp/shared";
import { supabaseKey, supabaseUrl, type adminDb } from "./supabase";

/**
 * Willkommens-Mail: Link zum Passwort-Festlegen plus Adresse der Mitarbeiter-App.
 * Technisch die „Passwort vergessen“-Mail; die Markierung `welcome` schaltet die
 * Vorlage in Supabase auf den Willkommens-Text um (supabase/mail/vorlagen.mjs).
 */
export async function sendWelcomeMail(admin: ReturnType<typeof adminDb>, userId: string, email: string, fullName: string): Promise<string | null> {
  const { error: metaError } = await admin.auth.admin.updateUserById(userId, { user_metadata: { welcome: true, full_name: fullName } });
  if (metaError) return "Die Willkommens-Mail konnte nicht vorbereitet werden.";
  // Eigener Zugang ohne Sitzung, damit die Anmeldung des Büros unberührt bleibt.
  const anon = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await anon.auth.resetPasswordForEmail(email, { redirectTo: `${appUrls.web}/auth/bestaetigen` });
  if (error?.status === 429) return "Gerade wurden zu viele Mails verschickt. Bitte in ein paar Minuten nochmal.";
  if (error) return "Die Willkommens-Mail konnte nicht verschickt werden.";
  return null;
}
