import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig, type ProfileRow } from "@gp/shared";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseConfig.url;
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY || supabaseConfig.publishableKey;

/** Datenbank-Zugang im Namen des angemeldeten Nutzers (Zugriffsregeln greifen). */
export async function db() {
  const store = await cookies();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // In Server Components darf man keine Cookies setzen; das erledigt proxy.ts.
        }
      },
    },
  });
}

/**
 * Voller Zugang ohne Zugriffsregeln. Nur auf dem Server und nur für Dinge,
 * die die Regeln nicht abdecken (z. B. Logins für Mitarbeiter anlegen).
 * Der Schlüssel steht nur in der Umgebung des Servers, nie im Code.
 */
export function adminDb() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY fehlt auf dem Server");
  return createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface Me {
  userId: string;
  profile: ProfileRow;
  isOffice: boolean;
}

/** Angemeldeter Nutzer mit Profil. Leitet zur Anmeldung bzw. Firmen-Anlage um. */
export async function requireMe(): Promise<Me & { supabase: Awaited<ReturnType<typeof db>> }> {
  const supabase = await db();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/anmelden");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile) redirect("/firma-anlegen");
  const p = profile as ProfileRow;
  // Kunden haben nur das Kundenportal.
  if (p.role === "kunde") redirect("/portal");
  return { supabase, userId, profile: p, isOffice: p.role === "buero" || p.role === "chef" };
}

/** Angemeldeter Kunde (Rolle "kunde") für das Kundenportal; alle anderen gehen ins Büro-Web. */
export async function requireCustomer() {
  const supabase = await db();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/anmelden");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile) redirect("/anmelden");
  const p = profile as ProfileRow;
  if (p.role !== "kunde" || !p.customer_id) redirect("/");
  return { supabase, userId, profile: p, customerId: p.customer_id };
}
