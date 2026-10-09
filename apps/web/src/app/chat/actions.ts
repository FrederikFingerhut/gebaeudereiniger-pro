"use server";

import { chatThreads, cleanChatText, type ChatMessage } from "@gp/shared";
import { requireMe } from "@/lib/supabase";

const MANAGERS = ["objektleiter", "buero", "chef"];

export type ThreadItem = { id: string; name: string; lastText: string | null; lastAt: string | null; lastMine: boolean; unread: number };
export type ChatLine = { id: string; body: string; createdAt: string; authorName: string | null; mine: boolean; fromEmployee: boolean };

async function requireManager() {
  const me = await requireMe();
  if (!MANAGERS.includes(me.profile.role)) throw new Error("Keine Berechtigung");
  return me;
}

/** Alle Mitarbeiter mit letzter Nachricht; Gespräche mit neuen Nachrichten zuerst. */
export async function loadThreads(): Promise<ThreadItem[]> {
  const { supabase, userId } = await requireManager();
  const [{ data: people }, { data: messages }, { data: reads }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("active", true).neq("role", "kunde").order("full_name"),
    supabase.from("chat_messages").select("id, employee_id, author_id, body, created_at").order("created_at", { ascending: false }).limit(1000),
    supabase.from("chat_reads").select("employee_id, last_read_at").eq("user_id", userId),
  ]);
  const threads = chatThreads((messages ?? []) as ChatMessage[], userId, Object.fromEntries((reads ?? []).map((r) => [r.employee_id, r.last_read_at])));
  const byId = new Map(threads.map((t) => [t.employeeId, t]));
  const items = (people ?? [])
    .filter((p) => p.id !== userId || byId.has(p.id))
    .map((p) => {
      const t = byId.get(p.id);
      return { id: p.id, name: p.full_name, lastText: t?.last.body ?? null, lastAt: t?.last.created_at ?? null, lastMine: t?.last.author_id === userId, unread: t?.unread ?? 0 };
    });
  // Mit Nachrichten (neueste zuerst), danach alle anderen nach Namen.
  return items.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? "") || a.name.localeCompare(b.name, "de"));
}

/** Gespräch mit einem Mitarbeiter; markiert es zugleich als gelesen. */
export async function loadConversation(employeeId: string): Promise<ChatLine[]> {
  const { supabase, userId, profile } = await requireManager();
  const { data } = await supabase
    .from("chat_messages")
    .select("id, author_id, body, created_at, profiles!chat_messages_author_id_fkey(full_name)")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(300);
  const now = new Date().toISOString();
  await Promise.all([
    supabase.from("chat_reads").upsert({ user_id: userId, employee_id: employeeId, company_id: profile.company_id, last_read_at: now }),
    supabase.from("notifications").update({ read_at: now }).eq("user_id", userId).eq("kind", "chat").eq("params->>thread", employeeId).is("read_at", null),
  ]);
  return (data ?? [])
    .map((m) => {
      const author = m.profiles as unknown as { full_name: string } | { full_name: string }[] | null;
      return {
        id: m.id,
        body: m.body,
        createdAt: m.created_at,
        authorName: (Array.isArray(author) ? author[0] : author)?.full_name ?? null,
        mine: m.author_id === userId,
        fromEmployee: m.author_id === employeeId,
      };
    })
    .reverse();
}

export async function sendMessage(employeeId: string, body: string): Promise<{ error?: string }> {
  const { supabase, userId, profile } = await requireManager();
  const text = cleanChatText(body);
  if (!text) return {};
  const { error } = await supabase.from("chat_messages").insert({ company_id: profile.company_id, employee_id: employeeId, author_id: userId, body: text });
  return error ? { error: "Nachricht konnte nicht gesendet werden." } : {};
}
