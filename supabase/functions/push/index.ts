// Push-Funktion (Supabase Edge Function): Die Datenbank ruft sie bei jeder neuen
// Benachrichtigung auf (Trigger notifications_push). Sie schreibt den Text in der
// Sprache des Empfängers und schickt ihn per Web Push an alle seine Geräte.
//
// Geheimnisse in Supabase: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// Hochladen: scripts/deploy-push.sh

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { notificationText } from "./shared/notifications.ts";
import type { Language } from "./shared/types.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return json({ ok: false }, 400);

  // Nur frische, noch nicht verschickte Nachrichten; pushed_at gleich setzen, damit
  // ein zweiter Aufruf mit derselben ID nichts mehr verschickt.
  const { data: n } = await db
    .from("notifications")
    .update({ pushed_at: new Date().toISOString() })
    .eq("id", id)
    .is("pushed_at", null)
    .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString())
    .select("user_id, kind, params, url")
    .maybeSingle();
  if (!n) return json({ ok: false, reason: "not_found" }, 404);

  const [{ data: profile }, { data: subs }] = await Promise.all([
    db.from("profiles").select("language").eq("id", n.user_id).maybeSingle(),
    db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", n.user_id),
  ]);
  const { title, body } = notificationText((profile?.language ?? "de") as Language, n.kind, n.params ?? {});
  const payload = JSON.stringify({ title, body, url: n.url ?? "/" });

  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 3600 });
      sent++;
    } catch (e) {
      // Gerät abgemeldet oder App gelöscht: Anmeldung entfernen.
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
    }
  }
  return json({ ok: true, sent });
});
