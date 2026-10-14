// Übersetzungs-Funktion (Supabase Edge Function) für den Chat.
// Die App schickt Nachrichten-IDs und die Zielsprache. Die Funktion prüft, ob der Aufrufer
// die Nachrichten lesen darf, übersetzt fehlende mit dem DeepL-Schlüssel der Firma und
// speichert das Ergebnis in chat_translations, damit jede Nachricht nur einmal übersetzt wird.
//
// Hochladen: scripts/deploy-translate.sh

import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const targets: Record<string, string> = { de: "DE", en: "EN-GB", ru: "RU", uk: "UK" };
const MANAGERS = ["objektleiter", "buero", "chef"];
const MAX_IDS = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(token);
  if (!auth?.user) return json({ error: "nicht_angemeldet" }, 401);

  const { ids, lang } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids) || !targets[lang]) return json({ error: "ungueltig" }, 400);
  const wanted = [...new Set(ids.filter((id) => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id)))].slice(0, MAX_IDS);
  if (wanted.length === 0) return json({ translations: {} });

  const { data: me } = await db.from("profiles").select("company_id, role, active").eq("id", auth.user.id).maybeSingle();
  if (!me?.active || me.role === "kunde") return json({ error: "keine_berechtigung" }, 403);

  // Nur Nachrichten der eigenen Firma, die der Aufrufer auch im Chat sieht.
  let query = db.from("chat_messages").select("id, body, author_id").eq("company_id", me.company_id).in("id", wanted);
  if (!MANAGERS.includes(me.role)) query = query.eq("employee_id", auth.user.id);
  const { data: messages } = await query;
  if (!messages?.length) return json({ translations: {} });

  const translations: Record<string, string | null> = {};
  const { data: cached } = await db.from("chat_translations").select("message_id, body").eq("lang", lang).in("message_id", messages.map((m) => m.id));
  for (const c of cached ?? []) translations[c.message_id] = c.body;
  const missing = messages.filter((m) => !(m.id in translations));
  if (missing.length === 0) return json({ translations });

  const { data: integration } = await db.from("company_integrations").select("deepl_api_key").eq("company_id", me.company_id).maybeSingle();
  const key = integration?.deepl_api_key;
  if (!key) return json({ translations, missingKey: true });

  // Kostenlose DeepL-Schlüssel enden auf ":fx" und laufen über einen eigenen Server.
  const host = key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const res = await fetch(`${host}/v2/translate`, {
    method: "POST",
    headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: missing.map((m) => m.body), target_lang: targets[lang] }),
  });
  if (!res.ok) return json({ translations, error: res.status === 403 ? "schluessel_falsch" : res.status === 456 ? "kontingent" : "deepl" });
  const result = (await res.json()) as { translations: { detected_source_language: string; text: string }[] };

  const rows = missing.map((m, i) => {
    const t = result.translations[i];
    // Schon in der Zielsprache: nichts anzeigen.
    const same = !t || t.detected_source_language.toUpperCase() === targets[lang].slice(0, 2) || t.text.trim() === m.body.trim();
    translations[m.id] = same ? null : t.text;
    return { message_id: m.id, lang, company_id: me.company_id, body: translations[m.id] };
  });
  await db.from("chat_translations").upsert(rows, { onConflict: "message_id,lang", ignoreDuplicates: true });
  return json({ translations });
});
