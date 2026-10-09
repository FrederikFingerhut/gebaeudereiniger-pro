"use server";

import { notificationText } from "@gp/shared";
import { requireMe } from "@/lib/supabase";

export type BellItem = { id: string; title: string; body: string; url: string | null; createdAt: string; read: boolean };

/** Letzte Nachrichten des angemeldeten Nutzers, fertig als deutscher Text. */
export async function loadBell(): Promise<{ unread: number; items: BellItem[] }> {
  const { supabase, userId } = await requireMe();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, params, url, created_at, read_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  const items = (data ?? []).map((n) => ({
    id: n.id,
    ...notificationText("de", n.kind, (n.params ?? {}) as Record<string, unknown>),
    url: n.url,
    createdAt: n.created_at,
    read: !!n.read_at,
  }));
  return { unread: items.filter((i) => !i.read).length, items };
}

export async function markBellRead() {
  const { supabase, userId } = await requireMe();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
}

export async function savePushSubscription(endpoint: string, p256dh: string, auth: string): Promise<boolean> {
  const { supabase } = await requireMe();
  const { error } = await supabase.rpc("save_push_subscription", { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth });
  return !error;
}
